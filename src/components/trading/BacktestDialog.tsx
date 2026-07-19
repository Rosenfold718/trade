'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Loader2, FlaskConical, Play, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ───

interface ViabilityInfo {
  score: number;
  isViable: boolean;
  warnings: string[];
  recommendation: string;
}

interface BacktestTrade {
  id: string;
  coinId: string;
  coinSymbol: string;
  direction: string;
  entry: number;
  exit: number;
  pnl: number;
  pnlPercent: number;
  outcome: string;
  date: string;
}

interface BacktestResult {
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    totalPnl: number;
    totalPnlPercent: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
    avgHoldingBars: number;
    startingBalance: number;
    finalBalance: number;
    viability: ViabilityInfo;
  };
  equityCurve: { step: number; equity: number; drawdown: number }[];
  trades: BacktestTrade[];
  parameters: {
    coinId: string;
    interval: string;
    days: number;
    startingBalance: number;
    leverage: number;
    strategy: string;
    rrRatio: number;
  };
}

interface BacktestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCoin: string;
  coinSymbol: string;
}

interface OhlcvCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const INTERVALS = [
  { value: '1m', label: '1М' },
  { value: '5m', label: '5М' },
  { value: '15m', label: '15М' },
  { value: '1h', label: '1Ч' },
  { value: '4h', label: '4Ч' },
];

const DAYS = [7, 14, 30, 60, 90, 180, 365];

const STRATEGY_OPTIONS = [
  { value: 'ema-cross-9-21', label: 'EMA 9/21 Кроссовер' },
  { value: 'ema-cross-12-26', label: 'EMA 12/26 Кроссовер' },
  { value: 'ema-cross-20-50', label: 'EMA 20/50 Кроссовер' },
  { value: 'ema-cross-50-200', label: 'EMA 50/200 Кроссовер' },
  { value: 'rsi-reversion', label: 'RSI Возвратность' },
  { value: 'rsi-divergence', label: 'RSI Дивергенция' },
  { value: 'macd-cross', label: 'MACD Кроссовер' },
  { value: 'bollinger-bounce', label: 'Bollinger Отскок' },
  { value: 'bollinger-squeeze', label: 'Bollinger Squeeze' },
  { value: 'stochastic-cross', label: 'Stochastic Кроссовер' },
  { value: 'breakout-20', label: 'Пробой 20-периодный' },
  { value: 'breakout-50', label: 'Пробой 50-периодный' },
  { value: 'vwap-reversion', label: 'VWAP Возвратность' },
  { value: 'multi-ema', label: 'Мульти-EMA (3 EMA)' },
  { value: 'supertrend', label: 'Supertrend' },
];

// ─── Indicator helpers ───

function calcEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push(0);
      continue;
    }
    if (i === period - 1) {
      const sum = data.slice(0, period).reduce((a, b) => a + b, 0);
      ema.push(sum / period);
    } else {
      ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
  }
  return ema;
}

function calcSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(0);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

function calcRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(50);
      gains.push(0);
      losses.push(0);
      continue;
    }
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      rsi.push(50);
      continue;
    }

    if (i === period) {
      const avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    } else {
      // Smoothed average
      const prevRsi = rsi[i - 1];
      // We need to track avgGain/avgLoss; recompute from the previous smoothed values
      // Recompute using exponential smoothing
      const prevAvgGain = gains.slice(i - period + 1, i).reduce((a, b) => a + b, 0) / period;
      const prevAvgLoss = losses.slice(i - period + 1, i).reduce((a, b) => a + b, 0) / period;
      const avgGain = (prevAvgGain * (period - 1) + gains[i]) / period;
      const avgLoss = (prevAvgLoss * (period - 1) + losses[i]) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  return rsi;
}

function calcATR(candles: OhlcvCandle[], period: number = 14): number[] {
  const atr: number[] = [];
  const trs: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
      atr.push(candles[i].high - candles[i].low);
      continue;
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trs.push(tr);

    if (i < period) {
      atr.push(0);
      continue;
    }

    if (i === period) {
      const sum = trs.slice(0, period + 1).reduce((a, b) => a + b, 0);
      atr.push(sum / (period + 1));
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr) / period);
    }
  }
  return atr;
}

function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }
  const signalLine = calcEMA(macdLine, signal);
  const histogram: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }
  return { macd: macdLine, signal: signalLine, histogram };
}

function calcBollingerBands(closes: number[], period = 20, stdDev = 2): { upper: number[]; middle: number[]; lower: number[]; bandwidth: number[] } {
  const middle = calcSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(0); lower.push(0); bandwidth.push(0); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + stdDev * std);
    lower.push(mean - stdDev * std);
    bandwidth.push(mean > 0 ? ((upper[i] - lower[i]) / mean) * 100 : 0);
  }
  return { upper, middle, lower, bandwidth };
}

function calcStochastic(candles: OhlcvCandle[], kPeriod = 14, dPeriod = 3): { k: number[]; d: number[] } {
  const kValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { kValues.push(50); continue; }
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest = Math.min(...slice.map(c => c.low));
    const k = highest !== lowest ? ((candles[i].close - lowest) / (highest - lowest)) * 100 : 50;
    kValues.push(k);
  }
  const dValues = calcSMA(kValues, dPeriod);
  return { k: kValues, d: dValues };
}

function calcVWAP(candles: OhlcvCandle[]): number[] {
  const vwap: number[] = [];
  let cumTPV = 0;
  let cumVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumTPV += tp * candles[i].volume;
    cumVol += candles[i].volume;
    vwap.push(cumVol > 0 ? cumTPV / cumVol : candles[i].close);
  }
  return vwap;
}

function calcSupertrend(candles: OhlcvCandle[], period = 10, multiplier = 3): { supertrend: number[]; direction: number[] } {
  const atr = calcATR(candles, period);
  const supertrend: number[] = [];
  const direction: number[] = []; // 1 = uptrend, -1 = downtrend

  let upperBand = 0, lowerBand = 0, prevUpperBand = 0, prevLowerBand = 0;
  let prevST = 0, prevDir = 1;

  for (let i = 0; i < candles.length; i++) {
    if (i < period) { supertrend.push(candles[i].close); direction.push(1); continue; }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const currATR = atr[i] || candles[i].close * 0.02;

    let newUpperBand = hl2 + multiplier * currATR;
    let newLowerBand = hl2 - multiplier * currATR;

    // Adjust bands
    newLowerBand = newLowerBand > prevLowerBand || candles[i - 1].close < prevLowerBand ? newLowerBand : prevLowerBand;
    newUpperBand = newUpperBand < prevUpperBand || candles[i - 1].close > prevUpperBand ? newUpperBand : prevUpperBand;

    let st: number, dir: number;
    if (prevST === prevUpperBand) {
      dir = candles[i].close > newUpperBand ? 1 : -1;
      st = dir === 1 ? newLowerBand : newUpperBand;
    } else {
      dir = candles[i].close < newLowerBand ? -1 : 1;
      st = dir === 1 ? newLowerBand : newUpperBand;
    }

    supertrend.push(st);
    direction.push(dir);
    prevUpperBand = newUpperBand;
    prevLowerBand = newLowerBand;
    prevST = st;
    prevDir = dir;
  }

  return { supertrend, direction };
}

// ─── Viability calculator ───

