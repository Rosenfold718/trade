/**
 * adaptive-learning.ts — Enhanced adaptive learning system.
 *
 * Goes beyond basic mistake-based learning to include:
 *  1. Win pattern analysis (what works, not just what fails)
 *  2. Regime-aware parameter adjustment
 *  3. Consecutive loss protection (pause mechanism)
 *  4. Time-of-day awareness (basic)
 *  5. Confidence range optimization
 */

import type { MarketRegime } from './trading-engine';

// ─── Types ───

export interface RegimeParams {
  minConfidence: number;
  minRr: number;
  leverageMultiplier: number;
}

export interface WinPatterns {
  bestTimeframe: string;
  bestDirectionBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  bestConfidenceRange: [number, number];
  avgWinningHoldHours: number;
  consecutiveLossThreshold: number;
  pauseUntilTimestamp: number | null;
  bestHours: number[];        // top 3 hours (0-23 UTC) with best results
  worstHours: number[];       // bottom 3 hours (0-23 UTC) with worst results
}

export interface EnhancedAdaptiveParams {
  // Existing base parameters
  minSlDistancePct: number;
  minConfidence: number;
  avoidCoins: string[];
  minRr: number;
  counterTrendPenalty: number;
  limitExpiryHours: number;

  // NEW: Regime-aware parameters
  regimeParams: {
    TRENDING_UP: RegimeParams;
    TRENDING_DOWN: RegimeParams;
    RANGING: RegimeParams;
    VOLATILE: RegimeParams;
  };

  // NEW: Win pattern analysis
  winPatterns: WinPatterns;

  // Existing
  lessons: any[];
  lessonsVersion: number;
}

// ─── Defaults ───

const DEFAULT_REGIME_PARAMS: { TRENDING_UP: RegimeParams; TRENDING_DOWN: RegimeParams; RANGING: RegimeParams; VOLATILE: RegimeParams } = {
  TRENDING_UP: {
    minConfidence: 55,    // Lower threshold — trend helps
    minRr: 1.3,
    leverageMultiplier: 1.2,
  },
  TRENDING_DOWN: {
    minConfidence: 55,
    minRr: 1.3,
    leverageMultiplier: 1.2,
  },
  RANGING: {
    minConfidence: 70,    // Higher threshold — no trend support
    minRr: 1.8,           // Better R:R needed
    leverageMultiplier: 0.8,
  },
  VOLATILE: {
    minConfidence: 65,
    minRr: 1.5,
    leverageMultiplier: 0.6,  // Reduce leverage in volatile markets
  },
};

const DEFAULT_WIN_PATTERNS: WinPatterns = {
  bestTimeframe: '1h',
  bestDirectionBias: 'NEUTRAL',
  bestConfidenceRange: [65, 85],
  avgWinningHoldHours: 1.5,
  consecutiveLossThreshold: 3,
  pauseUntilTimestamp: null,
  bestHours: [],
  worstHours: [],
};

export const DEFAULT_ENHANCED_ADAPTIVE: EnhancedAdaptiveParams = {
  minSlDistancePct: 1.0,
  minConfidence: 60,
  avoidCoins: ['tether', 'usd-coin', 'dai', 'binance-usd', 'staked-ether', 'wrapped-bitcoin', 'usds'],
  minRr: 1.5,
  counterTrendPenalty: 0.1,
  limitExpiryHours: 2,
  regimeParams: { ...DEFAULT_REGIME_PARAMS },
  winPatterns: { ...DEFAULT_WIN_PATTERNS },
  lessons: [],
  lessonsVersion: 0,
};

// ─── Trade type for pattern analysis ───

interface TradeForAnalysis {
  id: string;
  coinId: string;
  coinSymbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  timeframe: string;
  enteredAt: number | null | bigint;
  closedAt: number | null | bigint;
  resolved?: boolean;
  result: 'WIN' | 'LOSS' | 'EXPIRED' | null;
  pnlUSDT: number | null;
  timestamp: number | bigint;
}

