import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
  calculateRealisticPnL,
  updateTrailingStop,
  checkPartialExits,
  kellyCriterion,
  checkPortfolioRisk,
  type PartialExit as EnginePartialExit,
} from '@/lib/trading-engine';
import {
  auditTradeOpened,
  auditTradeClosed,
  auditTradeCancelled,
  auditDrawdownWarning,
} from '@/lib/audit';

const DATA_PATH = path.join(process.cwd(), 'trader-data.json');
const THINKING_PATH = path.join(process.cwd(), 'trader-thinking.json');

// ============================================
// TYPES
// ============================================

interface Trade {
  id: string;
  coinId: string;
  coinSymbol: string;
  direction: 'LONG' | 'SHORT';
  entryType: 'LIMIT' | 'MARKET';
  entry: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  confidence: number;
  timeframe: string;
  entryReason: string;
  reasons: string[];
  leverage: number;
  positionSize: number;
  quantity: number;
  timestamp: number;
  entryReached: boolean;
  enteredAt: number | null;
  resolved: boolean;
  result: 'WIN' | 'LOSS' | 'EXPIRED' | null;
  exitPrice: number | null;
  exitReason: string | null;
  closedAt: number | null;
  pnlUSDT: number | null;
  pnlPct: number | null;
  pointsChange: number | null;
  // Advanced trading engine fields (optional — disabled by default)
  trailingStop?: boolean;
  trailingStepPct?: number;
  highestPrice?: number;
  lowestPrice?: number;
  partialExits?: string;       // JSON string of EnginePartialExit[]
  remainingQuantity?: number;  // remaining after partial exits
}

interface DebtEntry {
  timestamp: number;
  amount: number;
  remainingOwed: number;
  label: string;
}

interface DepositSnapshot {
  timestamp: number;
  balance: number;
  equity: number;
}

// ============================================
// ADAPTIVE LEARNING — Lessons from mistakes
// ============================================

interface Lesson {
  type: string;           // e.g. 'sl_too_close', 'bad_coin', 'low_confidence', 'counter_trend', 'limit_expired'
  description: string;    // Human-readable explanation
  coinId?: string;        // Specific coin if applicable
  direction?: 'LONG' | 'SHORT';
  value?: number;         // Numeric value (e.g. SL distance %)
  timestamp: number;
  tradeId: string;
  severity: 'low' | 'medium' | 'high'; // How important this lesson is
}

interface AdaptiveParams {
  minSlDistancePct: number;    // Minimum SL distance as % of entry (learned from SL-too-close mistakes)
  minConfidence: number;       // Minimum confidence to open a trade (learned from low-confidence losses)
  avoidCoins: string[];        // Coins to avoid (stablecoins, consistently losing)
  minRr: number;              // Minimum risk/reward ratio (learned from bad R:R trades)
  counterTrendPenalty: number; // How much to penalize counter-trend trades (0-1, learned)
  limitExpiryHours: number;   // How long to wait for LIMIT entry before it expires
  marketEntryConditions: string[]; // When MARKET entry is preferred over LIMIT
  lessons: Lesson[];          // All learned lessons
  lessonsVersion: number;     // Incremented when new lessons are added
}

const DEFAULT_ADAPTIVE: AdaptiveParams = {
  minSlDistancePct: 1.0,     // Start at 1.0% — 0.5% is noise for crypto, SL gets hit by normal volatility
  minConfidence: 60,          // Start at 60% — avoid low-confidence noise
  avoidCoins: ['tether', 'usd-coin', 'dai', 'binance-usd', 'staked-ether', 'wrapped-bitcoin', 'usds'], // Stablecoins — no volatility = no intraday profit
  minRr: 1.5,
  counterTrendPenalty: 0.1,
  limitExpiryHours: 2,       // 2h for LIMIT — don't lock capital for too long
  marketEntryConditions: ['strong_momentum', 'breakout', 'high_confidence'],
  lessons: [],
  lessonsVersion: 0,
};

// ============================================
// INTRADAY TIME CONSTANTS
// ============================================

const MAX_TRADE_AGE = 4 * 60 * 60 * 1000;   // 4h — intraday trades must resolve within this
const STALE_TRADE_AGE = 3 * 60 * 60 * 1000;  // 3h — close stale positions at market price
const LIMIT_EXPIRY_AGE = 2 * 60 * 60 * 1000; // 2h — LIMIT orders that didn't trigger
const MAX_POSITION_AGE = 24 * 60 * 60 * 1000; // 24h — absolute maximum (safety net)
const MAX_MARGIN_PCT = 0.08;                   // 8% of free balance as margin per trade (allows up to 5 concurrent positions)

interface TraderData {
  initialDeposit: number;
  balance: number;
  totalTrades: number;
  wins: number;
  losses: number;
  expired: number;
  score: number;
  winRate: number;
  avgPnl: number;
  streak: number;
  bestTrade: number;
  worstTrade: number;
  totalPnl: number;
  level: string;
  levelEmoji: string;
  riskPerTrade: number;
  defaultLeverage: number;
  trades: Trade[];
  depositHistory: DepositSnapshot[];
  lastUpdated: number;
  totalDebt: number;
  debtHistory: DebtEntry[];
  totalRepaid: number;
  // Adaptive learning
  adaptive: AdaptiveParams;
}

// ============================================
// HELPERS
// ============================================

function getLevel(score: number): { level: string; emoji: string } {
  if (score >= 500) return { level: 'Легенда', emoji: '👑' };
  if (score >= 300) return { level: 'Мастер', emoji: '🏆' };
  if (score >= 150) return { level: 'Профессионал', emoji: '⭐' };
  if (score >= 50)  return { level: 'Трейдер', emoji: '📊' };
  return { level: 'Новичок', emoji: '🌱' };
}

async function loadData(): Promise<TraderData> {
  const defaultData: TraderData = {
    initialDeposit: 100,
    balance: 100,
    totalTrades: 0, wins: 0, losses: 0, expired: 0,
    score: 0, winRate: 0, avgPnl: 0, streak: 0,
    bestTrade: 0, worstTrade: 0, totalPnl: 0,
    level: 'Новичок', levelEmoji: '🌱',
    riskPerTrade: 5, defaultLeverage: 3,
    trades: [],
    depositHistory: [{ timestamp: Date.now(), balance: 100, equity: 100 }],
    lastUpdated: Date.now(),
    totalDebt: 0, debtHistory: [], totalRepaid: 0,
    adaptive: { ...DEFAULT_ADAPTIVE, lessons: [] },
  };
  try {
    if (existsSync(DATA_PATH)) {
      const raw = await readFile(DATA_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...defaultData, ...parsed,
        depositHistory: parsed.depositHistory || defaultData.depositHistory,
        debtHistory: parsed.debtHistory || [],
        totalDebt: parsed.totalDebt || 0,
        totalRepaid: parsed.totalRepaid || 0,
        adaptive: { ...DEFAULT_ADAPTIVE, ...(parsed.adaptive || {}), lessons: parsed.adaptive?.lessons || [] },
      };
    }
  } catch {}
  return defaultData;
}