function computeViability(summary: {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  totalPnl: number;
}): ViabilityInfo {
  const warnings: string[] = [];
  let score = 0;

  // 0 trades = insufficient data, not a bad strategy
  if (summary.totalTrades === 0) {
    return {
      score: 0,
      isViable: false,
      warnings: ['Нет сделок за выбранный период'],
      recommendation: 'Стратегия не нашла сигналов. Попробуйте другой таймфрейм (например, 15М или 5М) или увеличьте количество дней.',
    };
  }

  if (summary.winRate > 50) {
    score += 25;
  } else {
    warnings.push(`Низкий винрейт (${summary.winRate.toFixed(1)}%)`);
  }

  if (summary.profitFactor > 1.5) {
    score += 25;
  } else if (summary.profitFactor > 1) {
    score += 12;
    warnings.push(`Профит-фактор ниже рекомендуемого (${summary.profitFactor.toFixed(2)})`);
  } else {
    warnings.push(`Профит-фактор неприемлем (${summary.profitFactor.toFixed(2)})`);
  }

  if (summary.maxDrawdownPercent < 15) {
    score += 25;
  } else if (summary.maxDrawdownPercent < 25) {
    score += 10;
    warnings.push(`Макс. просадка ${summary.maxDrawdownPercent.toFixed(1)}% (рекомендуется < 15%)`);
  } else {
    warnings.push(`Макс. просадка превышает 20% (${summary.maxDrawdownPercent.toFixed(1)}%)`);
  }

  if (summary.totalPnl > 0) {
    score += 25;
  } else {
    warnings.push(`Отрицательный общий P&L ($${summary.totalPnl.toFixed(2)})`);
  }

  const isViable = score >= 50;
  let recommendation: string;

  if (score >= 75) {
    recommendation = 'Стратегия показывает хорошие результаты на исторических данных. Рекомендуется использовать с осторожным риск-менеджментом.';
  } else if (score >= 50) {
    recommendation = 'Стратегия жизнеспособна с осторожным риск-менеджментом. Рекомендуется снизить размер позиции.';
  } else if (score >= 25) {
    recommendation = 'Стратегия имеет серьёзные недостатки. Не рекомендуется для реальной торговли без доработки.';
  } else {
    recommendation = 'Стратегия непригодна. Макс. просадка ' + summary.maxDrawdownPercent.toFixed(1) + '%.';
  }

  return { score, isViable, warnings, recommendation };
}

// ─── Client-side backtest engine ───