// ─── 1. Analyze trade patterns ───

/**
 * Analyze all resolved trades to find patterns in what works and what doesn't.
 * Returns actionable recommendations.
 */
export function analyzeTradePatterns(trades: TradeForAnalysis[]): {
  bestTimeframe: string;
  bestDirectionBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  bestConfidenceRange: [number, number];
  avgWinningHoldHours: number;
  recommendations: string[];
  bestHours: number[];
  worstHours: number[];
} {
  const resolved = trades.filter(
    (t) => t.resolved !== false && (t.result === 'WIN' || t.result === 'LOSS') && t.closedAt != null,
  );

  if (resolved.length < 3) {
    return {
      bestTimeframe: '1h',
      bestDirectionBias: 'NEUTRAL',
      bestConfidenceRange: [65, 85],
      avgWinningHoldHours: 0,
      recommendations: ['Недостаточно данных для анализа паттернов (мин. 3 сделки)'],
      bestHours: [],
      worstHours: [],
    };
  }

  const wins = resolved.filter((t) => t.result === 'WIN');
  const losses = resolved.filter((t) => t.result === 'LOSS');
  const recommendations: string[] = [];

  // ── Timeframe analysis ──
  const tfWinRate = new Map<string, { wins: number; total: number }>();
  for (const t of resolved) {
    const tf = t.timeframe || 'unknown';
    const existing = tfWinRate.get(tf) ?? { wins: 0, total: 0 };
    existing.total++;
    if (t.result === 'WIN') existing.wins++;
    tfWinRate.set(tf, existing);
  }
  let bestTimeframe = '1h';
  let bestTfWinRate = 0;
  for (const [tf, stats] of tfWinRate.entries()) {
    if (stats.total >= 3) {
      const wr = stats.wins / stats.total;
      if (wr > bestTfWinRate) {
        bestTfWinRate = wr;
        bestTimeframe = tf;
      }
    }
  }
  // Check if other TFs are significantly worse
  for (const [tf, stats] of tfWinRate.entries()) {
    if (tf !== bestTimeframe && stats.total >= 3) {
      const wr = stats.wins / stats.total;
      if (bestTfWinRate > 0 && wr < bestTfWinRate * 0.6) {
        recommendations.push(
          `Таймфрейм ${tf} показывает низкий винрейт (${(wr * 100).toFixed(0)}%) — лучше ${bestTimeframe} (${(bestTfWinRate * 100).toFixed(0)}%)`,
        );
      }
    }
  }

  // ── Direction bias ──
  let longWins = 0, longTotal = 0, shortWins = 0, shortTotal = 0;
  for (const t of resolved) {
    if (t.direction === 'LONG') { longTotal++; if (t.result === 'WIN') longWins++; }
    else if (t.direction === 'SHORT') { shortTotal++; if (t.result === 'WIN') shortWins++; }
  }
  const longWr = longTotal > 0 ? longWins / longTotal : 0;
  const shortWr = shortTotal > 0 ? shortWins / shortTotal : 0;
  let bestDirectionBias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (longTotal >= 3 && shortTotal >= 3) {
    const diff = Math.abs(longWr - shortWr);
    if (diff > 0.15) {
      bestDirectionBias = longWr > shortWr ? 'LONG' : 'SHORT';
      recommendations.push(
        `Смещение: ${bestDirectionBias} показывает винрейт ${((bestDirectionBias === 'LONG' ? longWr : shortWr) * 100).toFixed(0)}% — учитывайте при входе`,
      );
    }
  } else if (longTotal >= 5 && longWr > 0.55) {
    bestDirectionBias = 'LONG';
  } else if (shortTotal >= 5 && shortWr > 0.55) {
    bestDirectionBias = 'SHORT';
  }

  // ── Confidence range ──
  const confidenceBuckets = new Map<string, { wins: number; total: number }>();
  for (const t of resolved) {
    const bucket = t.confidence < 60 ? '50-59'
      : t.confidence < 70 ? '60-69'
      : t.confidence < 80 ? '70-79'
      : t.confidence < 90 ? '80-89'
      : '90+';
    const existing = confidenceBuckets.get(bucket) ?? { wins: 0, total: 0 };
    existing.total++;
    if (t.result === 'WIN') existing.wins++;
    confidenceBuckets.set(bucket, existing);
  }
  let bestBucket = '70-79';
  let bestBucketWr = 0;
  for (const [bucket, stats] of confidenceBuckets.entries()) {
    if (stats.total >= 3) {
      const wr = stats.wins / stats.total;
      if (wr > bestBucketWr) {
        bestBucketWr = wr;
        bestBucket = bucket;
      }
    }
  }
  const rangeMap: Record<string, [number, number]> = {
    '50-59': [50, 59],
    '60-69': [60, 69],
    '70-79': [70, 79],
    '80-89': [80, 89],
    '90+': [90, 100],
  };
  const bestConfidenceRange = rangeMap[bestBucket] ?? [65, 85];

  if (bestBucketWr > 0) {
    recommendations.push(
      `Лучший диапазон уверенности: ${bestBucket} (винрейт ${(bestBucketWr * 100).toFixed(0)}%)`,
    );
  }

  // ── Average winning hold time ──
  let totalWinHoldMs = 0;
  let winHoldCount = 0;
  for (const t of wins) {
    if (t.enteredAt && t.closedAt) {
      const enteredAt = typeof t.enteredAt === 'bigint' ? Number(t.enteredAt) : t.enteredAt;
      const closedAt = typeof t.closedAt === 'bigint' ? Number(t.closedAt) : t.closedAt;
      totalWinHoldMs += closedAt - enteredAt;
      winHoldCount++;
    }
  }
  const avgWinningHoldHours = winHoldCount > 0 ? totalWinHoldMs / winHoldCount / 3600000 : 1.5;

  if (avgWinningHoldHours > 0) {
    recommendations.push(
      `Среднее время удержания прибыльных сделок: ${avgWinningHoldHours.toFixed(1)} ч`,
    );
  }

  // ── Time-of-day analysis ──
  const hourStats = new Map<number, { wins: number; total: number; pnl: number }>();
  for (const t of resolved) {
    const closedAt = t.closedAt ? (typeof t.closedAt === 'bigint' ? Number(t.closedAt) : t.closedAt) : (typeof t.timestamp === 'bigint' ? Number(t.timestamp) : t.timestamp);
    const hour = new Date(closedAt).getUTCHours();
    const existing = hourStats.get(hour) ?? { wins: 0, total: 0, pnl: 0 };
    existing.total++;
    if (t.result === 'WIN') existing.wins++;
    existing.pnl += t.pnlUSDT ?? 0;
    hourStats.set(hour, existing);
  }

  // Find best/worst hours (need at least 2 trades)
  const hourEntries = Array.from(hourStats.entries())
    .filter(([, s]) => s.total >= 2)
    .sort((a, b) => (b[1].pnl / b[1].total) - (a[1].pnl / a[1].total));

  const bestHours = hourEntries.slice(0, 3).map(([h]) => h);
  const worstHours = hourEntries.slice(-3).reverse().map(([h]) => h);

  if (bestHours.length > 0 && worstHours.length > 0) {
    const bestHourLabels = bestHours.map((h) => `${h}:00 UTC`).join(', ');
    const worstHourLabels = worstHours.map((h) => `${h}:00 UTC`).join(', ');
    recommendations.push(
      `Лучшие часы: ${bestHourLabels}`,
    );
    recommendations.push(
      `Худшие часы: ${worstHourLabels} — осторожнее`,
    );
  }

  return {
    bestTimeframe,
    bestDirectionBias,
    bestConfidenceRange,
    avgWinningHoldHours,
    recommendations,
    bestHours,
    worstHours,
  };
}

