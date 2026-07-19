/**
 * trading-engine.ts — Advanced trading engine utilities.
 *
 * Modules:
 *  1. Commission & Slippage Model (calculateRealisticPnL)
 *  2. Trailing Stop Logic (updateTrailingStop)
 *  3. Partial Take Profit Logic (checkPartialExits)
 *  4. Kelly Criterion Position Sizing (kellyCriterion)
 *  5. Portfolio Risk Manager (checkPortfolioRisk)
 *  6. Market Regime Detector (detectMarketRegime)
 */

import type { OHLCV } from './technical-analysis';
import { ATR, ADX, EMA } from './technical-analysis';

// ============================================
// TYPES — Re-export / local trade shape
// ============================================

/** Minimal trade interface used by engine functions. */
export interface EngineTrade {
  id: string;
  coinId: string;
  coinSymbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  leverage: number;
  quantity: number;
  positionSize: number;
  confidence: number;
  // Optional advanced fields
  trailingStop?: boolean;
  trailingStepPct?: number;
  highestPrice?: number;    // track highest seen price (for trailing stop)
  lowestPrice?: number;     // track lowest seen price (for trailing stop)
  partialExits?: string;    // JSON string of PartialExit[]
  remainingQuantity?: number; // remaining after partial exits
}

// ============================================
// 1. COMMISSION & SLIPPAGE MODEL
// ============================================

export const COMMISSION_RATE = 0.001;       // 0.1% per side (Binance default)
export const DEFAULT_SLIPPAGE = 0.0005;     // 0.05% average slippage

