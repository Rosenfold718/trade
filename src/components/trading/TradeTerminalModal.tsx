'use client';

import React from 'react';
import {
  X, Loader2, DollarSign, Target, CheckCircle2, Badge,
} from 'lucide-react';
import { Badge as ShadBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { CandlestickChart } from '@/components/trading/CandlestickChart';
import type { Trade, CoinData, ChartDataPoint, formatPrice } from '@/components/trading/types';
import { formatPrice as fp } from '@/components/trading/types';

interface TradeTerminalModalProps {
  trade: Trade;
  coins: CoinData[];
  onClose: () => void;
}

export function TradeTerminalModal({ trade, coins, onClose }: TradeTerminalModalProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const coinData = coins.find(c => c.id === trade.coinId);
  const symbol = trade.coinSymbol;

  useEffect(() => {
    let mounted = true;
    const fetchChart = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crypto/signals?coin=${trade.coinId}&interval=${trade.timeframe || '1h'}`);
        if (res.ok && mounted) {
          const json = await res.json();
          setChartData(json.chartData || []);
        }
      } catch {} finally {
        if (mounted) setLoading(false);
      }
    };
    fetchChart();
    const iv = setInterval(fetchChart, 45000);
    return () => { mounted = false; clearInterval(iv); };
  }, [trade.coinId, trade.timeframe]);

  useEffect(() => {
    if (coinData?.current_price) {
      setCurrentPrice(coinData.current_price);
    } else if (chartData.length > 0) {
      setCurrentPrice(chartData[chartData.length - 1].close);
    }
  }, [coinData, chartData]);

  const unrealizedPnL = !trade.resolved && trade.entryReached && currentPrice > 0
    ? (trade.direction === 'LONG'
        ? (currentPrice - trade.entry) * trade.quantity * trade.leverage
        : (trade.entry - currentPrice) * trade.quantity * trade.leverage)
    : null;
  const unrealizedPct = unrealizedPnL !== null && trade.positionSize > 0
    ? (unrealizedPnL / trade.positionSize) * 100 : null;
  const distToEntry = !trade.entryReached && currentPrice > 0 && trade.entry > 0
    ? ((trade.entry - currentPrice) / currentPrice) * 100 : null;

  const fmtDate = (ts: number) => new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const tradeDuration = trade.closedAt
    ? Math.round((trade.closedAt - (trade.enteredAt || trade.timestamp)) / 60000)
    : trade.entryReached
    ? Math.round((Date.now() - (trade.enteredAt || trade.timestamp)) / 60000)
    : null;

  const tradeSignalForChart = {
    direction: trade.direction,
    confidence: trade.confidence,
    entry: trade.entry,
    entryType: trade.entryType,
    entryReason: trade.entryReason,
    stopLoss: trade.stopLoss,
    takeProfit1: trade.takeProfit1,
    takeProfit2: trade.takeProfit2,
    takeProfit3: trade.takeProfit3,
    riskReward: trade.entry > 0 && trade.stopLoss > 0 ? Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.entry - trade.stopLoss) : 0,
    holdDuration: '',
    holdDurationHours: 0,
    reasons: trade.reasons,
    warnings: [],
    indicators: [],
    multiTimeframe: { consensus: 'NEUTRAL', alignment: 0 },
    currentPrice: currentPrice || trade.currentPrice,
    atr: 0,
    support: 0,
    resistance: 0,
    trend: 'BULLISH' as const,
    momentum: 'MODERATE' as const,
    candlePattern: null,
    volumeSignal: null,
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-[95vw] h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex" onClick={e => e.stopPropagation()}>

        {/* Close button */}
        <button onClick={onClose} className="absolute top-3 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors" title="Закрыть">
          <X className="w-5 h-5" />
        </button>

        {/* LEFT: Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className={`flex items-center justify-between px-6 py-3 border-b border-zinc-200 dark:border-zinc-700 ${
            trade.direction === 'LONG' ? 'bg-gradient-to-r from-emerald-500/10 to-transparent' : 'bg-gradient-to-r from-red-500/10 to-transparent'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black ${
                trade.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
              }`}>
                {trade.direction === 'LONG' ? '▲' : '▼'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-black ${trade.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {trade.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'}
                  </span>
                  <span className="text-lg font-bold text-foreground">{symbol}/USDT</span>
                  <ShadBadge variant="outline" className="text-[10px]">{trade.timeframe}</ShadBadge>
                  {!trade.resolved && <ShadBadge className="text-[10px] bg-blue-500 text-white">АКТИВЕН</ShadBadge>}
                  {trade.resolved && trade.result === 'WIN' && <ShadBadge className="text-[10px] bg-emerald-500 text-white">+ПРИБЫЛЬ</ShadBadge>}
                  {trade.resolved && trade.result === 'LOSS' && <ShadBadge className="text-[10px] bg-red-500 text-white">-УБЫТОК</ShadBadge>}
                  {trade.resolved && trade.result === 'EXPIRED' && <ShadBadge className="text-[10px] bg-yellow-500 text-white">ИСТЁК</ShadBadge>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtDate(trade.timestamp)}
                  {trade.enteredAt && trade.enteredAt !== trade.timestamp && <> · Вход: {fmtTime(trade.enteredAt)}</>}
                  {trade.closedAt && <> · Выход: {fmtTime(trade.closedAt)}</>}
                  {tradeDuration !== null && <> · {tradeDuration >= 60 ? `${Math.floor(tradeDuration / 60)}ч ${tradeDuration % 60}м` : `${tradeDuration}м`}</>}
                </div>
              </div>
            </div>
            {!trade.resolved && trade.entryReached && unrealizedPnL !== null && (
              <div className={`font-mono font-black text-2xl ${unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {unrealizedPnL >= 0 ? '+' : ''}{unrealizedPnL.toFixed(2)} USDT
              </div>
            )}
            {trade.resolved && trade.pnlUSDT !== null && (
              <div className={`font-mono font-black text-2xl ${trade.pnlUSDT >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {trade.pnlUSDT >= 0 ? '+' : ''}{trade.pnlUSDT.toFixed(2)} USDT
              </div>
            )}
          </div>

          {/* Chart area */}
          <div className="flex-1 p-4">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="ml-3 text-sm text-muted-foreground">Загрузка графика...</span>
              </div>
            ) : chartData.length > 0 ? (
              <CandlestickChart
                data={chartData}
                tradeSignal={tradeSignalForChart}
                height={480}
                showIndicators={true}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">График недоступен</div>
            )}
          </div>
        </div>

        {/* RIGHT: Info sidebar */}
        <div className="w-[360px] border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-y-auto flex-shrink-0">
          <div className="p-5 space-y-4">
            {/* Position Info */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Позиция
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
                  <div className="text-[9px] text-zinc-400 uppercase">Сумма</div>
                  <div className="font-mono font-bold text-base text-zinc-900 dark:text-zinc-100">${trade.positionSize.toFixed(2)}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
                  <div className="text-[9px] text-zinc-400 uppercase">Плечо</div>
                  <div className="font-mono font-bold text-base text-blue-500">{trade.leverage}x</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
                  <div className="text-[9px] text-zinc-400 uppercase">Количество</div>
                  <div className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100">{trade.quantity.toFixed(6)}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
                  <div className="text-[9px] text-zinc-400 uppercase">Уверенность</div>
                  <div className="font-mono font-bold text-base text-zinc-900 dark:text-zinc-100">{trade.confidence}%</div>
                </div>
              </div>
            </div>

            {/* Price Levels */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Уровни
              </div>
              <div className="space-y-2">
                {[
                  { label: `ВХОД ${trade.entryType === 'LIMIT' ? '(ЛИМИТ)' : '(РЫНОК)'}`, price: trade.entry, color: 'blue' },
                  { label: 'СТОП-ЛОСС', price: trade.stopLoss, color: 'red' },
                  { label: 'TP1', price: trade.takeProfit1, color: 'emerald' },
                  { label: 'TP2', price: trade.takeProfit2, color: 'emerald' },
                  ...(trade.takeProfit3 > 0 ? [{ label: 'TP3', price: trade.takeProfit3, color: 'emerald' as const }] : []),
                ].map((level, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg bg-${level.color}-500/10 border border-${level.color}-500/20`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full bg-${level.color}-500`} />
                      <span className={`text-[11px] font-semibold text-${level.color}-500`}>{level.label}</span>
                    </div>
                    <span className={`font-mono font-bold text-sm text-${level.color}-500`}>${fp(level.price)}</span>
                  </div>
                ))}
              </div>
              {trade.entry > 0 && trade.stopLoss > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700 text-[11px]">
                  <span className="text-zinc-400">R:R</span>
                  <span className={`font-mono font-bold ${
                    Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.entry - trade.stopLoss) >= 2 ? 'text-emerald-500' : 'text-yellow-500'
                  }`}>1 : {(Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.entry - trade.stopLoss)).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Entry status / Unrealized P&L / Realized P&L */}
            {!trade.entryReached && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-2">
                <div className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">Лимитный ордер</div>
                <div className="text-xs text-muted-foreground">Ожидание отката до ${fp(trade.entry)}</div>
                {distToEntry !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">До входа:</span>
                    <span className={`font-mono font-bold text-sm ${Math.abs(distToEntry) < 1 ? 'text-emerald-500' : 'text-blue-500'}`}>
                      {distToEntry > 0 ? '+' : ''}{distToEntry.toFixed(2)}%
                    </span>
                  </div>
                )}
                {currentPrice > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Текущая:</span>
                    <span className="font-mono font-bold text-sm">${fp(currentPrice)}</span>
                  </div>
                )}
              </div>
            )}

            {!trade.resolved && trade.entryReached && unrealizedPnL !== null && (
              <div className={`rounded-xl border p-4 space-y-2 ${unrealizedPnL >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Нереализованный P&L</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">P&L:</span>
                  <span className={`font-mono font-black text-xl ${unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {unrealizedPnL >= 0 ? '+' : ''}{unrealizedPnL.toFixed(2)} USDT
                  </span>
                </div>
                {unrealizedPct !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Процент:</span>
                    <span className={`font-mono font-bold ${unrealizedPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                {currentPrice > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">Текущая:</span>
                    <span className="font-mono font-bold text-sm">${fp(currentPrice)}</span>
                  </div>
                )}
              </div>
            )}

            {trade.resolved && trade.pnlUSDT !== null && (
              <div className={`rounded-xl border p-4 space-y-2 ${trade.pnlUSDT >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Результат</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">P&L:</span>
                  <span className={`font-mono font-black text-xl ${trade.pnlUSDT >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {trade.pnlUSDT >= 0 ? '+' : ''}{trade.pnlUSDT.toFixed(2)} USDT
                  </span>
                </div>
                {trade.pnlPct !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Процент:</span>
                    <span className={`font-mono font-bold ${trade.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                {trade.exitPrice !== null && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">Цена выхода:</span>
                    <span className="font-mono font-bold text-sm">${fp(trade.exitPrice)}</span>
                  </div>
                )}
                {trade.exitReason && (
                  <div className="text-xs text-muted-foreground pt-2 border-t border-border/30">{trade.exitReason}</div>
                )}
              </div>
            )}

            {trade.entryReason && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Причина входа</div>
                <div className="text-xs text-zinc-900 dark:text-zinc-100">{trade.entryReason}</div>
              </div>
            )}
            {trade.reasons.length > 0 && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Факторы</div>
                <div className="space-y-1.5">
                  {trade.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-zinc-600 dark:text-zinc-300">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}