function runClientBacktest(
  candles: OhlcvCandle[],
  config: {
    initialBalance: number;
    leverage: number;
    riskPerTradePct: number;
    maxPositions: number;
    strategy: string;
    rrRatio: number;
  },
  onProgress: (current: number, total: number) => void,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const equityCurve: { step: number; equity: number; drawdown: number }[] = [];
  let balance = config.initialBalance;
  let peakBalance = balance;
  let maxDrawdown = 0;

  // Drawdown protection state
  let drawdownStopped = false;
  let consecutiveLosses = 0;
  let pauseRemaining = 0;

  interface OpenPosition {
    id: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    entryDate: string;
    stopLoss: number;
    takeProfit: number;
    quantity: number;
    entryIndex: number;
  }

  let openPositions: OpenPosition[] = [];

  // Pre-compute all indicators
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const ema9 = calcEMA(closes, 9);
  const ema12 = calcEMA(closes, 12);
  const ema21 = calcEMA(closes, 21);
  const ema26 = calcEMA(closes, 26);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi = calcRSI(closes, 14);
  const atr = calcATR(candles, 14);
  const avgVolume20 = calcSMA(volumes, 20);
  const macd = calcMACD(closes);
  const bb = calcBollingerBands(closes);
  const stoch = calcStochastic(candles);
  const vwap = calcVWAP(candles);
  const supertrendData = calcSupertrend(candles);

  const totalCandles = candles.length;
  // Use 200 for strategies that need EMA 200, otherwise 50
  const startIdx = config.strategy === 'ema-cross-50-200' ? 200 : 50;

  for (let i = startIdx; i < candles.length; i++) {
    const candle = candles[i];
    const date = new Date(candle.timestamp).toISOString().split('T')[0];
    const currentATR = atr[i] || candle.close * 0.02; // fallback 2% if ATR=0
    const currentRSI = rsi[i] || 50;
    const currentVol = candle.volume;
    const volAvg = avgVolume20[i] || currentVol;
    const volumeOk = currentVol > volAvg * 0.5;

    // Report progress
    onProgress(i - startIdx, totalCandles - startIdx);

    // Decrease pause counter
    if (pauseRemaining > 0) {
      pauseRemaining--;
    }

    // Check open positions for TP/SL
    for (let p = openPositions.length - 1; p >= 0; p--) {
      const pos = openPositions[p];
      const hitSL = pos.direction === 'LONG'
        ? candle.low <= pos.stopLoss
        : candle.high >= pos.stopLoss;
      const hitTP = pos.direction === 'LONG'
        ? candle.high >= pos.takeProfit
        : candle.low <= pos.takeProfit;

      if (hitSL || hitTP) {
        const exitPrice = hitSL ? pos.stopLoss : pos.takeProfit;
        const priceDiff = pos.direction === 'LONG'
          ? (exitPrice - pos.entryPrice)
          : (pos.entryPrice - exitPrice);
        const pnl = priceDiff * pos.quantity * config.leverage;
        const commission = (pos.entryPrice + exitPrice) * pos.quantity * 0.001;
        const netPnl = pnl - commission;

        balance += netPnl;
        const result = netPnl >= 0 ? 'WIN' : 'LOSS';

        // Track consecutive losses
        if (result === 'LOSS') {
          consecutiveLosses++;
          if (consecutiveLosses >= 5) {
            pauseRemaining = 10;
            consecutiveLosses = 0;
          }
        } else {
          consecutiveLosses = 0;
        }

        trades.push({
          id: `bt-${trades.length}`,
          coinId: '',
          coinSymbol: '',
          direction: pos.direction,
          entry: pos.entryPrice,
          exit: exitPrice,
          pnl: Math.round(netPnl * 100) / 100,
          pnlPercent: Math.round((netPnl / (pos.entryPrice * pos.quantity)) * 10000) / 100,
          outcome: result,
          date,
        });

        openPositions.splice(p, 1);
      }
    }

    // Track equity & drawdown
    const unrealizedPnl = openPositions.reduce((sum, pos) => {
      const priceDiff = pos.direction === 'LONG'
        ? (candle.close - pos.entryPrice)
        : (pos.entryPrice - candle.close);
      return sum + priceDiff * pos.quantity * config.leverage;
    }, 0);
    const equity = balance + unrealizedPnl;
    if (equity > peakBalance) peakBalance = equity;
    const drawdown = peakBalance > 0 ? ((peakBalance - equity) / peakBalance) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    // Drawdown protection: stop trading if DD > 20%
    if (drawdown > 20) {
      drawdownStopped = true;
    }

    // Skip signal generation if drawdown stopped or paused or indicators not ready
    if (drawdownStopped) continue;
    if (pauseRemaining > 0) continue;
    if (currentATR <= 0) continue;

    const canOpenLong = openPositions.filter(p => p.direction === 'LONG').length < config.maxPositions;
    const canOpenShort = openPositions.filter(p => p.direction === 'SHORT').length < config.maxPositions;

    const isUptrend = ema50[i] > ema50[i - 1];
    const isDowntrend = ema50[i] < ema50[i - 1];

    // RSI filter — only block at extremes
    const rsiNotOverbought = currentRSI < 80;
    const rsiNotOversold = currentRSI > 20;

    // ATR-based SL/TP distances
    const slDistance = 1.5 * currentATR;
    const tpDistance = slDistance * config.rrRatio;

    // Cooldown: no new position if one was opened in last 10 candles for same direction
    const noRecentLong = !openPositions.some(p => p.direction === 'LONG' && i - p.entryIndex < 10);
    const noRecentShort = !openPositions.some(p => p.direction === 'SHORT' && i - p.entryIndex < 10);

    // ── Strategy: EMA Cross variants ──
    if (config.strategy.startsWith('ema-cross-')) {
      let emaFastPeriod = 9, emaSlowPeriod = 21;
      const parts = config.strategy.split('-');
      emaFastPeriod = parseInt(parts[2]) || 9;
      emaSlowPeriod = parseInt(parts[3]) || 21;

      const emaFast = emaFastPeriod === 9 ? ema9 : emaFastPeriod === 12 ? ema12 : emaFastPeriod === 20 ? ema21 : emaFastPeriod === 50 ? ema50 : calcEMA(closes, emaFastPeriod);
      const emaSlow = emaSlowPeriod === 21 ? ema21 : emaSlowPeriod === 26 ? ema26 : emaSlowPeriod === 50 ? ema50 : emaSlowPeriod === 200 ? ema200 : calcEMA(closes, emaSlowPeriod);

      if (emaFast[i] > 0 && emaSlow[i] > 0 && emaFast[i - 1] > 0 && emaSlow[i - 1] > 0) {
        const prevFast = emaFast[i - 1];
        const prevSlow = emaSlow[i - 1];

        const recentCrossUp = emaFast[i] > emaSlow[i] && (prevFast <= prevSlow || (i >= 2 && emaFast[i - 2] <= emaSlow[i - 2]) || (i >= 3 && emaFast[i - 3] <= emaSlow[i - 3]));
        const recentCrossDown = emaFast[i] < emaSlow[i] && (prevFast >= prevSlow || (i >= 2 && emaFast[i - 2] >= emaSlow[i - 2]) || (i >= 3 && emaFast[i - 3] >= emaSlow[i - 3]));

        if (recentCrossUp && noRecentLong && isUptrend && rsiNotOverbought && volumeOk && canOpenLong) {
          const riskAmount = balance * (config.riskPerTradePct / 100);
          const quantity = riskAmount / slDistance;
          if (quantity > 0 && balance >= quantity * candle.close) {
            openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
          }
        }

        if (recentCrossDown && noRecentShort && isDowntrend && rsiNotOversold && volumeOk && canOpenShort) {
          const riskAmount = balance * (config.riskPerTradePct / 100);
          const quantity = riskAmount / slDistance;
          if (quantity > 0 && balance >= quantity * candle.close) {
            openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
          }
        }
      }
    }

    // ── Strategy: RSI Mean Reversion ──
    if (config.strategy === 'rsi-reversion') {
      const rsiTurningUp = rsi[i] > rsi[i - 1] && rsi[i - 1] <= rsi[i - 2];
      if (((rsi[i - 1] < 30 && rsi[i] >= 30) || (rsi[i] < 35 && rsiTurningUp)) && volumeOk && canOpenLong && noRecentLong) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
        }
      }

      const rsiTurningDown = rsi[i] < rsi[i - 1] && rsi[i - 1] >= rsi[i - 2];
      if (((rsi[i - 1] > 70 && rsi[i] <= 70) || (rsi[i] > 65 && rsiTurningDown)) && volumeOk && canOpenShort && noRecentShort) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
        }
      }
    }

    // ── Strategy: RSI Divergence ──
    if (config.strategy === 'rsi-divergence' && i >= startIdx + 20) {
      const lookback = 20;
      const recentLow = Math.min(...candles.slice(i - lookback, i).map(c => c.low));
      const prevLow = Math.min(...candles.slice(i - lookback * 2, i - lookback).map(c => c.low));
      const recentRSIMin = Math.min(...rsi.slice(i - lookback, i));
      const prevRSIMin = Math.min(...rsi.slice(i - lookback * 2, i - lookback));

      // Bullish divergence: price lower low, RSI higher low
      if (recentLow < prevLow && recentRSIMin > prevRSIMin && currentRSI < 40 && currentRSI > rsi[i - 1] && volumeOk && canOpenLong && noRecentLong) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
        }
      }

      // Bearish divergence: price higher high, RSI lower high
      const recentHigh = Math.max(...candles.slice(i - lookback, i).map(c => c.high));
      const prevHigh = Math.max(...candles.slice(i - lookback * 2, i - lookback).map(c => c.high));
      const recentRSIMax = Math.max(...rsi.slice(i - lookback, i));
      const prevRSIMax = Math.max(...rsi.slice(i - lookback * 2, i - lookback));

      if (recentHigh > prevHigh && recentRSIMax < prevRSIMax && currentRSI > 60 && currentRSI < rsi[i - 1] && volumeOk && canOpenShort && noRecentShort) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
        }
      }
    }

    // ── Strategy: MACD Cross ──
    if (config.strategy === 'macd-cross' && i >= 1 && macd.macd[i - 1] !== 0 && macd.signal[i - 1] !== 0) {
      // Bullish cross: MACD crosses above signal
      if (macd.macd[i] > macd.signal[i] && macd.macd[i - 1] <= macd.signal[i - 1] && volumeOk && canOpenLong && noRecentLong && currentRSI < 75) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
        }
      }
      // Bearish cross: MACD crosses below signal
      if (macd.macd[i] < macd.signal[i] && macd.macd[i - 1] >= macd.signal[i - 1] && volumeOk && canOpenShort && noRecentShort && currentRSI > 25) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
        }
      }
    }

    // ── Strategy: Bollinger Bounce ──
    if (config.strategy === 'bollinger-bounce' && bb.lower[i] > 0 && bb.upper[i] > 0) {
      // Price touches lower band → LONG
      if (candle.low <= bb.lower[i] * 1.005 && candle.close > bb.lower[i] && currentRSI < 35 && volumeOk && canOpenLong && noRecentLong) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const sl = bb.lower[i] - currentATR * 0.5;
        const quantity = riskAmount / (candle.close - sl);
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: sl, takeProfit: bb.middle[i] || candle.close + tpDistance, quantity, entryIndex: i });
        }
      }
      // Price touches upper band → SHORT
      if (candle.high >= bb.upper[i] * 0.995 && candle.close < bb.upper[i] && currentRSI > 65 && volumeOk && canOpenShort && noRecentShort) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const sl = bb.upper[i] + currentATR * 0.5;
        const quantity = riskAmount / (sl - candle.close);
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: sl, takeProfit: bb.middle[i] || candle.close - tpDistance, quantity, entryIndex: i });
        }
      }
    }

    // ── Strategy: Bollinger Squeeze ──
    if (config.strategy === 'bollinger-squeeze' && i >= startIdx + 20 && bb.bandwidth[i] > 0 && bb.bandwidth[i - 5] > 0) {
      const avgBW = bb.bandwidth.slice(Math.max(0, i - 50), i).reduce((a, b) => a + b, 0) / Math.min(50, i);
      const isSqueeze = bb.bandwidth[i] < avgBW * 0.7;
      const isExpanding = bb.bandwidth[i] > bb.bandwidth[i - 1] && bb.bandwidth[i] > bb.bandwidth[i - 5];

      if (isSqueeze && isExpanding) {
        if (candle.close > bb.upper[i] && volumeOk && canOpenLong && noRecentLong) {
          const riskAmount = balance * (config.riskPerTradePct / 100);
          const quantity = riskAmount / slDistance;
          if (quantity > 0 && balance >= quantity * candle.close) {
            openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
          }
        }
        if (candle.close < bb.lower[i] && volumeOk && canOpenShort && noRecentShort) {
          const riskAmount = balance * (config.riskPerTradePct / 100);
          const quantity = riskAmount / slDistance;
          if (quantity > 0 && balance >= quantity * candle.close) {
            openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
          }
        }
      }
    }

    // ── Strategy: Stochastic Cross ──
    if (config.strategy === 'stochastic-cross' && stoch.k[i - 1] > 0 && stoch.d[i - 1] > 0) {
      // Bullish cross in oversold zone
      if (stoch.k[i] > stoch.d[i] && stoch.k[i - 1] <= stoch.d[i - 1] && stoch.k[i] < 30 && volumeOk && canOpenLong && noRecentLong) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
        }
      }
      // Bearish cross in overbought zone
      if (stoch.k[i] < stoch.d[i] && stoch.k[i - 1] >= stoch.d[i - 1] && stoch.k[i] > 70 && volumeOk && canOpenShort && noRecentShort) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
        }
      }
    }

    // ── Strategy: Breakout variants ──
    if (config.strategy.startsWith('breakout-')) {
      const lookback = config.strategy === 'breakout-50' ? 50 : 20;
      const breakoutStart = startIdx + lookback;
      if (i >= breakoutStart) {
        const highestHigh = Math.max(...candles.slice(i - lookback, i).map(c => c.high));
        const lowestLow = Math.min(...candles.slice(i - lookback, i).map(c => c.low));

        if (candle.close > highestHigh && candles[i - 1].close <= highestHigh && rsiNotOverbought && volumeOk && canOpenLong && noRecentLong) {
          const riskAmount = balance * (config.riskPerTradePct / 100);
          const quantity = riskAmount / slDistance;
          if (quantity > 0 && balance >= quantity * candle.close) {
            openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
          }
        }

        if (candle.close < lowestLow && candles[i - 1].close >= lowestLow && rsiNotOversold && volumeOk && canOpenShort && noRecentShort) {
          const riskAmount = balance * (config.riskPerTradePct / 100);
          const quantity = riskAmount / slDistance;
          if (quantity > 0 && balance >= quantity * candle.close) {
            openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
          }
        }
      }
    }

    // ── Strategy: VWAP Reversion ──
    if (config.strategy === 'vwap-reversion' && vwap[i] > 0) {
      const deviation = ((candle.close - vwap[i]) / vwap[i]) * 100;
      // Price significantly below VWAP → LONG (mean reversion)
      if (deviation < -1.5 && candle.close > candle.low && currentRSI < 40 && volumeOk && canOpenLong && noRecentLong) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: vwap[i], quantity, entryIndex: i });
        }
      }
      // Price significantly above VWAP → SHORT
      if (deviation > 1.5 && candle.close < candle.high && currentRSI > 60 && volumeOk && canOpenShort && noRecentShort) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: vwap[i], quantity, entryIndex: i });
        }
      }
    }

    // ── Strategy: Multi-EMA (3 EMA) ──
    if (config.strategy === 'multi-ema' && ema9[i] > 0 && ema21[i] > 0 && ema50[i] > 0) {
      // All aligned bullish: EMA9 > EMA21 > EMA50, and just crossed
      const bullAlign = ema9[i] > ema21[i] && ema21[i] > ema50[i] && ema9[i - 1] <= ema21[i - 1];
      if (bullAlign && volumeOk && canOpenLong && noRecentLong && rsiNotOverbought) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: candle.close - slDistance, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
        }
      }
      // All aligned bearish: EMA9 < EMA21 < EMA50, and just crossed
      const bearAlign = ema9[i] < ema21[i] && ema21[i] < ema50[i] && ema9[i - 1] >= ema21[i - 1];
      if (bearAlign && volumeOk && canOpenShort && noRecentShort && rsiNotOversold) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: candle.close + slDistance, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
        }
      }
    }

    // ── Strategy: Supertrend ──
    if (config.strategy === 'supertrend' && i >= 1 && supertrendData.direction[i - 1] !== 0) {
      // Trend flips to up → LONG
      if (supertrendData.direction[i] === 1 && supertrendData.direction[i - 1] === -1 && volumeOk && canOpenLong && noRecentLong) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const sl = supertrendData.supertrend[i];
        const quantity = sl > 0 && sl < candle.close ? riskAmount / (candle.close - sl) : riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'LONG', entryPrice: candle.close, entryDate: date, stopLoss: sl, takeProfit: candle.close + tpDistance, quantity, entryIndex: i });
        }
      }
      // Trend flips to down → SHORT
      if (supertrendData.direction[i] === -1 && supertrendData.direction[i - 1] === 1 && volumeOk && canOpenShort && noRecentShort) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const sl = supertrendData.supertrend[i];
        const quantity = sl > 0 && sl > candle.close ? riskAmount / (sl - candle.close) : riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({ id: `pos-${openPositions.length}`, direction: 'SHORT', entryPrice: candle.close, entryDate: date, stopLoss: sl, takeProfit: candle.close - tpDistance, quantity, entryIndex: i });
        }
      }
    }

    // Push equity curve point
    equityCurve.push({
      step: i,
      equity: Math.round(equity * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
    });
  }

  // Close remaining open positions at last price
  const lastCandle = candles[candles.length - 1];
  for (const pos of openPositions) {
    const priceDiff = pos.direction === 'LONG'
      ? (lastCandle.close - pos.entryPrice)
      : (pos.entryPrice - lastCandle.close);
    const pnl = priceDiff * pos.quantity * config.leverage;
    const commission = (pos.entryPrice + lastCandle.close) * pos.quantity * 0.001;
    const netPnl = pnl - commission;
    balance += netPnl;
    trades.push({
      id: `bt-${trades.length}`,
      coinId: '',
      coinSymbol: '',
      direction: pos.direction,
      entry: pos.entryPrice,
      exit: lastCandle.close,
      pnl: Math.round(netPnl * 100) / 100,
      pnlPercent: Math.round((netPnl / (pos.entryPrice * pos.quantity)) * 10000) / 100,
      outcome: netPnl >= 0 ? 'WIN' : 'LOSS',
      date: new Date(lastCandle.timestamp).toISOString().split('T')[0],
    });
  }

  const wins = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const grossWins = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));

  const maxDDPercent = maxDrawdown;
  const rawSummary = {
    totalTrades: trades.length,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0,
    maxDrawdownPercent: maxDDPercent,
    totalPnl: Math.round((balance - config.initialBalance) * 100) / 100,
  };

  const viability = computeViability(rawSummary);

  return {
    summary: {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: rawSummary.winRate,
      profitFactor: rawSummary.profitFactor,
      sharpeRatio: 0,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownPercent: Math.round(maxDDPercent * 100) / 100,
      totalPnl: rawSummary.totalPnl,
      totalPnlPercent: Math.round(((balance / config.initialBalance) - 1) * 10000) / 100,
      avgWin: wins > 0
        ? Math.round((trades.filter(t => t.outcome === 'WIN').reduce((s, t) => s + t.pnl, 0) / wins) * 100) / 100
        : 0,
      avgLoss: losses > 0
        ? Math.round((Math.abs(trades.filter(t => t.outcome === 'LOSS').reduce((s, t) => s + t.pnl, 0)) / losses) * 100) / 100
        : 0,
      bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0,
      worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0,
      avgHoldingBars: 0,
      startingBalance: config.initialBalance,
      finalBalance: Math.round(balance * 100) / 100,
      viability,
    },
    equityCurve,
    trades,
    parameters: {
      coinId: '',
      interval: '',
      days: 0,
      startingBalance: config.initialBalance,
      leverage: config.leverage,
      strategy: config.strategy,
      rrRatio: config.rrRatio,
    },
  };
}