// ─── 2. Get regime-adjusted parameters ───

/**
 * Return minConfidence, minRr, and leverageMultiplier adjusted for the current
 * market regime. In RANGING markets, require higher confidence. In TRENDING,
 * allow lower thresholds. In VOLATILE, reduce leverage.
 */
export function getRegimeParams(
  params: EnhancedAdaptiveParams,
  regime: MarketRegime | string,
): RegimeParams {
  const regimeConfig = params.regimeParams[regime as keyof typeof params.regimeParams];
  if (!regimeConfig) {
    // Fallback to base params if regime not recognized
    return {
      minConfidence: params.minConfidence,
      minRr: params.minRr,
      leverageMultiplier: 1.0,
    };
  }

  return {
    // Use the more restrictive of base and regime params
    minConfidence: Math.max(params.minConfidence, regimeConfig.minConfidence),
    minRr: Math.max(params.minRr, regimeConfig.minRr),
    leverageMultiplier: regimeConfig.leverageMultiplier,
  };
}

// ─── 3. Check if trading should be paused ───

/**
 * After consecutive losses, pause trading for a cooldown period.
 * Returns whether trading should be paused and when it can resume.
 */
export function shouldPauseTrading(params: EnhancedAdaptiveParams): {
  paused: boolean;
  reason: string;
  resumeAt: number | null;
} {
  const { pauseUntilTimestamp, consecutiveLossThreshold } = params.winPatterns;

  if (pauseUntilTimestamp && Date.now() < pauseUntilTimestamp) {
    const minutesLeft = Math.ceil((pauseUntilTimestamp - Date.now()) / 60000);
    return {
      paused: true,
      reason: `Пауза после серии убытков. Возобновление через ${minutesLeft} мин`,
      resumeAt: pauseUntilTimestamp,
    };
  }

  // Clear expired pause
  if (pauseUntilTimestamp && Date.now() >= pauseUntilTimestamp) {
    return {
      paused: false,
      reason: '',
      resumeAt: null,
    };
  }

  return {
    paused: false,
    reason: '',
    resumeAt: null,
  };
}

