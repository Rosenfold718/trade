/**
 * trading-db.ts — Comprehensive database access layer for the crypto trading system.
 *
 * All JSON fields (reasons, avoidCoins, tags, marketEntryConditions, partialExits)
 * are stored as String in SQLite and parsed/stringified here.
 *
 * All timestamp fields use BigInt (Unix ms) to avoid 32-bit INT overflow in SQLite.
 */

import { db } from './db';

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; }
  catch { return fallback; }
}

function stringifyJson(val: unknown): string {
  return JSON.stringify(val ?? []);
}

/** Convert a number (e.g. Date.now() or JSON timestamp) to BigInt for Prisma. */
function ts(val: number | bigint | null | undefined): bigint | null {
  if (val == null) return null;
  return typeof val === 'bigint' ? val : BigInt(val);
}

/** Current time as BigInt. */
function nowTs(): bigint {
  return BigInt(Date.now());
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdaptiveParams {
  minSlDistancePct: number;
  minConfidence: number;
  avoidCoins: string[];
  minRr: number;
  counterTrendPenalty: number;
  limitExpiryHours: number;
  marketEntryConditions: string[];
  lessonsVersion: number;
}

export interface PartialExit {
  tpLevel: number;
  percent: number;
  price: number;
  closedAt: number | null;
  pnl: number;
}

export interface TradingStats {
  totalTrades: number;
  wins: number;
  losses: number;
  expired: number;
  winRate: number;
  avgPnl: number;
  totalPnl: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

// ─── TraderState ──────────────────────────────────────────────────────────────

export async function getTraderState() {
  let state = await db.traderState.findUnique({ where: { id: 'singleton' } });
  if (!state) {
    state = await db.traderState.create({ data: { id: 'singleton' } });
  }
  return state;
}

export async function updateTraderState(updates: Record<string, unknown>) {
  return db.traderState.upsert({
    where: { id: 'singleton' },
    update: {
      ...updates,
      lastUpdated: nowTs(),
    } as any,
    create: {
      id: 'singleton',
      ...updates,
      lastUpdated: nowTs(),
    } as any,
  });
}

// ─── Adaptive Params ──────────────────────────────────────────────────────────

export async function getAdaptiveParams(): Promise<AdaptiveParams> {
  const state = await getTraderState();
  return {
    minSlDistancePct: state.adaptiveMinSlDistancePct,
    minConfidence: state.adaptiveMinConfidence,
    avoidCoins: parseJson<string[]>(state.adaptiveAvoidCoins, []),
    minRr: state.adaptiveMinRr,
    counterTrendPenalty: state.adaptiveCounterTrendPenalty,
    limitExpiryHours: state.adaptiveLimitExpiryHours,
    marketEntryConditions: parseJson<string[]>(state.adaptiveMarketEntryConditions, []),
    lessonsVersion: state.adaptiveLessonsVersion,
  };
}

export async function updateAdaptiveParams(updates: Partial<AdaptiveParams>) {
  const data: Record<string, unknown> = {};
  if (updates.minSlDistancePct !== undefined) data.adaptiveMinSlDistancePct = updates.minSlDistancePct;
  if (updates.minConfidence !== undefined) data.adaptiveMinConfidence = updates.minConfidence;
  if (updates.avoidCoins !== undefined) data.adaptiveAvoidCoins = stringifyJson(updates.avoidCoins);
  if (updates.minRr !== undefined) data.adaptiveMinRr = updates.minRr;
  if (updates.counterTrendPenalty !== undefined) data.adaptiveCounterTrendPenalty = updates.counterTrendPenalty;
  if (updates.limitExpiryHours !== undefined) data.adaptiveLimitExpiryHours = updates.limitExpiryHours;
  if (updates.marketEntryConditions !== undefined) data.adaptiveMarketEntryConditions = stringifyJson(updates.marketEntryConditions);
  if (updates.lessonsVersion !== undefined) data.adaptiveLessonsVersion = updates.lessonsVersion;

  return db.traderState.update({
    where: { id: 'singleton' },
    data: { ...data, lastUpdated: nowTs() } as any,
  });
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export type TradeInput = {
  id: string;
  coinId: string;
  coinSymbol: string;
  direction: string;
  entryType: string;
  entry: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number;
  confidence: number;
  timeframe: string;
  entryReason: string;
  reasons?: string[];
  leverage: number;
  positionSize: number;
  quantity: number;
  timestamp: number;
  entryReached?: boolean;
  enteredAt?: number | null;
  resolved?: boolean;
  result?: string | null;
  exitPrice?: number | null;
  exitReason?: string | null;
  closedAt?: number | null;
  pnlUSDT?: number | null;
  pnlPct?: number | null;
  pointsChange?: number | null;
  trailingStop?: boolean;
  trailingStopPrice?: number | null;
  trailingStepPct?: number | null;
  partialExits?: PartialExit[];
};

export async function createTrade(trade: TradeInput) {
  return db.trade.create({
    data: {
      id: trade.id,
      coinId: trade.coinId,
      coinSymbol: trade.coinSymbol,
      direction: trade.direction,
      entryType: trade.entryType,
      entry: trade.entry,
      currentPrice: trade.currentPrice,
      stopLoss: trade.stopLoss,
      takeProfit1: trade.takeProfit1 ?? null,
      takeProfit2: trade.takeProfit2 ?? null,
      takeProfit3: trade.takeProfit3 ?? null,
      confidence: trade.confidence,
      timeframe: trade.timeframe,
      entryReason: trade.entryReason,
      reasons: stringifyJson(trade.reasons ?? []),
      leverage: trade.leverage,
      positionSize: trade.positionSize,
      quantity: trade.quantity,
      timestamp: ts(trade.timestamp)!,
      entryReached: trade.entryReached ?? false,
      enteredAt: ts(trade.enteredAt),
      resolved: trade.resolved ?? false,
      result: trade.result ?? null,
      exitPrice: trade.exitPrice ?? null,
      exitReason: trade.exitReason ?? null,
      closedAt: ts(trade.closedAt),
      pnlUSDT: trade.pnlUSDT ?? null,
      pnlPct: trade.pnlPct ?? null,
      pointsChange: trade.pointsChange ?? null,
      trailingStop: trade.trailingStop ?? false,
      trailingStopPrice: trade.trailingStopPrice ?? null,
      trailingStepPct: trade.trailingStepPct ?? null,
      partialExits: stringifyJson(trade.partialExits ?? []),
    },
  });
}

export type TradeFilters = {
  coinId?: string;
  direction?: string;
  resolved?: boolean;
  result?: string;
  entryType?: string;
};

export async function getTrades(filters?: TradeFilters) {
  const where: any = {};
  if (filters?.coinId) where.coinId = filters.coinId;
  if (filters?.direction) where.direction = filters.direction;
  if (filters?.resolved !== undefined) where.resolved = filters.resolved;
  if (filters?.result) where.result = filters.result;
  if (filters?.entryType) where.entryType = filters.entryType;

  return db.trade.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { timestamp: 'desc' },
  });
}

export async function getOpenTrades() {
  return db.trade.findMany({
    where: { resolved: false },
    orderBy: { timestamp: 'desc' },
  });
}

export async function getResolvedTrades(limit = 50, offset = 0) {
  return db.trade.findMany({
    where: { resolved: true },
    orderBy: { closedAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function updateTrade(id: string, updates: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...updates };
  // Convert number timestamps to BigInt
  for (const key of ['timestamp', 'enteredAt', 'closedAt']) {
    if (key in data && data[key] != null) {
      (data as any)[key] = ts(data[key] as number);
    }
  }
  if ('reasons' in updates && updates.reasons) {
    data.reasons = stringifyJson(updates.reasons);
  }
  if ('partialExits' in updates && updates.partialExits) {
    data.partialExits = stringifyJson(updates.partialExits);
  }
  return db.trade.update({ where: { id }, data: data as any });
}

export async function deleteTrade(id: string) {
  return db.trade.delete({ where: { id } });
}

// ─── Lessons ──────────────────────────────────────────────────────────────────

export type LessonInput = {
  type: string;
  description: string;
  coinId?: string | null;
  direction?: string | null;
  value?: number | null;
  timestamp: number;
  tradeId?: string | null;
  severity?: string;
};

export async function addLesson(lesson: LessonInput) {
  return db.lesson.create({
    data: {
      type: lesson.type,
      description: lesson.description,
      coinId: lesson.coinId ?? null,
      direction: lesson.direction ?? null,
      value: lesson.value ?? null,
      timestamp: ts(lesson.timestamp)!,
      tradeId: lesson.tradeId ?? null,
      severity: lesson.severity ?? 'info',
    },
  });
}

export async function getLessons(limit = 100) {
  return db.lesson.findMany({
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

// ─── Thoughts ─────────────────────────────────────────────────────────────────

export type ThoughtInput = {
  id: string;
  timestamp: number;
  type: string;
  title: string;
  detail: string;
  coinSymbol?: string | null;
  coinId?: string | null;
  direction?: string | null;
  confidence?: number | null;
  score?: number | null;
  tradeId?: string | null;
  pnl?: number | null;
  entryType?: string | null;
  emotion?: string;
  tags?: string[];
};

export async function addThought(thought: ThoughtInput) {
  return db.thought.create({
    data: {
      id: thought.id,
      timestamp: ts(thought.timestamp)!,
      type: thought.type,
      title: thought.title,
      detail: thought.detail,
      coinSymbol: thought.coinSymbol ?? null,
      coinId: thought.coinId ?? null,
      direction: thought.direction ?? null,
      confidence: thought.confidence ?? null,
      score: thought.score ?? null,
      tradeId: thought.tradeId ?? null,
      pnl: thought.pnl ?? null,
      entryType: thought.entryType ?? null,
      emotion: thought.emotion ?? 'neutral',
      tags: stringifyJson(thought.tags ?? []),
    },
  });
}

export async function getThoughts(limit = 50, offset = 0) {
  return db.thought.findMany({
    orderBy: { timestamp: 'desc' },
    take: limit,
    skip: offset,
  });
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function addAuditLog(
  action: string,
  details: Record<string, unknown>,
  coinId?: string | null,
  tradeId?: string | null,
) {
  return db.tradeAuditLog.create({
    data: {
      timestamp: nowTs(),
      action,
      details: stringifyJson(details),
      coinId: coinId ?? null,
      tradeId: tradeId ?? null,
    },
  });
}

export async function getAuditLogs(limit = 100, offset = 0) {
  return db.tradeAuditLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: limit,
    skip: offset,
  });
}

// ─── Deposit Snapshots ────────────────────────────────────────────────────────

export async function addDepositSnapshot(snapshot: { timestamp: number; balance: number; equity: number }) {
  return db.depositSnapshot.create({
    data: {
      timestamp: ts(snapshot.timestamp)!,
      balance: snapshot.balance,
      equity: snapshot.equity,
    },
  });
}

export async function getDepositSnapshots() {
  return db.depositSnapshot.findMany({
    orderBy: { timestamp: 'asc' },
  });
}

// ─── Debt Entries ─────────────────────────────────────────────────────────────

export async function addDebtEntry(entry: { timestamp: number; amount: number; remainingOwed: number; label?: string }) {
  return db.debtEntry.create({
    data: {
      timestamp: ts(entry.timestamp)!,
      amount: entry.amount,
      remainingOwed: entry.remainingOwed,
      label: entry.label ?? '',
    },
  });
}

export async function getDebtEntries() {
  return db.debtEntry.findMany({
    orderBy: { timestamp: 'desc' },
  });
}

// ─── Trading Stats ────────────────────────────────────────────────────────────

export async function getTradingStats(): Promise<TradingStats> {
  const state = await getTraderState();
  const resolvedTrades = await db.trade.findMany({
    where: { resolved: true, pnlUSDT: { not: null } },
    orderBy: { closedAt: 'asc' },
  });

  const wins = resolvedTrades.filter(t => t.result === 'WIN' && t.pnlUSDT !== null);
  const losses = resolvedTrades.filter(t => t.result === 'LOSS' && t.pnlUSDT !== null);

  const totalWins = wins.length;
  const totalLosses = losses.length;
  const totalPnl = state.totalPnl;
  const totalTrades = resolvedTrades.length;

  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

  const winPnls = wins.map(t => t.pnlUSDT!);
  const lossPnls = losses.map(t => t.pnlUSDT!);

  const avgWin = winPnls.length > 0 ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : 0;
  const avgLoss = lossPnls.length > 0 ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length : 0;

  const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;

  // Profit factor: gross profits / gross losses (absolute)
  const grossProfit = winPnls.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(lossPnls.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Expectancy: (winRate% * avgWin) - (lossRate% * |avgLoss|)
  const lossRate = totalTrades > 0 ? (totalLosses / totalTrades) : 0;
  const expectancy = (winRate / 100 * avgWin) - (lossRate * Math.abs(avgLoss));

  // Max drawdown from deposit snapshots
  const snapshots = await db.depositSnapshot.findMany({ orderBy: { timestamp: 'asc' } });
  let maxDrawdown = 0;
  let peak = 0;
  for (const snap of snapshots) {
    if (snap.equity > peak) peak = snap.equity;
    const dd = peak > 0 ? ((peak - snap.equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio (annualized, assuming ~6 trades/day, 365 days)
  const allPnls = resolvedTrades.map(t => t.pnlUSDT ?? 0);
  const sharpeRatio = computeSharpe(allPnls, 2190); // ~6 * 365

  // Sortino ratio
  const sortinoRatio = computeSortino(allPnls, 2190);

  // Calmar ratio: annualized return / max drawdown
  const annualizedReturn = totalTrades > 0 ? (totalPnl / state.initialDeposit) * (2190 / Math.max(totalTrades, 1)) * 100 : 0;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  // Consecutive wins/losses streaks
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  for (const t of resolvedTrades) {
    if (t.result === 'WIN') {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > consecutiveWins) consecutiveWins = currentWinStreak;
    } else if (t.result === 'LOSS') {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > consecutiveLosses) consecutiveLosses = currentLossStreak;
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  }

  return {
    totalTrades,
    wins: totalWins,
    losses: totalLosses,
    expired: state.expired,
    winRate,
    avgPnl,
    totalPnl,
    bestTrade: state.bestTrade,
    worstTrade: state.worstTrade,
    profitFactor,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    calmarRatio,
    avgWin,
    avgLoss,
    expectancy,
    consecutiveWins,
    consecutiveLosses,
  };
}

function computeSharpe(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(periodsPerYear);
}

function computeSortino(returns: number[], periodsPerYear: number): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downsideVariance = returns
    .filter(r => r < 0)
    .reduce((acc, r) => acc + Math.pow(r, 2), 0) / returns.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return 0;
  return (mean / downsideDev) * Math.sqrt(periodsPerYear);
}

// ─── Migration from JSON ──────────────────────────────────────────────────────

interface JsonTraderData {
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
  trades?: any[];
  depositHistory?: any[];
  lastUpdated: number;
  totalDebt: number;
  debtHistory?: any[];
  totalRepaid: number;
  adaptive?: {
    minSlDistancePct: number;
    minConfidence: number;
    avoidCoins: string[];
    minRr: number;
    counterTrendPenalty: number;
    limitExpiryHours: number;
    marketEntryConditions: string[];
    lessons: any[];
    lessonsVersion: number;
  };
}

interface JsonThoughtData {
  thoughts?: any[];
  currentMood?: string;
  activeStrategy?: string;
  marketView?: string;
  lastScanAt?: number;
  openPositionsCount?: number;
  freeBalance?: number;
  totalEquity?: number;
}

export async function migrateFromJson() {
  const fs = await import('fs');
  const path = await import('path');
  let migrated = { trades: 0, thoughts: 0, snapshots: 0, debts: 0, lessons: 0, state: false };

  // Check if trader-data.json exists
  const traderDataPath = path.join(process.cwd(), 'trader-data.json');
  if (!fs.existsSync(traderDataPath)) {
    console.log('[migrateFromJson] trader-data.json not found, skipping.');
    return migrated;
  }

  const traderData: JsonTraderData = JSON.parse(fs.readFileSync(traderDataPath, 'utf-8'));

  // Check if already migrated (simple check: if TraderState exists and has trades count matching)
  const existingState = await db.traderState.findUnique({ where: { id: 'singleton' } });
  if (existingState && existingState.totalTrades > 0) {
    console.log('[migrateFromJson] Already migrated, skipping.');
    return migrated;
  }

  // Migrate TraderState
  await db.traderState.upsert({
    where: { id: 'singleton' },
    update: {
      initialDeposit: traderData.initialDeposit,
      balance: traderData.balance,
      totalTrades: traderData.totalTrades,
      wins: traderData.wins,
      losses: traderData.losses,
      expired: traderData.expired,
      score: traderData.score,
      winRate: traderData.winRate,
      avgPnl: traderData.avgPnl,
      streak: traderData.streak,
      bestTrade: traderData.bestTrade,
      worstTrade: traderData.worstTrade,
      totalPnl: traderData.totalPnl,
      level: traderData.level,
      levelEmoji: traderData.levelEmoji,
      riskPerTrade: traderData.riskPerTrade,
      defaultLeverage: traderData.defaultLeverage,
      totalDebt: traderData.totalDebt ?? 0,
      totalRepaid: traderData.totalRepaid ?? 0,
      lastUpdated: ts(traderData.lastUpdated ?? 0)!,
      adaptiveMinSlDistancePct: traderData.adaptive?.minSlDistancePct ?? 1,
      adaptiveMinConfidence: traderData.adaptive?.minConfidence ?? 60,
      adaptiveAvoidCoins: stringifyJson(traderData.adaptive?.avoidCoins ?? []),
      adaptiveMinRr: traderData.adaptive?.minRr ?? 1.5,
      adaptiveCounterTrendPenalty: traderData.adaptive?.counterTrendPenalty ?? 0.1,
      adaptiveLimitExpiryHours: traderData.adaptive?.limitExpiryHours ?? 2,
      adaptiveMarketEntryConditions: stringifyJson(traderData.adaptive?.marketEntryConditions ?? []),
      adaptiveLessonsVersion: traderData.adaptive?.lessonsVersion ?? 0,
    },
    create: {
      id: 'singleton',
      initialDeposit: traderData.initialDeposit,
      balance: traderData.balance,
      totalTrades: traderData.totalTrades,
      wins: traderData.wins,
      losses: traderData.losses,
      expired: traderData.expired,
      score: traderData.score,
      winRate: traderData.winRate,
      avgPnl: traderData.avgPnl,
      streak: traderData.streak,
      bestTrade: traderData.bestTrade,
      worstTrade: traderData.worstTrade,
      totalPnl: traderData.totalPnl,
      level: traderData.level,
      levelEmoji: traderData.levelEmoji,
      riskPerTrade: traderData.riskPerTrade,
      defaultLeverage: traderData.defaultLeverage,
      totalDebt: traderData.totalDebt ?? 0,
      totalRepaid: traderData.totalRepaid ?? 0,
      lastUpdated: ts(traderData.lastUpdated ?? 0)!,
      // Adaptive
      adaptiveMinSlDistancePct: traderData.adaptive?.minSlDistancePct ?? 1,
      adaptiveMinConfidence: traderData.adaptive?.minConfidence ?? 60,
      adaptiveAvoidCoins: stringifyJson(traderData.adaptive?.avoidCoins ?? []),
      adaptiveMinRr: traderData.adaptive?.minRr ?? 1.5,
      adaptiveCounterTrendPenalty: traderData.adaptive?.counterTrendPenalty ?? 0.1,
      adaptiveLimitExpiryHours: traderData.adaptive?.limitExpiryHours ?? 2,
      adaptiveMarketEntryConditions: stringifyJson(traderData.adaptive?.marketEntryConditions ?? []),
      adaptiveLessonsVersion: traderData.adaptive?.lessonsVersion ?? 0,
    },
  });
  migrated.state = true;

  // Migrate Trades
  if (traderData.trades && Array.isArray(traderData.trades)) {
    for (const t of traderData.trades) {
      try {
        await db.trade.create({
          data: {
            id: t.id,
            coinId: t.coinId,
            coinSymbol: t.coinSymbol,
            direction: t.direction,
            entryType: t.entryType,
            entry: t.entry,
            currentPrice: t.currentPrice,
            stopLoss: t.stopLoss,
            takeProfit1: t.takeProfit1 ?? null,
            takeProfit2: t.takeProfit2 ?? null,
            takeProfit3: t.takeProfit3 ?? null,
            confidence: t.confidence,
            timeframe: t.timeframe,
            entryReason: t.entryReason,
            reasons: stringifyJson(t.reasons ?? []),
            leverage: t.leverage,
            positionSize: t.positionSize,
            quantity: t.quantity,
            timestamp: ts(t.timestamp)!,
            entryReached: t.entryReached ?? false,
            enteredAt: ts(t.enteredAt),
            resolved: t.resolved ?? false,
            result: t.result ?? null,
            exitPrice: t.exitPrice ?? null,
            exitReason: t.exitReason ?? null,
            closedAt: ts(t.closedAt),
            pnlUSDT: t.pnlUSDT ?? null,
            pnlPct: t.pnlPct ?? null,
            pointsChange: t.pointsChange ?? null,
            trailingStop: t.trailingStop ?? false,
            trailingStopPrice: t.trailingStopPrice ?? null,
            trailingStepPct: t.trailingStepPct ?? null,
            partialExits: stringifyJson(t.partialExits ?? []),
          },
        });
        migrated.trades++;
      } catch (e: any) {
        if (e?.code !== 'P2002') console.error(`[migrateFromJson] Trade ${t.id} error:`, e.message);
      }
    }
  }

  // Migrate Deposit Snapshots
  if (traderData.depositHistory && Array.isArray(traderData.depositHistory)) {
    for (const snap of traderData.depositHistory) {
      await db.depositSnapshot.create({
        data: {
          timestamp: ts(snap.timestamp)!,
          balance: snap.balance,
          equity: snap.equity,
        },
      });
      migrated.snapshots++;
    }
  }

  // Migrate Debt Entries
  if (traderData.debtHistory && Array.isArray(traderData.debtHistory)) {
    for (const d of traderData.debtHistory) {
      await db.debtEntry.create({
        data: {
          timestamp: ts(d.timestamp)!,
          amount: d.amount,
          remainingOwed: d.remainingOwed ?? d.amount,
          label: d.label ?? '',
        },
      });
      migrated.debts++;
    }
  }

  // Migrate lessons from adaptive
  if (traderData.adaptive?.lessons && Array.isArray(traderData.adaptive.lessons)) {
    for (const l of traderData.adaptive.lessons) {
      await db.lesson.create({
        data: {
          type: l.type ?? 'general',
          description: l.description ?? '',
          coinId: l.coinId ?? null,
          direction: l.direction ?? null,
          value: l.value ?? null,
          timestamp: ts(l.timestamp) ?? nowTs(),
          tradeId: l.tradeId ?? null,
          severity: l.severity ?? 'info',
        },
      });
      migrated.lessons++;
    }
  }

  // Migrate thoughts from trader-thinking.json
  const thoughtDataPath = path.join(process.cwd(), 'trader-thinking.json');
  if (fs.existsSync(thoughtDataPath)) {
    const thoughtData: JsonThoughtData = JSON.parse(fs.readFileSync(thoughtDataPath, 'utf-8'));
    if (thoughtData.thoughts && Array.isArray(thoughtData.thoughts)) {
      for (const t of thoughtData.thoughts) {
        try {
          await db.thought.create({
            data: {
              id: t.id,
              timestamp: ts(t.timestamp)!,
              type: t.type,
              title: t.title,
              detail: t.detail,
              coinSymbol: t.coinSymbol ?? null,
              coinId: t.coinId ?? null,
              direction: t.direction ?? null,
              confidence: t.confidence ?? null,
              score: t.score ?? null,
              tradeId: t.tradeId ?? null,
              pnl: t.pnl ?? null,
              entryType: t.entryType ?? null,
              emotion: t.emotion ?? 'neutral',
              tags: stringifyJson(t.tags ?? []),
            },
          });
          migrated.thoughts++;
        } catch (e: any) {
          if (e?.code !== 'P2002') console.error(`[migrateFromJson] Thought ${t.id} error:`, e.message);
        }
      }
    }
  }

  console.log(`[migrateFromJson] Migration complete:`, migrated);
  return migrated;
}