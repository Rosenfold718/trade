'use client';

import React, { useState, useCallback } from 'react';
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

const INTERVALS = [
  { value: '1m', label: '1М' },
  { value: '5m', label: '5М' },
  { value: '15m', label: '15М' },
  { value: '1h', label: '1Ч' },
  { value: '4h', label: '4Ч' },
];

const DAYS = [7, 14, 30, 60, 90];

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

  const runBacktest = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setShowTrades(false);

    try {
      const params = new URLSearchParams({
        coin: coin || defaultCoin,
        interval,
        days: String(days),
        balance,
        leverage: String(leverage),
      });
      const res = await fetch(`/api/crypto/backtest?${params}`);

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          errMsg = errJson.error || errMsg;
        } catch {
          const errText = await res.text().catch(() => '');
          if (errText) errMsg = errText.slice(0, 200);
        }
        throw new Error(errMsg);
      }

      const json = await res.json();
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запуска бэктеста');
    } finally {
      setRunning(false);
    }
  }, [coin, interval, days, balance, leverage, defaultCoin]);

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
            <span className="block mt-1 text-[10px] text-muted-foreground/70">Для быстрых результатов используйте 1Ч–4Ч интервалы и 7–14 дней</span>
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
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    interval === iv.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  }`}
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
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    days === d ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  }`}
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
            />
          </div>
        </div>

        <Button
          onClick={runBacktest}
          disabled={running || !balance || parseFloat(balance) < 100}
          className="w-full gap-2"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Выполняется бэктест...
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

        {/* Running spinner (prominent) */}
        {running && !result && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="w-12 h-12 animate-spin text-cyan-500" />
            <p className="text-sm text-muted-foreground">Анализ {days} дней на {interval} свечах...</p>
            <p className="text-xs text-muted-foreground/60">Это может занять 30+ секунд</p>
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
                              <TableCell className="text-xs font-semibold">{t.coinSymbol}</TableCell>
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