// ─── 4. Update adaptive params from a new trade result ───

/**
 * Process a new trade result and update adaptive parameters.
 * Learns from both wins and losses.
 * Returns updated params, new lessons, and insights.
 */
export function updateAdaptiveFromTrade(
  params: EnhancedAdaptiveParams,
  trade: {
    id: string;
    coinId: string;
    coinSymbol: string;
    direction: 'LONG' | 'SHORT';
    confidence: number;
    timeframe: string;
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    result: 'WIN' | 'LOSS' | 'EXPIRED';
    pnlUSDT: number | null;
    enteredAt: number | null;
    closedAt: number | null;
    exitReason?: string | null;
  },
): { params: EnhancedAdaptiveParams; newLessons: any[]; insights: string[] } {
  const updatedParams = { ...params, winPatterns: { ...params.winPatterns }, lessons: [...params.lessons] };
  const newLessons: any[] = [];
  const insights: string[] = [];

  const isWin = trade.result === 'WIN';
  const isLoss = trade.result === 'LOSS';
  const slDistancePct = (Math.abs(trade.entry - trade.stopLoss) / trade.entry) * 100;
  const rr = Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.entry - trade.stopLoss);

  // ── Learn from LOSSES ──

  if (isLoss) {
    // 1. SL too close
    if (slDistancePct < updatedParams.minSlDistancePct) {
      const severity = slDistancePct < updatedParams.minSlDistancePct * 0.3 ? 'high'
        : slDistancePct < updatedParams.minSlDistancePct * 0.6 ? 'medium' : 'low';
      newLessons.push({
        type: 'sl_too_close',
        description: `SL слишком близко (${slDistancePct.toFixed(2)}% от входа) — рыночный шум выбил позицию. Минимум ${updatedParams.minSlDistancePct.toFixed(1)}%`,
        coinId: trade.coinId,
        direction: trade.direction,
        value: slDistancePct,
        timestamp: Date.now(),
        tradeId: trade.id,
        severity,
      });
      // Gradually increase min SL distance
      updatedParams.minSlDistancePct = Math.min(
        updatedParams.minSlDistancePct + 0.1,
        3.0, // Cap at 3%
      );
      insights.push(`Повышен мин. SL до ${updatedParams.minSlDistancePct.toFixed(1)}%`);
    }

    // 2. Low confidence loss
    if (trade.confidence < updatedParams.minConfidence) {
      newLessons.push({
        type: 'low_confidence',
        description: `Низкая уверенность (${trade.confidence}%) — сделка убыточна. Минимум ${updatedParams.minConfidence}%`,
        coinId: trade.coinId,
        direction: trade.direction,
        value: trade.confidence,
        timestamp: Date.now(),
        tradeId: trade.id,
        severity: trade.confidence < 50 ? 'high' : 'medium',
      });
      updatedParams.minConfidence = Math.min(updatedParams.minConfidence + 2, 85);
      insights.push(`Повышена мин. уверенность до ${updatedParams.minConfidence}%`);
    }

    // 3. Bad R:R ratio
    if (rr < updatedParams.minRr) {
      newLessons.push({
        type: 'bad_rr',
        description: `Плохой R:R (${rr.toFixed(1)}:1) — убыточная сделка. Минимум ${updatedParams.minRr}:1`,
        coinId: trade.coinId,
        direction: trade.direction,
        value: rr,
        timestamp: Date.now(),
        tradeId: trade.id,
        severity: rr < 1.0 ? 'high' : 'medium',
      });
      updatedParams.minRr = Math.min(updatedParams.minRr + 0.1, 3.0);
      insights.push(`Повышен мин. R:R до ${updatedParams.minRr.toFixed(1)}:1`);
    }

    // 4. Consistently losing coin
    const coinLosses = updatedParams.lessons.filter(
      (l) => l.coinId === trade.coinId && l.type === 'bad_coin' || (
        l.coinId === trade.coinId && l.type === 'sl_too_close' && l.severity === 'high'
      ),
    );
    if (coinLosses.length >= 3 && !updatedParams.avoidCoins.includes(trade.coinId)) {
      updatedParams.avoidCoins.push(trade.coinId);
      newLessons.push({
        type: 'bad_coin',
        description: `${trade.coinSymbol} добавлена в избегаемые (${coinLosses.length} убыточных урока)`,
        coinId: trade.coinId,
        timestamp: Date.now(),
        tradeId: trade.id,
        severity: 'high',
      });
      insights.push(`${trade.coinSymbol} добавлена в чёрный список`);
    }

    // 5. Consecutive loss protection — set pause
    // Check if the last 3 lessons are all losses
    const recentLossLessons = updatedParams.lessons
      .filter((l) => l.type !== 'win_pattern')
      .slice(-updatedParams.winPatterns.consecutiveLossThreshold);
    const allRecentLosses = recentLossLessons.every(
      (l) => ['sl_too_close', 'low_confidence', 'bad_rr', 'bad_coin', 'counter_trend', 'limit_expired'].includes(l.type),
    );
    if (allRecentLosses && recentLossLessons.length >= updatedParams.winPatterns.consecutiveLossThreshold) {
      const pauseMs = 30 * 60 * 1000; // 30 minutes
      updatedParams.winPatterns.pauseUntilTimestamp = Date.now() + pauseMs;
      newLessons.push({
        type: 'consecutive_loss_pause',
        description: `Пауза: ${updatedParams.winPatterns.consecutiveLossThreshold} убытков подряд. Перерыв на 30 минут`,
        timestamp: Date.now(),
        tradeId: trade.id,
        severity: 'high',
      });
      insights.push(`Пауза торговли на 30 мин после серии убытков`);
    }
  }

  // ── Learn from WINS ──

  if (isWin) {
    // 1. Record what worked
    newLessons.push({
      type: 'win_pattern',
      description: `Успешная сделка: ${trade.coinSymbol} ${trade.direction} @ уверенность ${trade.confidence}%, R:R ${rr.toFixed(1)}:1, TF ${trade.timeframe}`,
      coinId: trade.coinId,
      direction: trade.direction,
      value: trade.pnlUSDT,
      timestamp: Date.now(),
      tradeId: trade.id,
      severity: 'low',
    });

    insights.push(
      `Прибыльная сделка: ${trade.coinSymbol} ${trade.direction} +${(trade.pnlUSDT ?? 0).toFixed(2)}$`,
    );

    // 2. If confidence was high and won, we can slightly relax
    if (trade.confidence >= 75) {
      // Don't lower below 50
      updatedParams.minConfidence = Math.max(updatedParams.minConfidence - 1, 50);
    }

    // 3. If R:R was good, slightly relax
    if (rr >= 2.0) {
      updatedParams.minRr = Math.max(updatedParams.minRr - 0.05, 1.2);
    }

    // 4. Clear consecutive loss pause on a win
    if (updatedParams.winPatterns.pauseUntilTimestamp) {
      updatedParams.winPatterns.pauseUntilTimestamp = null;
      insights.push('Пауза снята — прибыльная сделка');
    }
  }

  // ── Handle EXPIRED ──

  if (trade.result === 'EXPIRED') {
    newLessons.push({
      type: 'limit_expired',
      description: `Лимитный ордер не исполнен (${trade.coinSymbol}) — возможно цена не достигла входа`,
      coinId: trade.coinId,
      direction: trade.direction,
      timestamp: Date.now(),
      tradeId: trade.id,
      severity: 'low',
    });
    insights.push(`Лимитный ордер просрочен: ${trade.coinSymbol}`);
  }

  // Add all new lessons (cap at 200 total)
  updatedParams.lessons = [...updatedParams.lessons, ...newLessons].slice(-200);
  updatedParams.lessonsVersion++;

  return {
    params: updatedParams,
    newLessons,
    insights,
  };
}