export function calculateRealisticPnL(params: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  slippagePct?: number;
}): { grossPnl: number; commission: number; slippage: number; netPnl: number } {
  const { direction, entryPrice, exitPrice, quantity, leverage, slippagePct = DEFAULT_SLIPPAGE } = params;

  // Raw price difference PnL (before leverage)
  const rawDiff = direction === 'LONG'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;

  const grossPnl = rawDiff * leverage;

  // Commission: 0.1% on entry + 0.1% on exit
  const commission =
    entryPrice * quantity * COMMISSION_RATE +
    exitPrice * quantity * COMMISSION_RATE;

  // Slippage: applied against direction
  // For LONG: entry slips up, exit slips down → both cost
  // For SHORT: entry slips down, exit slips up → both cost
  const slippage =
    entryPrice * quantity * slippagePct +
    exitPrice * quantity * slippagePct;

  const netPnl = grossPnl - commission - slippage;

  return {
    grossPnl: Math.round(grossPnl * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    slippage: Math.round(slippage * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
  };
}

// ============================================
// 2. TRAILING STOP LOGIC
// ============================================

export function updateTrailingStop(
  trade: EngineTrade,
  currentPrice: number,
  currentAtr?: number,
): { newStopLoss: number | null; triggered: boolean; reason: string } {
  // If trailing stop is not enabled, no change
  if (!trade.trailingStop) {
    return { newStopLoss: null, triggered: false, reason: 'trailing_disabled' };
  }

  const stepPct = trade.trailingStepPct || 0.01; // default 1% step
  const entry = trade.entry;
  let highest = trade.highestPrice || entry;
  let lowest = trade.lowestPrice || entry;

  // Update high/low tracking
  if (currentPrice > highest) highest = currentPrice;
  if (currentPrice < lowest) lowest = currentPrice;

  if (trade.direction === 'LONG') {
    // For LONG: stop moves UP, never down
    const activationPrice = entry * (1 + stepPct);

    if (currentPrice <= activationPrice) {
      // Not yet activated — return updated tracking
      return {
        newStopLoss: null,
        triggered: false,
        reason: `awaiting_activation (${((currentPrice - entry) / entry * 100).toFixed(2)}% / ${stepPct * 100}%)`,
      };
    }

    // Activated — calculate new stop loss
    let newStop: number;
    if (currentAtr && currentAtr > 0) {
      // ATR-based trailing: stop = highest - ATR * 1.5
      newStop = highest - currentAtr * 1.5;
      // But first move is always to breakeven
      const breakevenStop = entry;
      newStop = Math.max(newStop, breakevenStop);
    } else {
      // Simple percentage-based: stop at entry (breakeven) initially
      newStop = entry;
    }

    // Never move stop down
    const currentSL = trade.stopLoss;
    if (newStop <= currentSL) {
      // Check if current price hits existing stop
      if (currentPrice <= currentSL) {
        return { newStopLoss: null, triggered: true, reason: `trailing_stop_hit at $${currentSL.toFixed(2)}` };
      }
      return { newStopLoss: null, triggered: false, reason: 'stop_not_moved_up' };
    }

    // Check if price hit the new stop
    if (currentPrice <= newStop) {
      return { newStopLoss: newStop, triggered: true, reason: `trailing_stop_hit at $${newStop.toFixed(2)}` };
    }

    return {
      newStopLoss: newStop,
      triggered: false,
      reason: `trailing_stop_moved to $${newStop.toFixed(2)} (high: $${highest.toFixed(2)})`,
    };
  } else {
    // SHORT: mirror logic — stop moves DOWN, never up
    const activationPrice = entry * (1 - stepPct);

    if (currentPrice >= activationPrice) {
      return {
        newStopLoss: null,
        triggered: false,
        reason: `awaiting_activation (${((entry - currentPrice) / entry * 100).toFixed(2)}% / ${stepPct * 100}%)`,
      };
    }

    let newStop: number;
    if (currentAtr && currentAtr > 0) {
      // ATR-based trailing: stop = lowest + ATR * 1.5
      newStop = lowest + currentAtr * 1.5;
      const breakevenStop = entry;
      newStop = Math.min(newStop, breakevenStop);
    } else {
      newStop = entry;
    }

    // Never move stop up (for shorts)
    const currentSL = trade.stopLoss;
    if (newStop >= currentSL) {
      if (currentPrice >= currentSL) {
        return { newStopLoss: null, triggered: true, reason: `trailing_stop_hit at $${currentSL.toFixed(2)}` };
      }
      return { newStopLoss: null, triggered: false, reason: 'stop_not_moved_down' };
    }

    if (currentPrice >= newStop) {
      return { newStopLoss: newStop, triggered: true, reason: `trailing_stop_hit at $${newStop.toFixed(2)}` };
    }

    return {
      newStopLoss: newStop,
      triggered: false,
      reason: `trailing_stop_moved to $${newStop.toFixed(2)} (low: $${lowest.toFixed(2)})`,
    };
  }
}

// ============================================
// 3. PARTIAL TAKE PROFIT LOGIC
// ============================================

export interface PartialExit {
  tpLevel: number;     // 1, 2, or 3
  percent: number;     // e.g. 50 = close 50% of position
  price: number;       // actual exit price
  closedAt: number;    // timestamp
  pnl: number;         // PnL for this partial
  commission: number;
}

export function checkPartialExits(
  trade: EngineTrade,
  currentPrice: number,
): {
  exit: PartialExit | null;
  remainingQuantity: number;
  allClosed: boolean;
  reason: string;
} {
  // Parse existing partial exits
  let existingExits: PartialExit[] = [];
  if (trade.partialExits) {
    try {
      existingExits = JSON.parse(trade.partialExits);
    } catch {
      existingExits = [];
    }
  }

  const originalQuantity = trade.quantity;
  const totalExitedPct = existingExits.reduce((sum, e) => sum + e.percent, 0);
  const remainingPct = 100 - totalExitedPct;
  const currentRemainingQty = (trade.remainingQuantity ?? originalQuantity);

  // Determine which TP level to check next
  let nextTpLevel = 0;
  let nextTpPrice = 0;
  let nextTpPct = 0;
  let nextTpLabel = '';

  if (totalExitedPct === 0) {
    // TP1: close 50% of original, move SL to breakeven
    nextTpLevel = 1;
    nextTpPrice = trade.takeProfit1;
    nextTpPct = 50;
    nextTpLabel = 'TP1';
  } else if (totalExitedPct === 50) {
    // TP2: close 30% of original
    nextTpLevel = 2;
    nextTpPrice = trade.takeProfit2;
    nextTpPct = 30;
    nextTpLabel = 'TP2';
  } else if (totalExitedPct === 80) {
    // TP3: close remaining 20%
    nextTpLevel = 3;
    nextTpPrice = trade.takeProfit3;
    nextTpPct = 20;
    nextTpLabel = 'TP3';
  } else {
    // Already fully closed or invalid state
    return {
      exit: null,
      remainingQuantity: currentRemainingQty,
      allClosed: totalExitedPct >= 100,
      reason: 'all_levels_exhausted',
    };
  }

  if (nextTpPrice <= 0) {
    return {
      exit: null,
      remainingQuantity: currentRemainingQty,
      allClosed: false,
      reason: `no_${nextTpLabel.toLowerCase()}_price`,
    };
  }

  // Check if price hit the TP level
  const hit = trade.direction === 'LONG'
    ? currentPrice >= nextTpPrice
    : currentPrice <= nextTpPrice;

  if (!hit) {
    return {
      exit: null,
      remainingQuantity: currentRemainingQty,
      allClosed: false,
      reason: `${nextTpLabel}_not_reached`,
    };
  }

  // Calculate partial quantity to close
  const closeQuantity = originalQuantity * (nextTpPct / 100);
  const actualCloseQty = Math.min(closeQuantity, currentRemainingQty);
  const actualClosePct = (actualCloseQty / originalQuantity) * 100;

  // Calculate PnL for this partial exit
  const pnlResult = calculateRealisticPnL({
    direction: trade.direction,
    entryPrice: trade.entry,
    exitPrice: nextTpPrice,
    quantity: actualCloseQty,
    leverage: trade.leverage,
  });

  const exitRecord: PartialExit = {
    tpLevel: nextTpLevel,
    percent: nextTpPct,
    price: nextTpPrice,
    closedAt: Date.now(),
    pnl: pnlResult.netPnl,
    commission: pnlResult.commission,
  };

  const newExits = [...existingExits, exitRecord];
  const newRemainingQty = currentRemainingQty - actualCloseQty;
  const newTotalExitedPct = totalExitedPct + nextTpPct;
  const isAllClosed = newRemainingQty <= 0.000001 || newTotalExitedPct >= 100;

  return {
    exit: exitRecord,
    remainingQuantity: Math.max(0, newRemainingQty),
    allClosed: isAllClosed,
    reason: `${nextTpLabel}_hit — closed ${nextTpPct}% at $${nextTpPrice.toFixed(2)}`,
  };
}

// ============================================
// 4. KELLY CRITERION POSITION SIZING
// ============================================

export function kellyCriterion(params: {
  winRate: number;            // 0-1
  avgWinPct: number;          // average winning trade as % of position
  avgLossPct: number;         // average losing trade as % of position
  maxKellyFraction: number;   // cap (e.g. 0.25 = 25% of bankroll)
  currentDrawdownPct: number; // reduce size in drawdown (e.g. 20 = 20%)
}): { kellyFraction: number; adjustedFraction: number; recommendedRiskPct: number } {
  const { winRate, avgWinPct, avgLossPct, maxKellyFraction, currentDrawdownPct } = params;

  // Guard: avoid division by zero and nonsensical inputs
  if (avgLossPct <= 0 || winRate <= 0 || winRate >= 1) {
    return {
      kellyFraction: 0,
      adjustedFraction: 0,
      recommendedRiskPct: 1, // fallback to 1%
    };
  }

  // Kelly formula: f* = W - (1-W)/R, where R = avgWin / avgLoss
  const R = avgWinPct / avgLossPct;
  const kelly = winRate - (1 - winRate) / R;

  // Cap at maxKellyFraction (never risk more than 25% of bankroll)
  const cappedKelly = Math.max(0, Math.min(kelly, maxKellyFraction));

  // Reduce by drawdown: if drawdown 20%, reduce size by 50%
  // Linear reduction: 0% drawdown = full kelly, maxDrawdown = 0
  const drawdownReduction = Math.max(0, 1 - (currentDrawdownPct / 100) * 2.5);
  const adjustedFraction = cappedKelly * drawdownReduction;

  // Convert to recommended risk % (as percent, 1-25%)
  const recommendedRiskPct = Math.max(1, Math.round(adjustedFraction * 100));

  return {
    kellyFraction: Math.round(kelly * 10000) / 10000,
    adjustedFraction: Math.round(adjustedFraction * 10000) / 10000,
    recommendedRiskPct,
  };
}

// ============================================
// 5. PORTFOLIO RISK MANAGER
// ============================================

export interface RiskCheck {
  allowed: boolean;
  reason: string;
  maxPositionSize: number;
  adjustedLeverage: number;
}

export function checkPortfolioRisk(params: {
  freeBalance: number;
  openTrades: EngineTrade[];
  newDirection: 'LONG' | 'SHORT';
  newCoinId: string;
  newCoinSymbol: string;
  maxDrawdownPct: number;        // e.g. 20 = stop trading at 20% drawdown
  maxOpenPositions: number;      // e.g. 5
  maxCorrelatedPositions: number; // e.g. 3
  maxPortfolioRiskPct: number;   // e.g. 30% of balance in open positions
}): RiskCheck {
  const {
    freeBalance,
    openTrades,
    newDirection,
    newCoinId,
    newCoinSymbol,
    maxDrawdownPct,
    maxOpenPositions,
    maxCorrelatedPositions,
    maxPortfolioRiskPct,
  } = params;

  // Check 1: Max open positions
  if (openTrades.length >= maxOpenPositions) {
    return {
      allowed: false,
      reason: `Maximum open positions reached (${openTrades.length}/${maxOpenPositions})`,
      maxPositionSize: 0,
      adjustedLeverage: 1,
    };
  }

  // Check 2: Correlation — count same-direction open trades
  const sameDirectionTrades = openTrades.filter(t => t.direction === newDirection);
  if (sameDirectionTrades.length >= maxCorrelatedPositions) {
    return {
      allowed: false,
      reason: `Too many correlated ${newDirection} positions (${sameDirectionTrades.length}/${maxCorrelatedPositions})`,
      maxPositionSize: 0,
      adjustedLeverage: 1,
    };
  }

  // Check 3: Portfolio risk — total open margin as % of balance
  const totalOpenMargin = openTrades.reduce((sum, t) => sum + t.positionSize, 0);
  const portfolioRiskPct = freeBalance > 0 ? (totalOpenMargin / freeBalance) * 100 : 0;

  if (portfolioRiskPct >= maxPortfolioRiskPct) {
    return {
      allowed: false,
      reason: `Portfolio risk too high (${portfolioRiskPct.toFixed(1)}%/${maxPortfolioRiskPct}%)`,
      maxPositionSize: 0,
      adjustedLeverage: 1,
    };
  }

  // Check 4: Max drawdown (requires external balance info — we check via freeBalance vs initial context)
  // This is a soft check; the caller should pass the actual drawdown
  // Here we just flag if risk parameters indicate high risk
  if (freeBalance <= 0) {
    return {
      allowed: false,
      reason: 'No available balance',
      maxPositionSize: 0,
      adjustedLeverage: 1,
    };
  }

  // Calculate max position size and leverage adjustments
  const remainingRiskBudget = (maxPortfolioRiskPct - portfolioRiskPct) / 100;
  const maxPositionSize = freeBalance * remainingRiskBudget;

  // Adjust leverage if high correlation (many same-direction trades)
  let adjustedLeverage = 3; // default
  if (sameDirectionTrades.length >= 2) {
    // Reduce leverage progressively with correlated positions
    adjustedLeverage = Math.max(1, 3 - (sameDirectionTrades.length - 1));
  }

  // Don't allow new trade on the same coin in the same direction (already checked by caller, but double-check)
  const sameCoinTrade = openTrades.find(t => t.coinId === newCoinId && t.direction === newDirection);
  if (sameCoinTrade) {
    return {
      allowed: false,
      reason: `Already have a ${newDirection} position on ${newCoinSymbol}`,
      maxPositionSize: 0,
      adjustedLeverage: 1,
    };
  }

  return {
    allowed: true,
    reason: 'ok',
    maxPositionSize: Math.round(maxPositionSize * 100) / 100,
    adjustedLeverage,
  };
}

// ============================================
// 6. MARKET REGIME DETECTOR
// ============================================

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';

export interface RegimeResult {
  regime: MarketRegime;
  confidence: number;
  adx: number;
  atrPct: number;          // ATR as % of price
  recommendation: string;
}

export function detectMarketRegime(data: OHLCV[]): RegimeResult {
  // Need at least 30 data points
  if (!data || data.length < 30) {
    return {
      regime: 'RANGING',
      confidence: 0,
      adx: 0,
      atrPct: 0,
      recommendation: 'Insufficient data for regime detection',
    };
  }

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);

  // Calculate ADX (trend strength)
  const adxValues = ADX(highs, lows, closes, 14);
  const adx = adxValues.length > 0 ? adxValues[adxValues.length - 1] : 0;

  // Calculate ATR and ATR as % of price
  const atrValues = ATR(highs, lows, closes, 14);
  const lastAtr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;
  const atrPct = closes[closes.length - 1] > 0 ? (lastAtr / closes[closes.length - 1]) * 100 : 0;

  // Calculate EMA(20) slope for direction
  const ema20 = EMA(closes, 20);
  const lastEma = ema20.length > 0 ? ema20[ema20.length - 1] : 0;
  const prevEma = ema20.length > 1 ? ema20[ema20.length - 2] : lastEma;
  const emaSlope = lastEma > 0 ? ((lastEma - prevEma) / lastEma) * 100 : 0;

  // Determine regime
  let regime: MarketRegime;
  let confidence: number;
  let recommendation: string;

  if (atrPct > 5) {
    // High volatility overrides everything
    regime = 'VOLATILE';
    confidence = Math.min(95, 50 + atrPct * 5);
    recommendation = 'High volatility detected — reduce position size, widen stops, avoid new entries';
  } else if (adx > 50) {
    // Strong trend
    if (emaSlope > 0.05) {
      regime = 'TRENDING_UP';
      confidence = Math.min(95, 60 + adx * 0.5);
      recommendation = 'Strong uptrend — look for pullback LONG entries, use trailing stops';
    } else if (emaSlope < -0.05) {
      regime = 'TRENDING_DOWN';
      confidence = Math.min(95, 60 + adx * 0.5);
      recommendation = 'Strong downtrend — look for pullback SHORT entries, tight stops';
    } else {
      // ADX high but EMA flat — likely late trend, be cautious
      const prevPrice = closes.length > 5 ? closes[closes.length - 6] : closes[0];
      const recentChange = (closes[closes.length - 1] - prevPrice) / prevPrice * 100;
      regime = recentChange > 0.5 ? 'TRENDING_UP' : recentChange < -0.5 ? 'TRENDING_DOWN' : 'VOLATILE';
      confidence = 50;
      recommendation = 'High ADX but unclear direction — wait for confirmation before entry';
    }
  } else if (adx > 30) {
    // Moderate trend
    if (emaSlope > 0.02) {
      regime = 'TRENDING_UP';
      confidence = Math.min(80, 40 + adx * 0.5);
      recommendation = 'Moderate uptrend — standard trend-following strategies, moderate position size';
    } else if (emaSlope < -0.02) {
      regime = 'TRENDING_DOWN';
      confidence = Math.min(80, 40 + adx * 0.5);
      recommendation = 'Moderate downtrend — standard trend-following strategies, moderate position size';
    } else {
      regime = 'RANGING';
      confidence = Math.min(70, 30 + (30 - adx) * 2);
      recommendation = 'Weak trend with ranging price — use mean-reversion strategies, tight stops';
    }
  } else {
    // ADX < 20 = ranging / no trend
    regime = 'RANGING';
    confidence = Math.min(85, 50 + (20 - adx) * 2);
    recommendation = 'No clear trend — avoid trend-following, consider range-bound strategies or stay flat';
  }

  return {
    regime,
    confidence: Math.round(confidence),
    adx: Math.round(adx * 100) / 100,
    atrPct: Math.round(atrPct * 100) / 100,
    recommendation,
  };
}