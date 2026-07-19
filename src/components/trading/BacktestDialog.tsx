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
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ───

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
  };
  equityCurve: { step: number; equity: number; drawdown: number }[];
  trades: BacktestTrade[];
  parameters: {
    coinId: string;
    interval: string;
    days: number;
    startingBalance: number;
    leverage: number;
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

const DAYS = [7, 14, 30, 60, 90];

// ─── Client-side backtest engine ───

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

function runClientBacktest(
  candles: OhlcvCandle[],
  config: {
    initialBalance: number;
    leverage: number;
    riskPerTradePct: number;
    maxPositions: number;
    stopLossPct: number;
    takeProfitPct: number;
  },
  onProgress: (current: number, total: number) => void,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const equityCurve: { step: number; equity: number; drawdown: number }[] = [];
  let balance = config.initialBalance;
  let peakBalance = balance;
  let maxDrawdown = 0;

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

  const closes = candles.map(c => c.close);
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const ema50 = calcEMA(closes, 50);

  const totalCandles = candles.length;

  for (let i = 50; i < candles.length; i++) {
    const candle = candles[i];
    const date = new Date(candle.timestamp).toISOString().split('T')[0];

    // Report progress
    onProgress(i - 50, totalCandles - 50);

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

    // Generate signal: EMA9/21 crossover with EMA50 trend filter
    if (ema9[i] > 0 && ema21[i] > 0 && ema50[i] > 0) {
      const prevEma9 = ema9[i - 1];
      const prevEma21 = ema21[i - 1];
      const isUptrend = ema50[i] > ema50[i - 1];
      const isDowntrend = ema50[i] < ema50[i - 1];

      // LONG signal
      if (
        prevEma9 <= prevEma21
        && ema9[i] > ema21[i]
        && isUptrend
        && openPositions.filter(p => p.direction === 'LONG').length < config.maxPositions
      ) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const slDistance = candle.close * (config.stopLossPct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({
            id: `pos-${openPositions.length}`,
            direction: 'LONG',
            entryPrice: candle.close,
            entryDate: date,
            stopLoss: candle.close * (1 - config.stopLossPct / 100),
            takeProfit: candle.close * (1 + config.takeProfitPct / 100),
            quantity,
            entryIndex: i,
          });
        }
      }

      // SHORT signal
      if (
        prevEma9 >= prevEma21
        && ema9[i] < ema21[i]
        && isDowntrend
        && openPositions.filter(p => p.direction === 'SHORT').length < config.maxPositions
      ) {
        const riskAmount = balance * (config.riskPerTradePct / 100);
        const slDistance = candle.close * (config.stopLossPct / 100);
        const quantity = riskAmount / slDistance;
        if (quantity > 0 && balance >= quantity * candle.close) {
          openPositions.push({
            id: `pos-${openPositions.length}`,
            direction: 'SHORT',
            entryPrice: candle.close,
            entryDate: date,
            stopLoss: candle.close * (1 + config.stopLossPct / 100),
            takeProfit: candle.close * (1 - config.takeProfitPct / 100),
            quantity,
            entryIndex: i,
          });
        }
      }
    }

    // Track equity
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

  return {
    summary: {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0,
      sharpeRatio: 0,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownPercent: Math.round(maxDrawdown * 100) / 100,
      totalPnl: Math.round((balance - config.initialBalance) * 100) / 100,
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
    },
    equityCurve,
    trades,
    parameters: {
      coinId: '',
      interval: '',
      days: 0,
      startingBalance: config.initialBalance,
      leverage: config.leverage,
    },
  };
}

// ─── Component ───

export function BacktestDialog({ open, onOpenChange, defaultCoin, coinSymbol }: BacktestDialogProps) {
  const [coin, setCoin] = useState(defaultCoin);
  const [interval, setInterval_] = useState('1h');
  const [days, setDays] = useState(14);
  const [balance, setBalance] = useState('1000');
  const [leverage, setLeverage] = useState(3);
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
      const res = await fetch(`/api/crypto/backtest-ohlcv?${params}`);

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
              stopLossPct: 2,
              takeProfitPct: 4,
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
  }, [coin, interval, days, balance, leverage, defaultCoin, running]);

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
            <span className="block mt-1 text-[10px] text-muted-foreground/70">EMA кроссовер стратегия (9/21/50). Для быстрых результатов используйте 1Ч–4Ч интервалы и 7–14 дней</span>
          </DialogDescription>
        </DialogHeader>

        {/* Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                <p className="text-xs text-muted-foreground/60">EMA кроссовер стратегия</p>
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