// ─── 5. Initialize from legacy adaptive params ───

/**
 * Convert the existing (legacy) AdaptiveParams to the new EnhancedAdaptiveParams.
 * This is for backward compatibility during migration.
 */
export function migrateToEnhanced(legacy: {
  minSlDistancePct: number;
  minConfidence: number;
  avoidCoins: string[];
  minRr: number;
  counterTrendPenalty: number;
  limitExpiryHours: number;
  lessons: any[];
  lessonsVersion: number;
}): EnhancedAdaptiveParams {
  return {
    minSlDistancePct: legacy.minSlDistancePct,
    minConfidence: legacy.minConfidence,
    avoidCoins: legacy.avoidCoins,
    minRr: legacy.minRr,
    counterTrendPenalty: legacy.counterTrendPenalty,
    limitExpiryHours: legacy.limitExpiryHours,
    regimeParams: { ...DEFAULT_REGIME_PARAMS },
    winPatterns: { ...DEFAULT_WIN_PATTERNS },
    lessons: legacy.lessons,
    lessonsVersion: legacy.lessonsVersion,
  };
}

// ─── 6. Get time-of-day penalty ───

/**
 * Returns a penalty multiplier (0-1) based on current UTC hour.
 * 1.0 = normal, lower = less favorable.
 * Only applies if we have enough data to determine best/worst hours.
 */