// ─── Trader Analysis ───

interface TraderAnalysis {
  verdict: 'excellent' | 'good' | 'caution' | 'bad' | 'dangerous';
  verdictLabel: string;
  verdictEmoji: string;
  verdictColor: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  actionableSteps: string[];
  riskAssessment: string;
  marketConditionNote: string;
  shouldTrade: boolean;
  confidence: string;
}

const verdictColorMap: Record<string, { border: string; bg: string }> = {
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5' },
  yellow: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/5' },
  red: { border: 'border-red-500/30', bg: 'bg-red-500/5' },
};

const INTERVAL_LABEL_MAP: Record<string, string> = {
  '1m': '1М', '5m': '5М', '15m': '15М', '1h': '1Ч', '4h': '4Ч',
};

const STRATEGY_NAME_MAP: Record<string, string> = {
  'ema-cross': 'EMA Кроссовер',
  'rsi-reversion': 'RSI Средняя возвратность',
  'breakout': 'Пробой',
};

const ALTERNATIVE_STRATEGIES: Record<string, string> = {
  'ema-cross': 'RSI Средняя возвратность — лучше работает в боковике',
  'breakout': 'EMA Кроссовер — более консервативный подход к тренду',
  'rsi-reversion': 'Пробой — для подтвержденного тренда',
};