async function saveData(data: TraderData) {
  try {
    await writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save trader data:', e);
  }
}

// Record a thought to the trader's thinking log (called on trade close/expire)
async function recordThought(thought: {
  type: string; title: string; detail: string;
  coinSymbol?: string; coinId?: string; direction?: 'LONG' | 'SHORT';
  confidence?: number; tradeId?: string; pnl?: number;
  entryType?: 'LIMIT' | 'MARKET';
  emotion?: string; tags?: string[];
}) {
  try {
    let session: any = { thoughts: [] };
    if (existsSync(THINKING_PATH)) {
      const raw = await readFile(THINKING_PATH, 'utf-8');
      session = JSON.parse(raw);
    }
    session.thoughts = session.thoughts || [];
    session.thoughts.unshift({
      id: `thought_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      ...thought,
      emotion: thought.emotion || 'neutral',
      tags: thought.tags || [],
    });
    session.thoughts = session.thoughts.slice(0, 200);
    await writeFile(THINKING_PATH, JSON.stringify(session, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to record thought:', e);
  }
}

function calculatePositionSize(
  freeBalance: number, riskPct: number, entry: number, stopLoss: number, leverage: number
): { positionSize: number; quantity: number } {
  // Money management: risk only riskPct% of FREE balance per trade
  const riskAmount = freeBalance * (riskPct / 100);
  const stopDistance = Math.abs(entry - stopLoss);
  if (stopDistance === 0 || entry === 0) return { positionSize: 0, quantity: 0 };
  const stopPct = stopDistance / entry;
  const rawPositionSize = riskAmount / stopPct;
  // Cap: max 12% of free balance as margin (before leverage) — leaves room for multiple trades
  const maxMargin = freeBalance * MAX_MARGIN_PCT;
  const maxPositionSize = maxMargin * leverage;
  const positionSize = Math.min(rawPositionSize, maxPositionSize, freeBalance * leverage);
  const quantity = positionSize / entry;
  return { positionSize: Math.round(positionSize * 100) / 100, quantity: Math.round(quantity * 1000000) / 1000000 };
}

// ============================================
// ADAPTIVE LEARNING — Analyze mistakes from a resolved trade
// ============================================

function analyzeTradeMistakes(trade: Trade, adaptive: AdaptiveParams): Lesson[] {
  const newLessons: Lesson[] = [];
  if (!trade.resolved || trade.result !== 'LOSS') return newLessons;

  const slDistancePct = (Math.abs(trade.entry - trade.stopLoss) / trade.entry) * 100;

  // Lesson 1: Stop-loss too close
  if (slDistancePct < adaptive.minSlDistancePct) {
    const severity: 'low' | 'medium' | 'high' = slDistancePct < adaptive.minSlDistancePct * 0.3 ? 'high' : slDistancePct < adaptive.minSlDistancePct * 0.6 ? 'medium' : 'low';
    newLessons.push({
      type: 'sl_too_close',
      description: `SL слишком близко (${slDistancePct.toFixed(2)}% от входа) — рыночный шум выбил позицию. Минимум ${adaptive.minSlDistancePct.toFixed(1)}%`,
      coinId: trade.coinId,
      direction: trade.direction,
      value: slDistancePct,
      timestamp: Date.now(),
      tradeId: trade.id,
      severity,
    });
  }

  // Lesson 2: Low confidence trade lost
  if (trade.confidence < 60) {
    newLessons.push({
      type: 'low_confidence',
      description: `Низкая уверенность (${trade.confidence}%) — сделка убыточна. Минимум ${adaptive.minConfidence}%`,
      coinId: trade.coinId,
      direction: trade.direction,
      value: trade.confidence,
      timestamp: Date.now(),
      tradeId: trade.id,
      severity: trade.confidence < 50 ? 'high' : 'medium',
    });
  }

  // Lesson 3: Bad R:R ratio
  const rr = Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.entry - trade.stopLoss);
  if (rr < 1.5 && trade.result === 'LOSS') {
    newLessons.push({
      type: 'bad_rr',
      description: `Плохое R:R (${rr.toFixed(2)}) — потенциальная прибыль не покрывает риск. Минимум ${adaptive.minRr}`,
      coinId: trade.coinId,
      value: rr,
      timestamp: Date.now(),
      tradeId: trade.id,
      severity: rr < 1.0 ? 'high' : 'medium',
    });
  }

  return newLessons;
}

// ============================================
// ADAPTIVE LEARNING — Update parameters from accumulated lessons
// ============================================

function updateAdaptiveParams(adaptive: AdaptiveParams): AdaptiveParams {
  const updated = { ...adaptive, lessons: [...adaptive.lessons] };

  // Count SL-too-close lessons in recent history
  const slCloseLessons = updated.lessons.filter(l => l.type === 'sl_too_close');
  if (slCloseLessons.length >= 1) {
    // Find the worst SL distance from recent mistakes and set minimum above it
    const worstSl = Math.min(...slCloseLessons.map(l => l.value || 0));
    const newMin = Math.max(updated.minSlDistancePct, worstSl + 0.15, 0.5);
    updated.minSlDistancePct = Math.round(newMin * 100) / 100;
  }

  // Count low-confidence losses
  const lowConfLessons = updated.lessons.filter(l => l.type === 'low_confidence');
  if (lowConfLessons.length >= 2) {
    const highestFailedConf = Math.max(...lowConfLessons.map(l => l.value || 0));
    updated.minConfidence = Math.min(Math.max(updated.minConfidence, highestFailedConf + 5, 60), 75);
  }

  // Count bad R:R lessons
  const badRrLessons = updated.lessons.filter(l => l.type === 'bad_rr');
  if (badRrLessons.length >= 2) {
    const worstRr = Math.min(...badRrLessons.map(l => l.value || 0));
    updated.minRr = Math.max(updated.minRr, worstRr + 0.3, 1.8);
  }

  // Auto-add coins to avoid based on repeated losses
  const coinLossCount = new Map<string, number>();
  for (const l of updated.lessons) {
    if (l.coinId && (l.type === 'sl_too_close' || l.type === 'low_confidence')) {
      coinLossCount.set(l.coinId, (coinLossCount.get(l.coinId) || 0) + 1);
    }
  }
  for (const [coinId, count] of coinLossCount) {
    if (count >= 2 && !updated.avoidCoins.includes(coinId)) {
      updated.avoidCoins = [...updated.avoidCoins, coinId];
      updated.lessons.push({
        type: 'bad_coin',
        description: `${coinId} — повторяющиеся ошибки (${count} раз). Монета добавлена в список избегаемых`,
        coinId,
        timestamp: Date.now(),
        tradeId: '',
        severity: 'high',
      });
    }
  }

  updated.lessonsVersion++;
  return updated;
}

// ============================================
// TRADE RESOLUTION
// ============================================

interface ClosedTradeInfo {
  id: string; tradeId: string; coinSymbol: string; coinId: string; direction: 'LONG' | 'SHORT';
  entryType: 'LIMIT' | 'MARKET'; confidence: number;
  result: 'WIN' | 'LOSS' | 'EXPIRED'; exitReason: string;
  pnlUSDT: number; entry: number; exitPrice: number;
}

function resolveTrades(data: TraderData, currentPrices: Record<string, number>): { data: TraderData; closedInfo: ClosedTradeInfo[] } {
  const now = Date.now();
  const closedInfo: ClosedTradeInfo[] = [];

  let balance = data.balance;
  let wins = 0, losses = 0, expired = 0;
  let totalPnl = 0, pnlCount = 0;
  let streak = 0, score = 0;
  let bestTrade = 0, worstTrade = 0;

  const updatedTrades: Trade[] = [];
  const newLessons: Lesson[] = [];
  let adaptive = { ...data.adaptive, lessons: [...data.adaptive.lessons] };

  for (const trade of data.trades) {
    if (trade.resolved) {
      updatedTrades.push(trade);
      if (trade.result === 'WIN') {
        wins++; score += trade.pointsChange || 10;
        if (trade.pnlUSDT) { totalPnl += trade.pnlUSDT; pnlCount++; }
        streak = streak > 0 ? streak + 1 : 1;
        if (trade.pnlUSDT && trade.pnlUSDT > bestTrade) bestTrade = trade.pnlUSDT;
      } else if (trade.result === 'LOSS') {
        losses++; score += trade.pointsChange || -15;
        if (trade.pnlUSDT) { totalPnl += trade.pnlUSDT; pnlCount++; }
        streak = streak < 0 ? streak - 1 : -1;
        if (trade.pnlUSDT && trade.pnlUSDT < worstTrade) worstTrade = trade.pnlUSDT;
        // Learn from this loss
        const lessons = analyzeTradeMistakes(trade, adaptive);
        newLessons.push(...lessons);
      } else {
        expired++; streak = 0;
      }
      continue;
    }

    const price = currentPrices[trade.coinId];
    const age = now - trade.timestamp;
    const enteredAge = trade.enteredAt ? now - trade.enteredAt : 0;

    // ===== LIMIT order entry check =====
    if (!trade.entryReached && trade.entryType === 'LIMIT' && price) {
      if (trade.direction === 'LONG' && price <= trade.entry) trade.entryReached = true;
      if (trade.direction === 'SHORT' && price >= trade.entry) trade.entryReached = true;
      if (trade.entryReached) {
        trade.enteredAt = now;
        updatedTrades.push({ ...trade, entryReached: true, enteredAt: now });
        continue;
      }
    }
    if (trade.entryType === 'MARKET' && !trade.entryReached) {
      trade.entryReached = true;
      trade.enteredAt = trade.timestamp;
    }

    // ===== LIMIT expiry: cancel if not triggered within 2 hours =====
    if (!trade.entryReached && age > LIMIT_EXPIRY_AGE) {
      const resolved = {
        ...trade, resolved: true, result: 'EXPIRED' as const,
        closedAt: now, exitPrice: price || trade.currentPrice,
        exitReason: `Лимитный ордер не сработал за 2ч — капитал освобождён`, pnlUSDT: 0, pnlPct: 0, pointsChange: -3,
      };
      updatedTrades.push(resolved);
      expired++; score -= 3; streak = 0;
      balance += trade.positionSize;
      // Lesson: LIMIT orders that don't trigger
      if (adaptive.marketEntryConditions.length < 10) {
        newLessons.push({
          type: 'limit_expired',
          description: `LIMIT ордер на ${trade.coinSymbol} не сработал за 2ч — при сильном сигнале лучше входить по рынку`,
          coinId: trade.coinId,
          direction: trade.direction,
          value: trade.confidence,
          timestamp: Date.now(),
          tradeId: trade.id,
          severity: 'low',
        });
      }
      continue;
    }

    // ===== Stale position: close at market if open for 3h without TP/SL =====
    if (trade.entryReached && enteredAge > STALE_TRADE_AGE && price) {
      const pnlUSDT = calculatePnL(trade, price);
      const pnlPct = trade.positionSize > 0 ? (pnlUSDT / trade.positionSize) * 100 : 0;
      const isProfit = pnlUSDT >= 0;
      const resolved = {
        ...trade, resolved: true, result: isProfit ? 'WIN' as const : 'LOSS' as const,
        closedAt: now, exitPrice: price,
        exitReason: `Позиция закрыта по таймауту (3ч) — ${isProfit ? 'в профите' : 'в убытке'} $${Math.abs(pnlUSDT).toFixed(2)}`,
        pnlUSDT, pnlPct, pointsChange: isProfit ? Math.round(5 + pnlPct) : Math.round(-10 + pnlPct),
      };
      updatedTrades.push(resolved);
      if (isProfit) {
        wins++; score += resolved.pointsChange;
        streak = streak > 0 ? streak + 1 : 1;
        if (pnlUSDT > bestTrade) bestTrade = pnlUSDT;
      } else {
        losses++; score += resolved.pointsChange;
        streak = streak < 0 ? streak - 1 : -1;
        if (pnlUSDT < worstTrade) worstTrade = pnlUSDT;
        // Learn from timeout loss
        const lessons = analyzeTradeMistakes(resolved, adaptive);
        newLessons.push(...lessons);
      }
      balance += trade.positionSize + pnlUSDT;
      totalPnl += pnlUSDT; pnlCount++;
      continue;
    }

    // ===== Absolute maximum age safety net (24h) =====
    if (age > MAX_POSITION_AGE && trade.entryReached) {
      const exitPrice = price || trade.currentPrice;
      const pnlUSDT = price ? calculatePnL(trade, exitPrice) : 0;
      const pnlPct = trade.positionSize > 0 ? (pnlUSDT / trade.positionSize) * 100 : 0;
      const resolved = {
        ...trade, resolved: true, result: 'EXPIRED' as const,
        closedAt: now, exitPrice,
        exitReason: 'Сигнал истёк (24ч) — закрыт по текущей цене',
        pnlUSDT, pnlPct, pointsChange: pnlUSDT >= 0 ? 5 : -8,
      };
      updatedTrades.push(resolved);
      expired++; score += resolved.pointsChange; streak = 0;
      balance += trade.positionSize + pnlUSDT;
      if (pnlUSDT > bestTrade) bestTrade = pnlUSDT;
      if (pnlUSDT < worstTrade) worstTrade = pnlUSDT;
      totalPnl += pnlUSDT; pnlCount++;
      continue;
    }

    if (age > MAX_POSITION_AGE) {
      const resolved = {
        ...trade, resolved: true, result: 'EXPIRED' as const,
        closedAt: now, exitPrice: price || trade.currentPrice,
        exitReason: 'Сигнал истёк (24ч)', pnlUSDT: 0, pnlPct: 0, pointsChange: -3,
      };
      updatedTrades.push(resolved);
      expired++; score -= 3; streak = 0;
      balance += trade.positionSize;
      continue;
    }

    if (!price || !trade.entryReached) {
      updatedTrades.push(trade);
      continue;
    }

    // ===== Update high/low tracking for trailing stops =====
    let updatedTrade = { ...trade };
    if (price > (updatedTrade.highestPrice || 0)) updatedTrade.highestPrice = price;
    if (price < (updatedTrade.lowestPrice || Infinity)) updatedTrade.lowestPrice = price;

    // ===== Partial Exit Check (before TP/SL) =====
    // Check partial exits if the trade has takeProfit levels and hasn't been fully partial-exited
    const hasPartialExits = (updatedTrade.partialExits && updatedTrade.partialExits !== '[]') || false;
    const canPartialExit = updatedTrade.takeProfit2 > 0 && updatedTrade.takeProfit3 > 0;

    if (canPartialExit && !updatedTrade.resolved) {
      const partialResult = checkPartialExits(updatedTrade, price);
      if (partialResult.exit) {
        // Accumulate partial exit PnL
        const partialPnl = partialResult.exit.pnl;
        const partialCommission = partialResult.exit.commission;
        // Credit partial PnL back to balance immediately
        balance += (updatedTrade.positionSize * (partialResult.exit.percent / 100)) + partialPnl;
        totalPnl += partialPnl; pnlCount++;

        // Parse and store partial exits
        let exits: EnginePartialExit[] = [];
        if (updatedTrade.partialExits) {
          try { exits = JSON.parse(updatedTrade.partialExits); } catch { exits = []; }
        }
        exits.push(partialResult.exit);

        updatedTrade = {
          ...updatedTrade,
          partialExits: JSON.stringify(exits),
          remainingQuantity: partialResult.remainingQuantity,
          // After TP1, move stopLoss to breakeven
          stopLoss: partialResult.exit.tpLevel === 1 ? updatedTrade.entry : updatedTrade.stopLoss,
        };

        // If all closed via partial exits, resolve as WIN
        if (partialResult.allClosed) {
          const totalPartialPnl = exits.reduce((s, e) => s + e.pnl, 0);
          const pnlPct = updatedTrade.positionSize > 0 ? (totalPartialPnl / updatedTrade.positionSize) * 100 : 0;
          const pointsChange = Math.round(10 + pnlPct * 2);
          const resolved = {
            ...updatedTrade, resolved: true, result: 'WIN' as const, closedAt: now,
            exitPrice: price,
            exitReason: `Все TP достигнуты (частичные выходы: TP1=50%, TP2=30%, TP3=20%) — общий PnL $${totalPartialPnl.toFixed(2)}`,
            pnlUSDT: Math.round(totalPartialPnl * 100) / 100,
            pnlPct: Math.round(pnlPct * 100) / 100,
            pointsChange,
          };
          updatedTrades.push(resolved);
          wins++; score += pointsChange;
          streak = streak > 0 ? streak + 1 : 1;
          if (totalPartialPnl > bestTrade) bestTrade = totalPartialPnl;
          // Return remaining position size (should be ~0 at this point)
          const alreadyReturned = exits.reduce((s, e) => s + (updatedTrade.positionSize * (e.percent / 100)), 0);
          const remainingMargin = updatedTrade.positionSize - alreadyReturned;
          if (remainingMargin > 0) balance += remainingMargin;
          continue;
        }
      }
    }

    // ===== Trailing Stop Check =====
    if (updatedTrade.trailingStop && !updatedTrade.resolved) {
      const trailingResult = updateTrailingStop(updatedTrade, price);
      if (trailingResult.newStopLoss !== null) {
        updatedTrade.stopLoss = trailingResult.newStopLoss;
      }
      if (trailingResult.triggered) {
        const pnlUSDT = calculatePnL(updatedTrade, updatedTrade.stopLoss);
        const pnlPct = updatedTrade.positionSize > 0 ? (pnlUSDT / updatedTrade.positionSize) * 100 : 0;
        const isProfit = pnlUSDT >= 0;
        const pointsChange = isProfit ? Math.round(10 + pnlPct * 2) : Math.round(-15 + pnlPct);
        const resolved = {
          ...updatedTrade, resolved: true,
          result: isProfit ? 'WIN' as const : 'LOSS' as const,
          closedAt: now, exitPrice: updatedTrade.stopLoss,
          exitReason: `Трейлинг-стоп: ${trailingResult.reason}`,
          pnlUSDT, pnlPct, pointsChange,
        };
        updatedTrades.push(resolved);
        if (isProfit) {
          wins++; score += pointsChange;
          streak = streak > 0 ? streak + 1 : 1;
          if (pnlUSDT > bestTrade) bestTrade = pnlUSDT;
        } else {
          losses++; score += pointsChange;
          streak = streak < 0 ? streak - 1 : -1;
          if (pnlUSDT < worstTrade) worstTrade = pnlUSDT;
          const lessons = analyzeTradeMistakes(resolved, adaptive);
          newLessons.push(...lessons);
        }
        // Return position size
        balance += updatedTrade.positionSize + pnlUSDT;
        totalPnl += pnlUSDT; pnlCount++;
        continue;
      }
    }

    // ===== Check TP or SL (original logic, respects partial exits) =====
    if (updatedTrade.direction === 'LONG') {
      if (price >= updatedTrade.takeProfit1) {
        const pnlUSDT = calculatePnL(updatedTrade, updatedTrade.takeProfit1);
        const pnlPct = updatedTrade.positionSize > 0 ? (pnlUSDT / updatedTrade.positionSize) * 100 : 0;
        const pointsChange = Math.round(10 + pnlPct * 2);
        const resolved = { ...updatedTrade, resolved: true, result: 'WIN' as const, closedAt: now, exitPrice: updatedTrade.takeProfit1,
          exitReason: `TP1 достигнут — цена поднялась до $${updatedTrade.takeProfit1.toFixed(2)}`, pnlUSDT, pnlPct, pointsChange };
        updatedTrades.push(resolved);
        wins++; score += pointsChange; totalPnl += pnlUSDT; pnlCount++;
        balance += updatedTrade.positionSize + pnlUSDT;
        streak = streak > 0 ? streak + 1 : 1;
        if (pnlUSDT > bestTrade) bestTrade = pnlUSDT;
      } else if (price <= updatedTrade.stopLoss) {
        const pnlUSDT = calculatePnL(updatedTrade, updatedTrade.stopLoss);
        const pnlPct = updatedTrade.positionSize > 0 ? (pnlUSDT / updatedTrade.positionSize) * 100 : 0;
        const pointsChange = Math.round(-15 + pnlPct);
        const resolved = { ...updatedTrade, resolved: true, result: 'LOSS' as const, closedAt: now, exitPrice: updatedTrade.stopLoss,
          exitReason: `Стоп-лосс сработал — цена упала до $${updatedTrade.stopLoss.toFixed(2)}`, pnlUSDT, pnlPct, pointsChange };
        updatedTrades.push(resolved);
        losses++; score += pointsChange; totalPnl += pnlUSDT; pnlCount++;
        balance += updatedTrade.positionSize + pnlUSDT;
        streak = streak < 0 ? streak - 1 : -1;
        if (pnlUSDT < worstTrade) worstTrade = pnlUSDT;
        // Learn from SL hit
        const lessons = analyzeTradeMistakes(resolved, adaptive);
        newLessons.push(...lessons);
      } else {
        updatedTrades.push(updatedTrade);
      }
    } else {
      if (price <= updatedTrade.takeProfit1) {
        const pnlUSDT = calculatePnL(updatedTrade, updatedTrade.takeProfit1);
        const pnlPct = updatedTrade.positionSize > 0 ? (pnlUSDT / updatedTrade.positionSize) * 100 : 0;
        const pointsChange = Math.round(10 + pnlPct * 2);
        const resolved = { ...updatedTrade, resolved: true, result: 'WIN' as const, closedAt: now, exitPrice: updatedTrade.takeProfit1,
          exitReason: `TP1 достигнут — цена снизилась до $${updatedTrade.takeProfit1.toFixed(2)}`, pnlUSDT, pnlPct, pointsChange };
        updatedTrades.push(resolved);
        wins++; score += pointsChange; totalPnl += pnlUSDT; pnlCount++;
        balance += updatedTrade.positionSize + pnlUSDT;
        streak = streak > 0 ? streak + 1 : 1;
        if (pnlUSDT > bestTrade) bestTrade = pnlUSDT;
      } else if (price >= updatedTrade.stopLoss) {
        const pnlUSDT = calculatePnL(updatedTrade, updatedTrade.stopLoss);
        const pnlPct = updatedTrade.positionSize > 0 ? (pnlUSDT / updatedTrade.positionSize) * 100 : 0;
        const pointsChange = Math.round(-15 + pnlPct);
        const resolved = { ...updatedTrade, resolved: true, result: 'LOSS' as const, closedAt: now, exitPrice: updatedTrade.stopLoss,
          exitReason: `Стоп-лосс сработал — цена поднялась до $${updatedTrade.stopLoss.toFixed(2)}`, pnlUSDT, pnlPct, pointsChange };
        updatedTrades.push(resolved);
        losses++; score += pointsChange; totalPnl += pnlUSDT; pnlCount++;
        balance += updatedTrade.positionSize + pnlUSDT;
        streak = streak < 0 ? streak - 1 : -1;
        if (pnlUSDT < worstTrade) worstTrade = pnlUSDT;
        // Learn from SL hit
        const lessons = analyzeTradeMistakes(resolved, adaptive);
        newLessons.push(...lessons);
      } else {
        updatedTrades.push(updatedTrade);
      }
    }
  }

  balance = Math.max(0, Math.round(balance * 100) / 100);

  // Apply new lessons
  if (newLessons.length > 0) {
    adaptive.lessons = [...adaptive.lessons, ...newLessons].slice(-100); // Keep last 100
    adaptive = updateAdaptiveParams(adaptive);
  }

  // Auto-repay debt from balance if profitable
  let totalDebt = data.totalDebt;
  let totalRepaid = data.totalRepaid;
  const debtHistory = [...data.debtHistory];
  const totalBorrowed = debtHistory.reduce((s, d) => s + d.amount, 0);
  if (totalDebt > 0 && balance > data.initialDeposit + totalBorrowed) {
    const canRepay = Math.min(totalDebt, balance - 10);
    if (canRepay > 0) {
      totalDebt -= canRepay;
      totalRepaid += canRepay;
      balance -= canRepay;
      let remaining = canRepay;
      for (let i = debtHistory.length - 1; i >= 0 && remaining > 0; i--) {
        const owed = debtHistory[i].remainingOwed;
        if (owed <= remaining) {
          remaining -= owed;
          debtHistory[i].remainingOwed = 0;
        } else {
          debtHistory[i].remainingOwed -= remaining;
          remaining = 0;
        }
      }
    }
  }

  const totalResolved = wins + losses + expired;
  const { level, emoji } = getLevel(score);

  const lastSnapshot = data.depositHistory[data.depositHistory.length - 1];
  const depositHistory = [...data.depositHistory];
  if (!lastSnapshot || now - lastSnapshot.timestamp > 5 * 60 * 1000) {
    const lockedPositions = updatedTrades
      .filter(t => !t.resolved)
      .reduce((sum, t) => sum + t.positionSize, 0);
    const equity = balance + lockedPositions + calcUnrealizedPnL(updatedTrades, currentPrices);
    depositHistory.push({ timestamp: now, balance, equity: Math.round(equity * 100) / 100 });
  }

  return {
    data: {
      ...data, balance,
      totalTrades: data.totalTrades,
      wins, losses, expired, score,
      winRate: totalResolved > 0 ? Math.round((wins / totalResolved) * 100) : 0,
      avgPnl: pnlCount > 0 ? Math.round((totalPnl / pnlCount) * 100) / 100 : 0,
      streak,
      bestTrade: Math.round(bestTrade * 100) / 100,
      worstTrade: Math.round(worstTrade * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      level, levelEmoji: emoji,
      trades: updatedTrades.slice(-100),
      depositHistory: depositHistory.slice(-500),
      lastUpdated: now,
      totalDebt: Math.round(totalDebt * 100) / 100,
      debtHistory,
      totalRepaid: Math.round(totalRepaid * 100) / 100,
      adaptive,
    },
    closedInfo,
  };
}

// Extract closed trade info by comparing old trades (unresolved) with new trades (resolved)
function extractClosedInfo(oldTrades: Trade[], newData: TraderData): ClosedTradeInfo[] {
  const closedInfo: ClosedTradeInfo[] = [];
  const oldUnresolved = new Set(oldTrades.filter(t => !t.resolved).map(t => t.id));
  for (const trade of newData.trades) {
    if (oldUnresolved.has(trade.id) && trade.resolved && trade.result) {
      closedInfo.push({
        id: trade.id, tradeId: trade.id, coinSymbol: trade.coinSymbol, coinId: trade.coinId,
        direction: trade.direction, entryType: trade.entryType, confidence: trade.confidence,
        result: trade.result, exitReason: trade.exitReason || '',
        pnlUSDT: trade.pnlUSDT || 0, entry: trade.entry, exitPrice: trade.exitPrice || 0,
      });
    }
  }
  return closedInfo;
}

function calculatePnL(trade: Trade, exitPrice: number): number {
  const { direction, entry, quantity, leverage } = trade;
  // Use realistic PnL with commission & slippage
  const result = calculateRealisticPnL({
    direction,
    entryPrice: entry,
    exitPrice,
    quantity: trade.remainingQuantity ?? quantity,
    leverage,
  });
  return result.netPnl;
}

function calcUnrealizedPnL(trades: Trade[], currentPrices: Record<string, number>): number {
  let unrealized = 0;
  for (const t of trades) {
    if (t.resolved || !t.entryReached) continue;
    const price = currentPrices[t.coinId];
    if (!price) continue;
    unrealized += calculatePnL(t, price);
  }
  return Math.round(unrealized * 100) / 100;
}

async function getCurrentPrices(): Promise<Record<string, number>> {
  const currentPrices: Record<string, number> = {};
  try {
    const marketRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/crypto/market`);
    if (marketRes.ok) {
      const marketData = await marketRes.json();
      if (Array.isArray(marketData.data)) {
        for (const coin of marketData.data) {
          currentPrices[coin.id] = coin.current_price;
        }
      }
    }
  } catch {}
  return currentPrices;
}

// ============================================
// API ROUTES
// ============================================

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(`api:reputation:${clientIp}`, RATE_LIMITS.reputation);
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json({ error: 'Rate limit exceeded', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
    const data = await loadData();
    const currentPrices = await getCurrentPrices();
    const { data: resolved, closedInfo } = resolveTrades(data, currentPrices);
    await saveData(resolved);
    // Record thoughts for closed trades
    for (const ci of closedInfo) {
      await recordThought({
        type: 'close',
        title: `${ci.result === 'WIN' ? 'ПРИБЫЛЬ' : ci.result === 'LOSS' ? 'УБЫТОК' : 'ИСТЕКЛО'}: ${ci.coinSymbol} ${ci.direction}`,
        detail: `${ci.exitReason}. PnL: $${ci.pnlUSDT >= 0 ? '+' : ''}${ci.pnlUSDT.toFixed(2)}. Вход: $${ci.entry.toFixed(2)} → Выход: $${ci.exitPrice.toFixed(2)}. ${ci.entryType === 'MARKET' ? 'Рыночный' : 'Лимитный'} вход, уверенность ${ci.confidence}%`,
        coinSymbol: ci.coinSymbol, coinId: ci.coinId, direction: ci.direction,
        confidence: ci.confidence, tradeId: ci.tradeId, pnl: ci.pnlUSDT,
        entryType: ci.entryType,
        emotion: ci.result === 'WIN' ? 'satisfied' : ci.result === 'LOSS' ? 'frustrated' : 'cautious',
        tags: ['close', ci.result.toLowerCase(), ci.direction.toLowerCase(), ci.entryType.toLowerCase()],
      });
      // Audit: trade closed
      auditTradeClosed(ci, ci.pnlUSDT);
    }
    const lockedInPositions = resolved.trades
      .filter(t => !t.resolved)
      .reduce((sum, t) => sum + t.positionSize, 0);
    const freeBalance = Math.max(0, Math.round(resolved.balance * 100) / 100);
    return NextResponse.json({ ...resolved, lockedInPositions: Math.round(lockedInPositions * 100) / 100, freeBalance }, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
  } catch (error) {
    console.error('Trader GET error:', error);
    return NextResponse.json({ error: 'Failed to load trader data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await loadData();

    // Dedup: don't open same direction on same coin if already open
    const existingOpen = data.trades.filter(
      t => !t.resolved && t.coinId === (body.coinId || 'bitcoin') && t.direction === body.direction
    );
    if (existingOpen.length > 0) {
      return NextResponse.json({ success: false, reason: 'already_open', reputation: data });
    }

    // Free balance is the actual available cash
    const freeBalance = Math.max(0, data.balance);
    if (freeBalance < 3) {
      return NextResponse.json({ success: false, reason: 'low_free_balance', reputation: data });
    }

    const adaptive = data.adaptive || DEFAULT_ADAPTIVE;
    const coinId = body.coinId || 'bitcoin';
    const newDirection = (body.direction || 'LONG') as 'LONG' | 'SHORT';
    const openTrades = data.trades.filter(t => !t.resolved);

    // ========================================
    // PORTFOLIO RISK CHECK (trading engine)
    // ========================================
    const initialDeposit = data.initialDeposit || 100;
    const currentDrawdownPct = freeBalance < initialDeposit
      ? ((initialDeposit - freeBalance) / initialDeposit) * 100
      : 0;

    const riskCheck = checkPortfolioRisk({
      freeBalance,
      openTrades,
      newDirection,
      newCoinId: coinId,
      newCoinSymbol: body.coinSymbol || 'BTC',
      maxDrawdownPct: 20,
      maxOpenPositions: 5,
      maxCorrelatedPositions: 3,
      maxPortfolioRiskPct: 40,
    });

    if (!riskCheck.allowed) {
      return NextResponse.json({ success: false, reason: 'risk_rejected', detail: riskCheck.reason, reputation: data });
    }

    // Stop trading if drawdown exceeds 20%
    if (currentDrawdownPct >= 20) {
      auditDrawdownWarning(currentDrawdownPct, 20);
      return NextResponse.json({
        success: false,
        reason: 'max_drawdown',
        detail: `Просадка ${currentDrawdownPct.toFixed(1)}% — торговля приостановлена для снижения риска`,
        reputation: data,
      });
    }

    // ========================================
    // ADAPTIVE LEARNING — Pre-trade checks
    // ========================================

    // Check 1: Avoid coins that have been consistently losing
    if (adaptive.avoidCoins.includes(coinId)) {
      return NextResponse.json({ success: false, reason: 'coin_avoided', detail: `Монета ${coinId} в списке избегаемых (повторяющиеся ошибки)`, reputation: data });
    }

    const entry = body.entry || 0;
    const stopLoss = body.stopLoss || 0;
    const slDistancePct = entry > 0 ? (Math.abs(entry - stopLoss) / entry) * 100 : 0;

    // Check 2: SL too close (learned minimum)
    if (slDistancePct > 0 && slDistancePct < adaptive.minSlDistancePct * 0.8) { // Only hard-reject if significantly below
      return NextResponse.json({
        success: false,
        reason: 'sl_too_close_learned',
        detail: `SL слишком близко (${slDistancePct.toFixed(2)}%) — минимум ${adaptive.minSlDistancePct.toFixed(1)}% по опыту прошлых ошибок`,
        reputation: data,
      });
    }

    // Check 3: Confidence below learned minimum
    const confidence = body.confidence || 0;
    if (confidence > 0 && confidence < adaptive.minConfidence * 0.8) { // Only hard-reject if significantly below
      return NextResponse.json({
        success: false,
        reason: 'low_confidence_learned',
        detail: `Уверенность ${confidence}% ниже порога ${adaptive.minConfidence}% — по опыту такие сделки убыточны`,
        reputation: data,
      });
    }

    // Check 4: Bad R:R ratio
    const takeProfit1 = body.takeProfit1 || 0;
    if (entry > 0 && stopLoss > 0 && takeProfit1 > 0) {
      const rr = Math.round((Math.abs(takeProfit1 - entry) / Math.abs(entry - stopLoss)) * 100) / 100; // Round to avoid float precision issues
      if (rr < adaptive.minRr * 0.7) { // Only hard-reject if R:R is significantly below threshold
        return NextResponse.json({
          success: false,
          reason: 'bad_rr_learned',
          detail: `R:R = ${rr.toFixed(2)} ниже минимума ${adaptive.minRr} — риск не оправдан`,
          reputation: data,
        });
      }
    }

    // ========================================
    // Decide entry type: LIMIT vs MARKET
    // ========================================
    let entryType: 'LIMIT' | 'MARKET' = body.entryType || 'LIMIT';
    const currentPrice = body.currentPrice || 0;
    const priceDiffFromEntry = currentPrice > 0 && entry > 0 ? Math.abs(currentPrice - entry) / currentPrice * 100 : 0;

    // Use MARKET entry when:
    // 1. Price is very close to intended entry (< 0.3% away) — no point waiting for LIMIT
    // 2. Strong momentum or breakout pattern — waiting = missing the move
    // 3. Many LIMIT orders have expired before (learned lesson)
    // NOTE: High confidence alone is NOT enough — if price is far from optimal entry, LIMIT is safer
    const limitExpiredLessons = adaptive.lessons.filter(l => l.type === 'limit_expired').length;
    const isBreakout = (body.reasons || []).some(r => r.includes('пробой') || r.includes('пробит') || r.includes('прорыв') || r.includes('breakout'));
    const shouldUseMarket = (
      priceDiffFromEntry < 0.3 ||
      isBreakout ||
      limitExpiredLessons >= 3
    );

    if (shouldUseMarket && entryType === 'LIMIT') {
      entryType = 'MARKET';
    }

    // If frontend sent MARKET but price is far from optimal entry, downgrade to LIMIT
    // Don't chase price — wait for pullback to the intended level
    if (entryType === 'MARKET' && !isBreakout && priceDiffFromEntry > 1.0) {
      entryType = 'LIMIT';
    }

    const leverage = body.leverage || data.defaultLeverage;
    // Use adjusted leverage from risk manager if it reduced it
    const effectiveLeverage = Math.min(leverage, riskCheck.adjustedLeverage);
    const actualEntry = entryType === 'MARKET' ? currentPrice : entry;

    // ===== When using MARKET entry at a different price, recalculate SL/TP to preserve R:R =====
    let adjustedStopLoss = stopLoss;
    let adjustedTakeProfit1 = takeProfit1;
    let adjustedTakeProfit2 = body.takeProfit2 || 0;
    let adjustedTakeProfit3 = body.takeProfit3 || 0;

    if (entryType === 'MARKET' && entry > 0 && currentPrice > 0 && Math.abs(currentPrice - entry) / entry > 0.002) {
      // Recalculate SL and TP around the actual MARKET entry price, preserving the same distances
      const originalRisk = Math.abs(entry - stopLoss);
      const originalReward1 = Math.abs(takeProfit1 - entry);
      const originalReward2 = Math.abs((body.takeProfit2 || 0) - entry);
      const originalReward3 = Math.abs((body.takeProfit3 || 0) - entry);
      const direction = body.direction || 'LONG';

      if (direction === 'LONG') {
        adjustedStopLoss = currentPrice - originalRisk;
        adjustedTakeProfit1 = currentPrice + originalReward1;
        adjustedTakeProfit2 = currentPrice + originalReward2;
        adjustedTakeProfit3 = currentPrice + originalReward3;
      } else {
        adjustedStopLoss = currentPrice + originalRisk;
        adjustedTakeProfit1 = currentPrice - originalReward1;
        adjustedTakeProfit2 = currentPrice - originalReward2;
        adjustedTakeProfit3 = currentPrice - originalReward3;
      }
    }

    // ===== Kelly Criterion Position Sizing =====
    // Use Kelly if we have enough trade history, otherwise fall back to fixed riskPerTrade
    const resolvedTrades = data.trades.filter(t => t.resolved && t.result !== 'EXPIRED');
    const wins_ = resolvedTrades.filter(t => t.result === 'WIN').length;
    const totalResolved_ = resolvedTrades.length;
    const winRate = totalResolved_ > 0 ? wins_ / totalResolved_ : 0.5;

    // Calculate avg win/loss as % of position size
    const winPnls = resolvedTrades.filter(t => t.result === 'WIN' && t.pnlUSDT != null && t.positionSize > 0).map(t => (t.pnlUSDT! / t.positionSize) * 100);
    const lossPnls = resolvedTrades.filter(t => t.result === 'LOSS' && t.pnlUSDT != null && t.positionSize > 0).map(t => Math.abs(t.pnlUSDT! / t.positionSize) * 100);
    const avgWinPct = winPnls.length > 0 ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : 3;
    const avgLossPct = lossPnls.length > 0 ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length : 1.5;

    const kelly = kellyCriterion({
      winRate,
      avgWinPct,
      avgLossPct,
      maxKellyFraction: 0.25,
      currentDrawdownPct,
    });

    // Use Kelly-recommended risk % if we have enough history, otherwise fall back to default
    const effectiveRiskPct = totalResolved_ >= 10 ? kelly.recommendedRiskPct : data.riskPerTrade;

    const { positionSize, quantity } = calculatePositionSize(freeBalance, effectiveRiskPct, actualEntry, adjustedStopLoss, effectiveLeverage);

    // Don't open if position size would use more than 12% of free balance as margin
    if (positionSize > freeBalance * MAX_MARGIN_PCT * effectiveLeverage || positionSize <= 0) {
      return NextResponse.json({ success: false, reason: 'insufficient_margin', reputation: data });
    }

    // Cap position size at risk manager's recommendation
    const cappedPositionSize = Math.min(positionSize, riskCheck.maxPositionSize * effectiveLeverage);
    const cappedQuantity = actualEntry > 0 ? cappedPositionSize / actualEntry : quantity;
    const finalPositionSize = Math.min(positionSize, cappedPositionSize);
    const finalQuantity = Math.min(quantity, cappedQuantity);

    const newTrade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      coinId,
      coinSymbol: body.coinSymbol || 'BTC',
      direction: body.direction || 'LONG',
      entryType,
      entry: actualEntry,
      currentPrice: body.currentPrice || 0,
      stopLoss: adjustedStopLoss,
      takeProfit1: adjustedTakeProfit1,
      takeProfit2: adjustedTakeProfit2,
      takeProfit3: adjustedTakeProfit3,
      confidence,
      timeframe: body.timeframe || '1h',
      entryReason: body.entryReason || '',
      reasons: body.reasons || [],
      leverage: effectiveLeverage,
      positionSize: finalPositionSize,
      quantity: finalQuantity,
      timestamp: Date.now(),
      entryReached: entryType === 'MARKET',
      enteredAt: entryType === 'MARKET' ? Date.now() : null,
      resolved: false, result: null, exitPrice: null, exitReason: null,
      closedAt: null, pnlUSDT: null, pnlPct: null, pointsChange: null,
      // Advanced trading engine fields (optional — disabled by default)
      trailingStop: body.trailingStop || false,
      trailingStepPct: body.trailingStepPct || 0.01,
      highestPrice: actualEntry,
      lowestPrice: actualEntry,
    };

    data.trades.push(newTrade);
    data.totalTrades++;
    // Lock position size from balance
    data.balance = Math.max(0, Math.round((data.balance - finalPositionSize) * 100) / 100);

    // Audit: trade opened
    auditTradeOpened({ ...newTrade, autoTrade: body.autoTrade ?? false });

    const currentPrices = await getCurrentPrices();
    const { data: resolved } = resolveTrades(data, currentPrices);
    await saveData(resolved);

    return NextResponse.json({
      success: true,
      tradeId: newTrade.id,
      entryType, // Tell the frontend what entry type was actually used
      adaptiveDecisions: {
        usedMarket: shouldUseMarket && body.entryType !== 'MARKET',
        reason: shouldUseMarket ? `Рыночный вход: confidence=${confidence}%, priceDiff=${priceDiffFromEntry.toFixed(2)}%, limitExpired=${limitExpiredLessons}` : undefined,
      },
      engineDecisions: {
        kelly: totalResolved_ >= 10 ? {
          kellyFraction: kelly.kellyFraction,
          adjustedFraction: kelly.adjustedFraction,
          recommendedRiskPct: kelly.recommendedRiskPct,
          usedRiskPct: effectiveRiskPct,
        } : { fallback: true, usedRiskPct: effectiveRiskPct },
        riskCheck: {
          allowed: riskCheck.allowed,
          maxPositionSize: riskCheck.maxPositionSize,
          adjustedLeverage: riskCheck.adjustedLeverage,
          effectiveLeverage,
          drawdownPct: Math.round(currentDrawdownPct * 100) / 100,
        },
      },
      reputation: resolved,
    });
  } catch (error) {
    console.error('Trader POST error:', error);
    return NextResponse.json({ error: 'Failed to record trade' }, { status: 500 });
  }
}

// PUT: Deposit funds as credit/loan to the trader
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const data = await loadData();
    const label = body.label || `Кредит #${data.debtHistory.length + 1}`;

    data.balance += amount;
    data.totalDebt += amount;

    data.debtHistory.push({
      timestamp: Date.now(),
      amount,
      remainingOwed: amount,
      label,
    });

    const lockedPositions = data.trades
      .filter(t => !t.resolved)
      .reduce((sum, t) => sum + t.positionSize, 0);
    data.depositHistory.push({
      timestamp: Date.now(),
      balance: data.balance,
      equity: Math.round((data.balance + lockedPositions) * 100) / 100,
    });

    await saveData(data);

    return NextResponse.json({
      success: true,
      newBalance: data.balance,
      totalDebt: data.totalDebt,
      debtEntry: { timestamp: Date.now(), amount, remainingOwed: amount, label },
    });
  } catch (error) {
    console.error('Trader PUT error:', error);
    return NextResponse.json({ error: 'Failed to deposit' }, { status: 500 });
  }
}

// PATCH: Cancel/delete a specific trade, return its positionSize to balance
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const tradeId = body.tradeId as string;
    if (!tradeId) {
      return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
    }

    const data = await loadData();
    const tradeIndex = data.trades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const trade = data.trades[tradeIndex];
    if (trade.resolved) {
      return NextResponse.json({ error: 'Cannot delete a resolved trade' }, { status: 400 });
    }

    let pnlAdjustment = 0;
    if (trade.entryReached) {
      const currentPrices = await getCurrentPrices();
      const currentPrice = currentPrices[trade.coinId];
      if (currentPrice) {
        pnlAdjustment = calculatePnL(trade, currentPrice);
      }
    }

    const refund = trade.positionSize + pnlAdjustment;
    data.balance = Math.max(0, Math.round((data.balance + refund) * 100) / 100);

    data.trades.splice(tradeIndex, 1);
    data.totalTrades = Math.max(0, data.totalTrades - 1);

    // Audit: trade cancelled
    auditTradeCancelled(trade, refund);

    const currentPrices = await getCurrentPrices();
    const { data: resolved } = resolveTrades(data, currentPrices);
    await saveData(resolved);

    return NextResponse.json({
      success: true,
      deletedTrade: tradeId,
      refunded: Math.round(refund * 100) / 100,
      pnlOnClose: Math.round(pnlAdjustment * 100) / 100,
      newBalance: resolved.balance,
      reputation: resolved,
    });
  } catch (error) {
    console.error('Trader PATCH error:', error);
    return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 });
  }
}

// DELETE: Reset trader data
export async function DELETE() {
  try {
    const defaultData: TraderData = {
      initialDeposit: 100, balance: 100,
      totalTrades: 0, wins: 0, losses: 0, expired: 0,
      score: 0, winRate: 0, avgPnl: 0, streak: 0,
      bestTrade: 0, worstTrade: 0, totalPnl: 0,
      level: 'Новичок', levelEmoji: '🌱',
      riskPerTrade: 5, defaultLeverage: 3,
      trades: [],
      depositHistory: [{ timestamp: Date.now(), balance: 100, equity: 100 }],
      lastUpdated: Date.now(),
      totalDebt: 0, debtHistory: [], totalRepaid: 0,
      adaptive: { ...DEFAULT_ADAPTIVE, lessons: [] },
    };
    await saveData(defaultData);
    return NextResponse.json({ success: true, reputation: defaultData });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reset' }, { status: 500 });
  }
}