export function getTimeOfDayMultiplier(params: EnhancedAdaptiveParams): number {
  const { bestHours, worstHours } = params.winPatterns;
  if (bestHours.length === 0 || worstHours.length === 0) return 1.0;

  const currentHour = new Date().getUTCHours();

  if (worstHours.includes(currentHour)) {
    return 0.5; // 50% penalty for worst hours
  }
  if (bestHours.includes(currentHour)) {
    return 1.1; // 10% bonus for best hours
  }
  return 1.0;
}

// ─── 7. Get comprehensive trade assessment ───

/**
 * Assess a potential trade against all adaptive rules.
 * Returns a score, reasons to reject, and suggested adjustments.
 */
export function assessTrade(
  params: EnhancedAdaptiveParams,
  trade: {
    coinId: string;
    coinSymbol: string;
    direction: 'LONG' | 'SHORT';
    confidence: number;
    timeframe: string;
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    regime?: MarketRegime | string;
  },
): {
  approved: boolean;
  score: number;
  reasons: string[];
  adjustedLeverageMultiplier: number;
  adjustedMinConfidence: number;
  adjustedMinRr: number;
} {
  const reasons: string[] = [];
  let score = 100;

  // Check pause
  const pauseResult = shouldPauseTrading(params);
  if (pauseResult.paused) {
    return {
      approved: false,
      score: 0,
      reasons: [pauseResult.reason],
      adjustedLeverageMultiplier: 0,
      adjustedMinConfidence: params.minConfidence,
      adjustedMinRr: params.minRr,
    };
  }

  // Avoid coins
  if (params.avoidCoins.includes(trade.coinId)) {
    reasons.push(`${trade.coinSymbol} в списке избегаемых монет`);
    score -= 50;
  }

  // Regime-adjusted parameters
  const regimeKey = trade.regime || 'RANGING';
  const regimeAdj = getRegimeParams(params, regimeKey);
  let adjustedLeverageMultiplier = regimeAdj.leverageMultiplier;
  let adjustedMinConfidence = regimeAdj.minConfidence;
  let adjustedMinRr = regimeAdj.minRr;

  // Confidence check
  if (trade.confidence < adjustedMinConfidence) {
    reasons.push(
      `Уверенность ${trade.confidence}% ниже минимума ${adjustedMinConfidence}% (${regimeKey})`,
    );
    score -= 30;
  }

  // SL distance check
  const slDistPct = (Math.abs(trade.entry - trade.stopLoss) / trade.entry) * 100;
  if (slDistPct < params.minSlDistancePct) {
    reasons.push(
      `SL слишком близко: ${slDistPct.toFixed(2)}% (мин. ${params.minSlDistancePct.toFixed(1)}%)`,
    );
    score -= 25;
  }

  // R:R check
  const rr = Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.entry - trade.stopLoss);
  if (rr < adjustedMinRr) {
    reasons.push(
      `R:R ${rr.toFixed(1)}:1 ниже минимума ${adjustedMinRr.toFixed(1)}:1`,
    );
    score -= 20;
  }

  // Timeframe preference
  if (params.winPatterns.bestTimeframe !== 'unknown' && trade.timeframe !== params.winPatterns.bestTimeframe) {
    // Soft penalty — not a rejection
    score -= 5;
  }

  // Time-of-day multiplier
  const todMultiplier = getTimeOfDayMultiplier(params);
  if (todMultiplier < 1.0) {
    adjustedLeverageMultiplier *= todMultiplier;
    reasons.push('Текущий час — низкая эффективность по статистике');
    score -= 10;
  } else if (todMultiplier > 1.0) {
    score += 5;
  }

  // Direction bias
  if (
    params.winPatterns.bestDirectionBias !== 'NEUTRAL' &&
    trade.direction !== params.winPatterns.bestDirectionBias
  ) {
    score -= 5;
  }

  // Confidence range bonus
  if (
    trade.confidence >= params.winPatterns.bestConfidenceRange[0] &&
    trade.confidence <= params.winPatterns.bestConfidenceRange[1]
  ) {
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    approved: score >= 40 && reasons.filter((r) => !r.includes('избегаемых')).length === 0,
    score,
    reasons,
    adjustedLeverageMultiplier,
    adjustedMinConfidence,
    adjustedMinRr,
  };
}