function generateTraderAnalysis(
  summary: BacktestResult['summary'],
  trades: BacktestTrade[],
  strategyKey: string,
  rrRatio: number,
  interval: string,
): TraderAnalysis {
  const {
    totalTrades, winRate, profitFactor, maxDrawdownPercent,
    totalPnl, totalPnlPercent, avgWin, avgLoss,
    bestTrade, worstTrade, startingBalance,
  } = summary;

  const intervalLabel = INTERVAL_LABEL_MAP[interval] || '';
  const stratName = STRATEGY_NAME_MAP[strategyKey] || strategyKey;
  const pairLabel = `${trades[0]?.coinSymbol || ''}/${intervalLabel}`;

  // Derived metrics
  const isProfitable = totalPnl > 0;
  const hasEnoughTrades = totalTrades >= 10;
  const hasReliableData = totalTrades >= 30;

  // P&L concentration: is profit from one lucky trade?
  const grossWins = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const biggestWinPct = bestTrade > 0 && grossWins > 0 ? (bestTrade / grossWins) * 100 : 0;
  const isOneTradeDependent = biggestWinPct > 50 && totalTrades > 3;

  // Consecutive losses analysis
  let maxConsecutiveLosses = 0;
  let currentLossStreak = 0;
  for (const t of trades) {
    if (t.pnl < 0) {
      currentLossStreak++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
    } else {
      currentLossStreak = 0;
    }
  }

  // Win/Loss ratio
  const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
  const cutsWinnersShort = avgWinLossRatio < 0.8 && winRate >= 50;
  const letsLosersRun = avgWinLossRatio < 0.8 && winRate < 50;

  // Equity curve volatility (coefficient of variation of equity curve)
  let equityVolatility = 0;
  if (trades.length > 1) {
    let cumPnl = 0;
    const equityValues: number[] = [startingBalance];
    for (const t of trades) {
      cumPnl += t.pnl;
      equityValues.push(startingBalance + cumPnl);
    }
    const mean = equityValues.reduce((a, b) => a + b, 0) / equityValues.length;
    const variance = equityValues.reduce((a, v) => a + (v - mean) ** 2, 0) / equityValues.length;
    equityVolatility = mean > 0 ? Math.sqrt(variance) / mean : 0;
  }
  const isVolatileEquity = equityVolatility > 0.05;

  // ─── Scoring ───
  let s = 0;
  if (isProfitable) s += 30; else s -= 20;
  if (winRate >= 55) s += 20; else if (winRate >= 45) s += 5; else s -= 15;
  if (profitFactor >= 1.5) s += 20; else if (profitFactor >= 1.0) s += 5; else s -= 15;
  if (maxDrawdownPercent < 15) s += 15; else if (maxDrawdownPercent < 25) s += 5; else s -= 10;
  if (hasEnoughTrades) s += 10; else s -= 10;
  if (!isOneTradeDependent) s += 5; else s -= 10;

  // ─── Verdict ───
  let verdict: TraderAnalysis['verdict'];
  let verdictLabel: string;
  let verdictEmoji: string;
  let verdictColor: string;
  let shouldTrade: boolean;

  if (s >= 70) {
    verdict = 'excellent'; verdictLabel = 'ОТЛИЧНО'; verdictEmoji = '🏆';
    verdictColor = 'emerald'; shouldTrade = true;
  } else if (s >= 45) {
    verdict = 'good'; verdictLabel = 'ХОРОШО'; verdictEmoji = '✅';
    verdictColor = 'emerald'; shouldTrade = true;
  } else if (s >= 20) {
    verdict = 'caution'; verdictLabel = 'С ОСТОРОЖНОСТЬЮ'; verdictEmoji = '⚠️';
    verdictColor = 'yellow'; shouldTrade = true;
  } else if (s >= 0) {
    verdict = 'bad'; verdictLabel = 'ПЛОХО'; verdictEmoji = '❌';
    verdictColor = 'red'; shouldTrade = false;
  } else {
    verdict = 'dangerous'; verdictLabel = 'ОПАСНО'; verdictEmoji = '🚨';
    verdictColor = 'red'; shouldTrade = false;
  }

  // ─── Confidence ───
  let confidence: string;
  if (totalTrades >= 50) {
    confidence = `Высокая (${totalTrades} сделок)`;
  } else if (totalTrades >= 30) {
    confidence = `Хорошая (${totalTrades} сделок)`;
  } else if (totalTrades >= 10) {
    confidence = `Умеренная (${totalTrades} сделок — желательно больше 30)`;
  } else if (totalTrades > 0) {
    confidence = `Низкая (${totalTrades} сделок — недостаточно для надёжной оценки)`;
  } else {
    confidence = 'Недостаточно данных';
  }

  // ─── Summary ───
  const summaryText = buildSummaryText();

  function buildSummaryText(): string {
    const parts: string[] = [];

    if (totalTrades === 0) {
      return `Стратегия «${stratName}» на ${pairLabel} не сгенерировала ни одной сделки за выбранный период.`;
    }

    // Opening sentence
    if (isProfitable) {
      parts.push(`Стратегия «${stratName}» на ${pairLabel} показала прибыль +$${Math.abs(totalPnl).toFixed(2)} (${totalPnlPercent.toFixed(1)}%) за ${totalTrades} сделок.`);
    } else {
      parts.push(`Стратегия «${stratName}» на ${pairLabel} показала убыточность -$${Math.abs(totalPnl).toFixed(2)} (${totalPnlPercent.toFixed(1)}%) за ${totalTrades} сделок.`);
    }

    // Second sentence — key metrics
    if (winRate >= 55) {
      parts.push(`Винрейт ${winRate.toFixed(1)}% с профит-фактором ${profitFactor.toFixed(2)}.`);
    } else if (winRate >= 40) {
      parts.push(`Винрейт ${winRate.toFixed(1)}% с профит-фактором ${profitFactor.toFixed(2)} — требуется улучшение.`);
    } else {
      parts.push(`Низкий винрейт ${winRate.toFixed(1)}% и профит-фактор ${profitFactor.toFixed(2)} — стратегия теряет деньги на каждой сделке в среднем.`);
    }

    // Third sentence — drawdown context
    if (maxDrawdownPercent >= 25) {
      parts.push(`Максимальная просадка ${maxDrawdownPercent.toFixed(1)}% критична для сохранения депозита.`);
    } else if (maxDrawdownPercent >= 15) {
      parts.push(`Максимальная просадка ${maxDrawdownPercent.toFixed(1)}% — на грани приемлемого.`);
    }

    // One-trade dependency warning
    if (isOneTradeDependent) {
      parts.push(`ВНИМАНИЕ: ${biggestWinPct.toFixed(0)}% всей прибыли приходится на одну сделку — результат ненадёжен.`);
    }

    return parts.join(' ');
  }

  // ─── Strengths ───
  const strengths: string[] = [];

  if (hasReliableData) {
    strengths.push(`Достаточно сделок (${totalTrades}) для статистической значимости`);
  } else if (totalTrades >= 10) {
    strengths.push(`Минимальное количество сделок (${totalTrades}) для предварительной оценки`);
  }

  if (isProfitable && profitFactor >= 1.5) {
    strengths.push(`Профит-фактор ${profitFactor.toFixed(2)} — стратегия зарабатывает в 1.5+ раза больше, чем теряет`);
  }

  if (winRate >= 55) {
    strengths.push(`Хороший винрейт ${winRate.toFixed(1)}% — большинство сделок закрываются в плюс`);
  }

  if (winRate >= 50 && avgWinLossRatio >= 1.5) {
    strengths.push(`Отличное соотношение средний винн/лосс (${avgWinLossRatio.toFixed(2)}x) — стратегия режет лоссы и даёт прибыль расти`);
  }

  if (winRate < 50 && avgWinLossRatio >= 2.0) {
    strengths.push(`Несмотря на низкий винрейт, R:R ${(avgWinLossRatio).toFixed(2)}x компенсирует — стратегия зарабатывает больше на каждом винне`);
  }

  if (maxDrawdownPercent < 10) {
    strengths.push(`Низкая максимальная просадка ${maxDrawdownPercent.toFixed(1)}% — стратегия контролирует риски`);
  }

  if (isProfitable && !isOneTradeDependent) {
    strengths.push(`Прибыль распределена равномерно — нет зависимости от одной удачной сделки`);
  }

  if (maxConsecutiveLosses <= 3 && totalTrades >= 20) {
    strengths.push(`Серия макс. убытков всего ${maxConsecutiveLosses} — психологически легко переносится`);
  }

  if (equityVolatility > 0 && equityVolatility < 0.02) {
    strengths.push('Плавная кривая эквити — стабильный рост без резких скачков');
  }

  // ─── Weaknesses ───
  const weaknesses: string[] = [];

  if (winRate < 40) {
    weaknesses.push(`Низкий винрейт ${winRate.toFixed(1)}% — большинство сделок закрываются в убыток`);
  }

  if (profitFactor < 1.0) {
    weaknesses.push(`Профит-фактор ${profitFactor.toFixed(2)} — стратегия теряет больше денег, чем зарабатывает`);
  } else if (profitFactor < 1.2) {
    weaknesses.push(`Профит-фактор ${profitFactor.toFixed(2)} — слишком близко к безубытку, комиссия съедает прибыль`);
  }

  if (maxDrawdownPercent >= 25) {
    weaknesses.push(`Критическая просадка ${maxDrawdownPercent.toFixed(1)}% — высокий риск потери депозита`);
  } else if (maxDrawdownPercent >= 15) {
    weaknesses.push(`Просадка ${maxDrawdownPercent.toFixed(1)}% — выше рекомендуемого порога 15%`);
  }

  if (cutsWinnersShort) {
    weaknesses.push(`Стратегия режет прибыль: средний винн $${avgWin.toFixed(2)} меньше среднего лосса $${avgLoss.toFixed(2)} — нужно увеличить R:R`);
  }

  if (letsLosersRun) {
    weaknesses.push(`Лоссы больше виннов: средний лосс $${avgLoss.toFixed(2)} при среднем винне $${avgWin.toFixed(2)} — нужно ужесточить стоп-лоссы`);
  }

  if (isOneTradeDependent) {
    weaknesses.push(`${biggestWinPct.toFixed(0)}% прибыли от одной сделки ($${bestTrade.toFixed(2)}) — без неё стратегия убыточна`);
  }

  if (!hasEnoughTrades && totalTrades > 0) {
    weaknesses.push(`Всего ${totalTrades} сделок — статистически ненадёжно (нужно минимум 30)`);
  }

  if (maxConsecutiveLosses >= 7) {
    weaknesses.push(`Серия из ${maxConsecutiveLosses} убыточных сделок подряд — тяжело психологически переносить`);
  } else if (maxConsecutiveLosses >= 5) {
    weaknesses.push(`Серия из ${maxConsecutiveLosses} убыточных сделок — требует железной дисциплины`);
  }

  if (isVolatileEquity && totalTrades >= 10) {
    weaknesses.push('Волатильная кривая эквити — большие колебания капитала между сделками');
  }

  if (worstTrade < -startingBalance * 0.05) {
    weaknesses.push(`Худшая сделка -$${Math.abs(worstTrade).toFixed(2)} (${((Math.abs(worstTrade) / startingBalance) * 100).toFixed(1)}% от депозита) — слишком большой риск на сделку`);
  }

  // ─── Actionable Steps ───
  const actionableSteps: string[] = [];

  if (shouldTrade) {
    if (verdict === 'excellent') {
      actionableSteps.push('Можно использовать в реальной торговле с полным размером позиции');
      actionableSteps.push('Установите стоп торговли при просадке > 15% от депозита');
      actionableSteps.push('Пересмотрите результаты ежемесячно — если винрейт падает ниже 50%, приостановите');
    } else if (verdict === 'good') {
      actionableSteps.push('Можно использовать с осторожностью — начните с половины расчётного размера позиции');
      actionableSteps.push('Установите стоп торговли при просадке > 12% от депозита');
      actionableSteps.push('Мониторьте эффективность каждые 2 недели');
    } else {
      // caution
      actionableSteps.push('Используйте ТОЛЬКО с минимальным размером позиции (¼ от расчётного)');
      actionableSteps.push('Жёсткий стоп: приостановите торговлю при просадке > 8% от депозита');
      actionableSteps.push('Протестируйте на другом таймфрейме перед реальной торговлей');
      if (winRate < 45) {
        actionableSteps.push(`Попробуйте увеличить текущий R:R (${rrRatio.toFixed(1)}) до 3.0+ чтобы компенсировать низкий винрейт`);
      }
      actionableSteps.push('Улучшите стратегию перед полной реализацией (см. слабые стороны)');
    }
  } else {
    // Don't trade
    actionableSteps.push('НЕ использовать эту стратегию в реальной торговле');

    if (strategyKey === 'ema-cross') {
      actionableSteps.push('Исключить EMA кроссовер для данного актива/таймфрейма');
      actionableSteps.push('Попробуйте добавить фильтр ADX > 25 для отсечения боковика');
    } else if (strategyKey === 'rsi-reversion') {
      actionableSteps.push('Настройте пороги RSI (попробуйте 20/80 вместо 30/70)');
      actionableSteps.push('Добавьте фильтр тренда — RSI Mean Reversion работает хуже в сильном тренде');
    } else if (strategyKey === 'breakout') {
      actionableSteps.push('Добавьте подтверждение объёмом — пробой без объёма часто ложный');
      actionableSteps.push('Попробуйте отложенный вход на ретест уровня пробоя');
    }

    if (winRate < 40 && avgWinLossRatio < 1.0) {
      actionableSteps.push(`Увеличьте текущий R:R (${rrRatio.toFixed(1)}) до 3.0+ и ужесточите стоп-лоссы`);
    }

    if (maxDrawdownPercent >= 25) {
      actionableSteps.push(`Снизьте размер позиции в 2-3 раза чтобы просадка не превышала 10-15%`);
    }

    const alt = ALTERNATIVE_STRATEGIES[strategyKey];
    if (alt) {
      actionableSteps.push(`Рассмотрите альтернативу: ${alt}`);
    }

    actionableSteps.push('Протестируйте другие комбинации актив/таймфрейм/стратегия');
  }

  // ─── Risk Assessment ───
  let riskAssessment: string;

  if (verdict === 'excellent') {
    riskAssessment = `НИЗКИЙ РИСК. Стратегия показывает стабильную прибыль с контролируемой просадкой ${maxDrawdownPercent.toFixed(1)}%. Подходит для комфортной торговли.`;
  } else if (verdict === 'good') {
    riskAssessment = `УМЕРЕННЫЙ РИСК. Стратегия прибыльна, но просадка ${maxDrawdownPercent.toFixed(1)}% требует дисциплины. Рекомендуется уменьшенный размер позиции.`;
  } else if (verdict === 'caution') {
    riskAssessment = `ПОВЫШЕННЫЙ РИСК. Прибыль нестабильна, просадка ${maxDrawdownPercent.toFixed(1)}%. Только минимальные позиции и жёсткий стоп торговли.`;
  } else if (verdict === 'bad') {
    riskAssessment = `ВЫСОКИЙ РИСК. Стратегия убыточна. Использование в реальной торговле приведёт к потере средств.`;
  } else {
    riskAssessment = `КРИТИЧЕСКИЙ РИСК. При просадке ${maxDrawdownPercent.toFixed(1)}% и профит-факторе ${profitFactor.toFixed(2)}, стратегия приведёт к быстрой потере депозита.`;
  }

  if (isOneTradeDependent) {
    riskAssessment += ` Результат зависит от одной сделки — в реальности повторить будет крайне сложно.`;
  }

  if (maxConsecutiveLosses >= 5) {
    riskAssessment += ` Серия из ${maxConsecutiveLosses} убытков подряд — психологически тяжело продолжать.`;
  }

  // ─── Market Condition Note ───
  let marketConditionNote: string;

  if (strategyKey === 'ema-cross') {
    if (isProfitable) {
      marketConditionNote = 'EMA Кроссовер лучше всего работает в тренде. Если рынок перешёл в боковик, стратегия будет генерировать ложные сигналы. Следите за ADX — при ADX < 20 лучше приостановить торговлю.';
    } else {
      marketConditionNote = 'EMA Кроссовер плохо работает в боковике (флэте). Вероятно, рынок находился в диапазоне — стратегия генерировала ложные сигналы на каждом развороте. Попробуйте добавить фильтр тренда или смените стратегию.';
    }
  } else if (strategyKey === 'rsi-reversion') {
    if (isProfitable) {
      marketConditionNote = 'RSI Средняя возвратность работает в боковике и при умеренных трендах. При сильном тренде (ADX > 30) эффективность снижается — RSI может долго оставаться в зоне перекупленности/перепроданности.';
    } else {
      marketConditionNote = 'RSI Средняя возвратность неэффективна в сильном тренде — рынок может долго двигаться против позиции. Если был трендовый период, это объясняет убытки. Попробуйте EMA Кроссовер для трендовых условий.';
    }
  } else if (strategyKey === 'breakout') {
    if (isProfitable) {
      marketConditionNote = 'Пробойная стратегия эффективна при наличии явных уровней поддержки/сопротивления и достаточной волатильности. В низковолатильном рынке сигналов будет мало, но они качественнее.';
    } else {
      marketConditionNote = 'Пробойная стратегия чувствительна к ложным пробоям. Если рынок в боковике с ложными пробоями, стратегия будет убыточна. Проверьте объёмы на точках входа — без подтверждения объёмом пробои ненадёжны.';
    }
  } else {
    if (isProfitable) {
      marketConditionNote = 'Стратегия показала прибыль на данном периоде. Результаты могут отличаться при смене рыночного режима (тренд → боковик или наоборот).';
    } else {
      marketConditionNote = 'Стратегия убыточна на данном периоде. Возможно, рыночные условия не подходят. Протестируйте на разных периодах и активах.';
    }
  }

  if (!hasEnoughTrades) {
    marketConditionNote += ' Недостаточно данных для точной оценки рыночных условий.';
  }

  return {
    verdict, verdictLabel, verdictEmoji, verdictColor,
    summary: summaryText,
    strengths, weaknesses, actionableSteps,
    riskAssessment, marketConditionNote,
    shouldTrade, confidence,
  };
}

// ─── Component ───

export function BacktestDialog({ open, onOpenChange, defaultCoin, coinSymbol }: BacktestDialogProps) {
  const [coin, setCoin] = useState(defaultCoin);
  const [interval, setInterval_] = useState('1h');
  const [days, setDays] = useState(14);
  const [balance, setBalance] = useState('1000');
  const [leverage, setLeverage] = useState(3);
  const [strategy, setStrategy] = useState('ema-cross-9-21');
  const [rrRatio, setRrRatio] = useState(2.0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTrades, setShowTrades] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Progress state for client-side computation
  const [phase, setPhase] = useState<'idle' | 'fetching' | 'computing' | 'done'>('idle');
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryAfterRef = useRef(0);
  const autoRetryRef = useRef(false);
  const countdownActiveRef = useRef(false);
  const lockedRef = useRef(false);

  // Countdown timer for rate limit
  useEffect(() => {
    if (retryAfter <= 0) {
      countdownActiveRef.current = false;
      return;
    }
    if (countdownActiveRef.current) return;
    countdownActiveRef.current = true;
    const timer = setInterval(() => {
      setRetryAfter(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          countdownActiveRef.current = false;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  // Keep retryAfterRef in sync
  useEffect(() => {
    retryAfterRef.current = retryAfter;
  }, [retryAfter]);

  const runBacktest = useCallback(async () => {
    // Prevent spam-clicking with a lock
    if (lockedRef.current || running) return;
    lockedRef.current = true;

    setRunning(true);
    setError(null);
    setResult(null);
    setShowTrades(false);
    setRetryAfter(0);
    setElapsedSeconds(0);
    setPhase('fetching');
    setProgressCurrent(0);
    setProgressTotal(0);

    // Start elapsed time counter
    const startMs = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);

    try {
      // Step 1: Fetch OHLCV data from lightweight endpoint
      const params = new URLSearchParams({
        coin: coin || defaultCoin,
        interval,
        days: String(days),
      });
      const res = await fetch(`/api/crypto/tv-history?${params}`);

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        let parsedRetryAfter = 0;
        try {
          const errJson = await res.json();
          errMsg = errJson.error || errMsg;
          if (errJson.retryAfter) {
            parsedRetryAfter = Math.max(1, Math.ceil(Number(errJson.retryAfter)));
          }
        } catch {
          const errText = await res.text().catch(() => '');
          if (errText) errMsg = errText.slice(0, 200);
        }

        // Handle 429 with countdown
        if (res.status === 429 && parsedRetryAfter > 0) {
          setRetryAfter(parsedRetryAfter);
          autoRetryRef.current = true;
          throw new Error(`Превышен лимит запросов. Повтор через ${parsedRetryAfter}с...`);
        }

        throw new Error(errMsg);
      }

      const json = await res.json();
      const candles: OhlcvCandle[] = json.data;

      if (!Array.isArray(candles) || candles.length < 50) {
        throw new Error(`Недостаточно данных для бэктеста (${candles?.length ?? 0} свечей). Увеличьте количество дней.`);
      }

      // Step 2: Run backtest client-side with progress
      setPhase('computing');
      setProgressTotal(candles.length - 50);
      setProgressCurrent(0);

      // Use setTimeout to not block the UI thread
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          try {
            const backtestResult = runClientBacktest(candles, {
              initialBalance: parseFloat(balance) || 1000,
              leverage,
              riskPerTradePct: 2,
              maxPositions: 3,
              strategy,
              rrRatio,
            }, (current, total) => {
              setProgressCurrent(current);
            });
            setResult(backtestResult);
            setPhase('done');
            resolve();
          } catch (e) {
            reject(e);
          }
        }, 50);
      });
    } catch (e) {
      // Don't overwrite error if we already set retryAfter
      if (retryAfterRef.current > 0 && autoRetryRef.current) {
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : 'Ошибка запуска бэктеста');
      }
    } finally {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
      if (retryAfterRef.current <= 0 || !autoRetryRef.current) {
        setRunning(false);
      }
      lockedRef.current = false;
    }
  }, [coin, interval, days, balance, leverage, strategy, rrRatio, defaultCoin, running]);

  // Auto-retry when countdown expires
  useEffect(() => {
    if (retryAfter === 0 && autoRetryRef.current) {
      autoRetryRef.current = false;
      runBacktest();
    }
  }, [retryAfter, runBacktest]);

  // Sync default coin when it changes
  React.useEffect(() => {
    setCoin(defaultCoin);
  }, [defaultCoin]);

  const fmt = (v: number, dec = 2) => {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(dec);
  };

  const s = result?.summary;
  const strategyLabel = STRATEGY_OPTIONS.find(o => o.value === strategy)?.label || strategy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-cyan-500" />
            Бэктест Стратегии
          </DialogTitle>
          <DialogDescription>
            Тестирование торговой стратегии на исторических данных
            <span className="block mt-1 text-[10px] text-muted-foreground/70">ATR-стопы, RSI фильтр, подтверждение объёмом. Для быстрых результатов используйте 1Ч–4Ч интервалы и 7–14 дней</span>
          </DialogDescription>
        </DialogHeader>

        {/* Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Монета</label>
            <Input
              value={coinSymbol}
              disabled
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Интервал</label>
            <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
              {INTERVALS.map(iv => (
                <button
                  key={iv.value}
                  onClick={() => setInterval_(iv.value)}
                  disabled={running}
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    interval === iv.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  } disabled:opacity-50`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Дней</label>
            <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
              {DAYS.map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  disabled={running}
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    days === d ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  } disabled:opacity-50`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Стартовый баланс ($)</label>
            <Input
              type="number"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              className="h-8 text-xs"
              min="100"
              step="100"
              disabled={running}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">
              Плечо: <span className="text-foreground font-bold">{leverage}x</span>
            </label>
            <Slider
              value={[leverage]}
              onValueChange={v => setLeverage(v[0])}
              min={1}
              max={10}
              step={1}
              className="mt-2"
              disabled={running}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground">Стратегия</label>
            <Select value={strategy} onValueChange={setStrategy} disabled={running}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* R:R Ratio slider */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground">
            R:R отношение: <span className="text-foreground font-bold">{rrRatio.toFixed(1)}</span>
          </label>
          <Slider
            value={[rrRatio]}
            onValueChange={v => setRrRatio(v[0])}
            min={1.0}
            max={4.0}
            step={0.1}
            className="mt-1"
            disabled={running}
          />
          <div className="flex justify-between text-[9px] text-muted-foreground/60">
            <span>1.0 (агрессивно)</span>
            <span>4.0 (консервативно)</span>
          </div>
        </div>

        <Button
          onClick={runBacktest}
          disabled={running || retryAfter > 0 || !balance || parseFloat(balance) < 100}
          className="w-full gap-2"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {phase === 'fetching' ? (
                <>Загрузка данных... {elapsedSeconds > 0 && `(${elapsedSeconds}с)`}</>
              ) : (
                <>Анализ свечей... {elapsedSeconds > 0 && `(${elapsedSeconds}с)`}</>
              )}
            </>
          ) : retryAfter > 0 ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Повтор через {retryAfter}с...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Запустить
            </>
          )}
        </Button>

        {/* Error */}
        {error && (
          <Card className="border-red-500/30">
            <CardContent className="p-3 text-center text-sm text-red-500">{error}</CardContent>
          </Card>
        )}

        {/* Running state with progress */}
        {running && !result && !error && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="w-12 h-12 animate-spin text-cyan-500" />
            {phase === 'fetching' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Загрузка исторических данных...
                </p>
                <p className="text-xs text-muted-foreground/60">Получение свечей с Binance</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Анализ {progressCurrent} / {progressTotal} свечей...{' '}
                  <span className="font-mono text-foreground">{elapsedSeconds}с</span>
                </p>
                <p className="text-xs text-muted-foreground/60">{strategyLabel}</p>
                {/* Progress bar */}
                {progressTotal > 0 && (
                  <div className="w-full max-w-xs h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(100, (progressCurrent / progressTotal) * 100)}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Rate limit countdown */}
        {retryAfter > 0 && !running && (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Превышен лимит запросов. Автоматический повтор через{' '}
              <span className="font-mono font-bold">{retryAfter}с</span>
            </p>
          </div>
        )}

        {/* Results */}
        {result && s && (
          <div className="space-y-4">
            {/* Viability Badge + Score */}
            <Card className={s.viability.isViable ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={s.viability.isViable
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold'
                      : 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 text-xs font-bold'
                    }>
                      {s.viability.isViable ? '✓ ЖИЗНЕСПОСОБНА' : '✗ НЕЖИЗНЕСПОСОБНА'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Оценка: <span className="font-bold text-foreground">{s.viability.score}/100</span>
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{strategyLabel} · R:R {result.parameters.rrRatio.toFixed(1)}</span>
                </div>

                {/* Viability bar */}
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      s.viability.score >= 50 ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, s.viability.score)}%` }}
                  />
                </div>

                {/* Recommendation */}
                <p className="text-xs text-muted-foreground">{s.viability.recommendation}</p>

                {/* Warnings */}
                {s.viability.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {s.viability.warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                        <span className="mt-px">⚠</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Trader Analysis */}
            {result.trades.length > 0 && (() => {
              const analysis = generateTraderAnalysis(s, result.trades, strategy, result.parameters.rrRatio, interval);
              const colors = verdictColorMap[analysis.verdictColor] || verdictColorMap.red;
              return (
                <Card className={`${colors.border} ${colors.bg}`}>
                  <CardContent className="p-4 space-y-3">
                    {/* Verdict header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{analysis.verdictEmoji}</span>
                        <div>
                          <div className="text-sm font-bold">{analysis.verdictLabel}</div>
                          <div className="text-[10px] text-muted-foreground">{analysis.confidence}</div>
                        </div>
                      </div>
                      <Badge className={analysis.shouldTrade
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold'
                        : 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 text-xs font-bold'
                      }>
                        {analysis.shouldTrade ? '✓ МОЖНО ТОРГОВАТЬ' : '✗ НЕ ТОРГОВАТЬ'}
                      </Badge>
                    </div>

                    {/* Summary */}
                    <p className="text-xs text-muted-foreground leading-relaxed">{analysis.summary}</p>

                    {/* Strengths & Weaknesses in 2 columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Strengths */}
                      {analysis.strengths.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Сильные стороны</div>
                          {analysis.strengths.map((str, i) => (
                            <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <span className="text-emerald-500 mt-px shrink-0">+</span> <span>{str}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Weaknesses */}
                      {analysis.weaknesses.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Слабые стороны</div>
                          {analysis.weaknesses.map((w, i) => (
                            <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <span className="text-red-500 mt-px shrink-0">−</span> <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actionable Steps */}
                    {analysis.actionableSteps.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Что делать</div>
                        {analysis.actionableSteps.map((step, i) => (
                          <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span> <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Risk Assessment */}
                    <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                      <span className="font-bold">Оценка риска: </span>{analysis.riskAssessment}
                    </div>

                    {/* Market Condition */}
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-bold">Рыночные условия: </span>{analysis.marketConditionNote}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Сделок', value: String(s.totalTrades), color: '' },
                { label: 'Винрейт', value: `${s.winRate.toFixed(1)}%`, color: s.winRate >= 50 ? 'text-emerald-500' : 'text-red-500' },
                { label: 'Профит-фактор', value: s.profitFactor.toFixed(2), color: s.profitFactor >= 1.5 ? 'text-emerald-500' : s.profitFactor >= 1 ? 'text-yellow-500' : 'text-red-500' },
                { label: 'Шарп', value: s.sharpeRatio.toFixed(2), color: s.sharpeRatio >= 1 ? 'text-emerald-500' : s.sharpeRatio >= 0 ? 'text-yellow-500' : 'text-red-500' },
                { label: 'Макс. просадка', value: `${s.maxDrawdownPercent.toFixed(1)}%`, color: 'text-red-500' },
                { label: 'Общий P&L', value: `${s.totalPnl >= 0 ? '+' : ''}$${fmt(s.totalPnl)}`, color: s.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500' },
                { label: 'P&L %', value: `${s.totalPnlPercent >= 0 ? '+' : ''}${s.totalPnlPercent.toFixed(1)}%`, color: s.totalPnlPercent >= 0 ? 'text-emerald-500' : 'text-red-500' },
                { label: 'Баланс', value: `$${fmt(s.finalBalance)}`, color: s.finalBalance >= s.startingBalance ? 'text-emerald-500' : 'text-red-500' },
              ].map((m, i) => (
                <Card key={i}>
                  <CardContent className="p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">{m.label}</div>
                    <div className={`text-sm font-bold font-mono ${m.color}`}>{m.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Equity Curve */}
            {result.equityCurve.length > 1 && (
              <Card>
                <CardHeader className="px-3 py-2">
                  <CardTitle className="text-xs">Кривая эквити</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={result.equityCurve}>
                        <XAxis dataKey="step" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                          formatter={(value: number) => [`$${fmt(value)}`, 'Эквити']}
                          labelFormatter={() => ''}
                          contentStyle={{ fontSize: 11, borderRadius: 8 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="equity"
                          stroke={s.totalPnl >= 0 ? '#10b981' : '#ef4444'}
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Trade List Toggle */}
            {result.trades.length > 0 && (
              <Card>
                <CardHeader
                  className="px-3 py-2 cursor-pointer select-none"
                  onClick={() => setShowTrades(!showTrades)}
                >
                  <CardTitle className="text-xs flex items-center gap-2">
                    Сделки ({result.trades.length})
                    {showTrades ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </CardTitle>
                </CardHeader>
                {showTrades && (
                  <CardContent className="px-3 pb-3 pt-0">
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Монета</TableHead>
                            <TableHead className="text-[10px]">Напр.</TableHead>
                            <TableHead className="text-[10px] text-right">Вход</TableHead>
                            <TableHead className="text-[10px] text-right">Выход</TableHead>
                            <TableHead className="text-[10px] text-right">P&L</TableHead>
                            <TableHead className="text-[10px] text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.trades.map(t => (
                            <TableRow key={t.id}>
                              <TableCell className="text-xs font-semibold">{t.coinSymbol || '—'}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] ${
                                    t.direction === 'LONG' ? 'text-emerald-500 border-emerald-500/30' : 'text-red-500 border-red-500/30'
                                  }`}
                                >
                                  {t.direction}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-mono text-right">${fmt(t.entry, t.entry < 1 ? 6 : 2)}</TableCell>
                              <TableCell className="text-xs font-mono text-right">${fmt(t.exit, t.exit < 1 ? 6 : 2)}</TableCell>
                              <TableCell className={`text-xs font-mono text-right font-bold ${t.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}
                              </TableCell>
                              <TableCell className={`text-xs font-mono text-right font-bold ${t.pnlPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}