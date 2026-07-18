'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, TrendingDown, Activity, BarChart3,
  RefreshCw, Search, ArrowUpRight, ArrowDownRight,
  Zap, Target, AlertTriangle, Clock,
  LineChart, Shield, Eye, Cpu,
  ChevronUp, ChevronDown, Loader2,
  Gauge, Crosshair, X, AlertCircle, CheckCircle2,
  Timer, MoveUp, MoveDown, Pause, Flame, Snowflake,
  Copy, Check, Volume2, CandlestickChart, MessageSquare, Brain, Sparkles,
  ExternalLink, DollarSign, TrendingUpIcon, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';

// Types
interface CoinData {
  id: string; symbol: string; name: string; image?: string;
  current_price: number; market_cap: number; market_cap_rank: number;
  total_volume: number; price_change_percentage_24h: number;
  sparkline_in_7d: number[]; high_24h: number; low_24h: number;
}

interface TradeSignal {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number;
  entry: number;
  entryType: 'LIMIT' | 'MARKET';
  entryReason: string;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskReward: number;
  holdDuration: string;
  holdDurationHours: number;
  reasons: string[];
  warnings: string[];
  indicators: IndicatorResult[];
  multiTimeframe: MultiTimeframeResult;
  currentPrice: number;
  atr: number;
  support: number;
  resistance: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  momentum: 'STRONG' | 'MODERATE' | 'WEAK';
  candlePattern: string | null;
  volumeSignal: string | null;
}

interface IndicatorResult {
  name: string; value: number | string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL'; description: string; weight: number;
}

interface MultiTimeframeResult {
  m5?: TimeframeVerdict;
  m15?: TimeframeVerdict;
  h1?: TimeframeVerdict;
  h4?: TimeframeVerdict;
  consensus: string;
  alignment: number;
}

interface TimeframeVerdict {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;
  trend: string;
  keyLevel: string;
}

interface SignalResult {
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  indicators: IndicatorResult[];
  summary: string;
  forecast?: any;
  tradeSignal?: TradeSignal;
}

interface ChartDataPoint {
  timestamp: number; date: string; time: string;
  open: number; high: number; low: number; close: number; volume: number;
  ema9?: number; ema21?: number;
  bbUpper?: number; bbLower?: number;
  rsi?: number; macd?: number; macdSignal?: number; macdHist?: number;
}

interface PositionTool {
  enabled: boolean;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  amount: number;
  leverage: number;
}

interface SentimentData {
  overallSentiment: string; sentimentScore: number;
  fearGreed: { value: number; classification: string };
  recommendation: string;
  newsAnalysis: { bullish_factors: string[]; bearish_factors: string[] };
  source: string;
}

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
}

interface DepositSnapshot {
  timestamp: number;
  balance: number;
  equity: number;
}

interface DebtEntry {
  timestamp: number;
  amount: number;
  remainingOwed: number;
  label: string;
}

interface Lesson {
  type: string;
  description: string;
  coinId?: string;
  direction?: 'LONG' | 'SHORT';
  value?: number;
  timestamp: number;
  tradeId: string;
  severity: 'low' | 'medium' | 'high';
}

interface AdaptiveParams {
  minSlDistancePct: number;
  minConfidence: number;
  avoidCoins: string[];
  minRr: number;
  counterTrendPenalty: number;
  limitExpiryHours: number;
  marketEntryConditions: string[];
  lessons: Lesson[];
  lessonsVersion: number;
}

interface ReputationData {
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
  lockedInPositions: number;
  freeBalance: number;
  adaptive: AdaptiveParams;
}

function formatPrice(price: number): string {
  if (!price || !isFinite(price)) return '0.00';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}

function formatNumber(num: number): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч`;
  return new Date(ts).toLocaleDateString('ru-RU');
}

function pctChange(from: number, to: number): string {
  if (from === 0) return '0.00';
  const pct = ((to - from) / from) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

// Candlestick Chart
function CandlestickChartComponent({ data, overlayIndicators, positionTool, tradeSignal }: {
  data: ChartDataPoint[]; overlayIndicators: boolean; positionTool: PositionTool | null; tradeSignal: TradeSignal | null;
}) {
  if (data.length === 0) return null;
  const width = 960, height = 480;
  const margin = { top: 20, right: 70, bottom: 30, left: 10 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const prices = data.flatMap(d => [d.high, d.low]).filter(v => v > 0);
  if (positionTool?.enabled) { prices.push(positionTool.entryPrice, positionTool.targetPrice, positionTool.stopLoss); }
  if (tradeSignal && tradeSignal.direction !== 'FLAT') { prices.push(tradeSignal.entry, tradeSignal.stopLoss, tradeSignal.takeProfit2, tradeSignal.takeProfit1); }
  const minP = Math.min(...prices), maxP = Math.max(...prices), range = maxP - minP || 1, padding = range * 0.08;
  const yMin = minP - padding, yMax = maxP + padding, yRange = yMax - yMin;
  const yScale = (v: number) => margin.top + chartH - ((v - yMin) / yRange) * chartH;
  const xScale = (i: number) => margin.left + (i / (data.length - 1 || 1)) * chartW;
  const candleW = Math.max(2, Math.min(20, (chartW / data.length) * 0.6));
  const formatY = (v: number) => {
    if (v >= 10000) return `$${(v/1000).toFixed(1)}k`;
    if (v >= 1000) return `$${v.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
    if (v >= 1) return `$${v.toFixed(2)}`;
    if (v >= 0.01) return `$${v.toFixed(4)}`;
    return `$${v.toFixed(6)}`;
  };
  const ema9Data = data.map((d, i) => d.ema9 ? { x: xScale(i), y: yScale(d.ema9) } : null).filter(Boolean);
  const ema21Data = data.map((d, i) => d.ema21 ? { x: xScale(i), y: yScale(d.ema21) } : null).filter(Boolean);
  const linePath = (points: { x: number; y: number }[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const ticks = Array.from({ length: 6 }, (_, i) => yMin + (yRange * i) / 5);
  const ts = tradeSignal, pt = positionTool, hasPosition = pt?.enabled && pt.entryPrice > 0;
  const targetPnl = hasPosition ? (pt!.direction === 'LONG' ? ((pt!.targetPrice - pt!.entryPrice) / pt!.entryPrice) : ((pt!.entryPrice - pt!.targetPrice) / pt!.entryPrice)) * pt!.amount * pt!.leverage : 0;
  const stopPnl = hasPosition ? (pt!.direction === 'LONG' ? ((pt!.stopLoss - pt!.entryPrice) / pt!.entryPrice) : ((pt!.entryPrice - pt!.stopLoss) / pt!.entryPrice)) * pt!.amount * pt!.leverage : 0;
  const rr = hasPosition && stopPnl !== 0 ? Math.abs(targetPnl / stopPnl) : 0;

  const LevelLine = ({ price, color, label, opacity = 1 }: { price: number; color: string; label: string; opacity?: number }) => {
    if (price <= 0) return null; const y = yScale(price); if (y < margin.top || y > margin.top + chartH) return null;
    const priceLabel = formatPrice(price);
    const labelW = Math.max(62, (label.length + priceLabel.length + 3) * 5.5);
    return <><line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray="6 3" opacity={opacity} /><rect x={width - margin.right + 2} y={y - 8} width={labelW} height={16} rx={3} fill={color} opacity={opacity} /><text x={width - margin.right + 2 + labelW/2} y={y + 3} fontSize={7} fill="white" fontWeight="bold" textAnchor="middle" opacity={opacity}>{label} ${priceLabel}</text></>;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {ticks.map((t, i) => (<g key={i}><line x1={margin.left} y1={yScale(t)} x2={width - margin.right} y2={yScale(t)} stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.3} /><text x={width - margin.right + 5} y={yScale(t) + 4} fontSize={9} fill="hsl(var(--muted-foreground))" textAnchor="start">{formatY(t)}</text></g>))}
      {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 8)) === 0).map((d, i) => { const idx = data.indexOf(d); return <text key={i} x={xScale(idx)} y={height - 5} fontSize={8} fill="hsl(var(--muted-foreground))" textAnchor="middle">{d.time || d.date.slice(0, 5)}</text>; })}
      {/* Signal zones */}
      {ts && ts.direction !== 'FLAT' && <><rect x={margin.left} y={yScale(Math.max(ts.entry, ts.takeProfit2))} width={chartW} height={Math.abs(yScale(ts.entry) - yScale(ts.takeProfit2))} fill={ts.direction === 'LONG' ? '#10b981' : '#ef4444'} opacity={0.04} /><rect x={margin.left} y={yScale(Math.max(ts.entry, ts.stopLoss))} width={chartW} height={Math.abs(yScale(ts.entry) - yScale(ts.stopLoss))} fill="#ef4444" opacity={0.06} /></>}
      {/* Candles */}
      {data.map((d, i) => { const isGreen = d.close >= d.open; const color = isGreen ? '#10b981' : '#ef4444'; const bodyTop = yScale(Math.max(d.open, d.close)); const bodyBottom = yScale(Math.min(d.open, d.close)); const cx = xScale(i); return <g key={i}><line x1={cx} y1={yScale(d.high)} x2={cx} y2={yScale(d.low)} stroke={color} strokeWidth={1} /><rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={Math.max(1, bodyBottom - bodyTop)} fill={color} stroke={color} strokeWidth={0.5} opacity={0.9} rx={1} /></g>; })}
      {/* EMA overlays */}
      {overlayIndicators && ema9Data.length > 1 && <path d={linePath(ema9Data)} fill="none" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 2" />}
      {overlayIndicators && ema21Data.length > 1 && <path d={linePath(ema21Data)} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 2" />}
      {/* Current price line */}
      {data.length > 0 && <><line x1={margin.left} y1={yScale(data[data.length - 1].close)} x2={width - margin.right} y2={yScale(data[data.length - 1].close)} stroke="#10b981" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} /><text x={width - margin.right + 5} y={yScale(data[data.length - 1].close) + 4} fontSize={9} fill="#10b981" fontWeight="bold">{formatY(data[data.length - 1].close)}</text></>}
      {/* Trade signal levels */}
      {ts && ts.direction !== 'FLAT' && <><LevelLine price={ts.entry} color="#3b82f6" label={ts.entryType === 'LIMIT' ? 'LIMIT' : 'ENTRY'} /><LevelLine price={ts.stopLoss} color="#ef4444" label="STOP" /><LevelLine price={ts.takeProfit1} color="#10b981" label="TP1" opacity={0.7} /><LevelLine price={ts.takeProfit2} color="#10b981" label="TP2" />
        <rect x={margin.left + 8} y={margin.top + 2} width={240} height={92} rx={6} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={1} opacity={0.95} />
        <text x={margin.left + 16} y={margin.top + 18} fontSize={13} fill={ts.direction === 'LONG' ? '#10b981' : '#ef4444'} fontWeight="bold">{ts.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'} — {ts.confidence}%</text>
        <text x={margin.left + 16} y={margin.top + 35} fontSize={9} fill="hsl(var(--muted-foreground))">Вход: <tspan fill="#3b82f6" fontWeight="bold">${formatPrice(ts.entry)}</tspan> | Стоп: <tspan fill="#ef4444" fontWeight="bold">${formatPrice(ts.stopLoss)}</tspan></text>
        <text x={margin.left + 16} y={margin.top + 49} fontSize={9} fill="hsl(var(--muted-foreground))">TP1: <tspan fill="#22c55e" fontWeight="bold">${formatPrice(ts.takeProfit1)}</tspan> | TP2: <tspan fill="#10b981" fontWeight="bold">${formatPrice(ts.takeProfit2)}</tspan> | R:R <tspan fill={ts.riskReward >= 2 ? '#10b981' : '#eab308'} fontWeight="bold">{ts.riskReward.toFixed(2)}</tspan></text>
        <text x={margin.left + 16} y={margin.top + 63} fontSize={9} fill="hsl(var(--muted-foreground))">{ts.holdDuration} | {ts.momentum} | {ts.trend}</text>
        <text x={margin.left + 16} y={margin.top + 77} fontSize={8} fill="hsl(var(--muted-foreground))">Подд: <tspan fill="#10b981">${formatPrice(ts.support)}</tspan> | Сопр: <tspan fill="#ef4444">${formatPrice(ts.resistance)}</tspan></text>
        {ts.candlePattern && <text x={margin.left + 16} y={margin.top + 89} fontSize={8} fill="#f59e0b">Паттерн: {ts.candlePattern}</text>}
      </>}
      {/* Position tool levels */}
      {hasPosition && <><LevelLine price={pt!.entryPrice} color="#3b82f6" label="ENTRY" /><LevelLine price={pt!.targetPrice} color="#10b981" label="TGT" /><LevelLine price={pt!.stopLoss} color="#ef4444" label="STOP" />
        <rect x={margin.left + 255} y={margin.top + 2} width={180} height={55} rx={6} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={1} opacity={0.95} />
        <text x={margin.left + 263} y={margin.top + 18} fontSize={11} fill={pt!.direction === 'LONG' ? '#10b981' : '#ef4444'} fontWeight="bold">{pt!.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'} — {pt!.leverage}x</text>
        <text x={margin.left + 263} y={margin.top + 33} fontSize={9} fill="hsl(var(--muted-foreground))">Профит: <tspan fill={targetPnl >= 0 ? '#10b981' : '#ef4444'} fontWeight="bold">{targetPnl >= 0 ? '+' : ''}{formatPrice(targetPnl)}$</tspan></text>
        <text x={margin.left + 263} y={margin.top + 46} fontSize={9} fill="hsl(var(--muted-foreground))">R:R <tspan fill={rr >= 2 ? '#10b981' : '#eab308'} fontWeight="bold">{rr.toFixed(2)}</tspan> | Итого: <tspan fontWeight="bold" fill={targetPnl >= 0 ? '#10b981' : '#ef4444'}>{formatPrice(pt!.amount + targetPnl)}$</tspan></text>
      </>}
    </svg>
  );
}

function MiniLineChart({ data, color, yMin, yMax, refLines }: { data: number[]; color: string; yMin: number; yMax: number; refLines?: number[]; }) {
  if (data.length < 2) return <div className="h-[110px] flex items-center justify-center text-muted-foreground text-xs">—</div>;
  const w = 500, h = 110, margin = { top: 5, right: 35, bottom: 5, left: 5 };
  const cw = w - margin.left - margin.right, ch = h - margin.top - margin.bottom;
  const range = yMax - yMin || 1;
  const yS = (v: number) => margin.top + ch - ((v - yMin) / range) * ch;
  const xS = (i: number) => margin.left + (i / (data.length - 1)) * cw;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {refLines?.map((v, i) => <g key={i}><line x1={margin.left} y1={yS(v)} x2={margin.left + cw} y2={yS(v)} stroke={v > 50 ? '#ef4444' : '#10b981'} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} /><text x={margin.left + cw + 3} y={yS(v) + 3} fontSize={7} fill={v > 50 ? '#ef4444' : '#10b981'}>{v}</text></g>)}
      <path d={data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yS(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
      {data.length > 0 && <text x={margin.left + cw + 3} y={yS(data[data.length - 1]) + 3} fontSize={8} fill={color} fontWeight="bold">{data[data.length - 1].toFixed(1)}</text>}
    </svg>
  );
}

function MiniMACDChart({ data }: { data: ChartDataPoint[] }) {
  const hist = data.map(d => d.macdHist).filter(v => v != null) as number[];
  const macd = data.map(d => d.macd).filter(v => v != null) as number[];
  const sig = data.map(d => d.macdSignal).filter(v => v != null) as number[];
  if (hist.length < 2) return <div className="h-[110px] flex items-center justify-center text-muted-foreground text-xs">—</div>;
  const w = 500, h = 110, margin = { top: 5, right: 40, bottom: 5, left: 5 };
  const cw = w - margin.left - margin.right, ch = h - margin.top - margin.bottom;
  const all = [...macd, ...sig, ...hist], maxAbs = Math.max(Math.abs(Math.min(...all)), Math.abs(Math.max(...all))) || 1, yR = maxAbs * 1.2;
  const yS = (v: number) => margin.top + ch / 2 - (v / yR) * (ch / 2);
  const xS = (i: number, t: number) => margin.left + (i / (t - 1)) * cw;
  const bw = Math.max(1, (cw / hist.length) * 0.6);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <line x1={margin.left} y1={yS(0)} x2={margin.left + cw} y2={yS(0)} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} opacity={0.3} />
      {hist.map((v, i) => <rect key={i} x={xS(i, hist.length) - bw / 2} y={v >= 0 ? yS(v) : yS(0)} width={bw} height={Math.abs(yS(v) - yS(0))} fill={v >= 0 ? '#10b981' : '#ef4444'} opacity={0.4} />)}
      {macd.length > 1 && <path d={macd.map((v, i) => `${i === 0 ? 'M' : 'L'}${xS(i, macd.length)},${yS(v)}`).join(' ')} fill="none" stroke="#3b82f6" strokeWidth={1.2} />}
      {sig.length > 1 && <path d={sig.map((v, i) => `${i === 0 ? 'M' : 'L'}${xS(i, sig.length)},${yS(v)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={1.2} />}
    </svg>
  );
}

// Deposit mini chart
function DepositChart({ data, initialDeposit, totalDebt }: { data: DepositSnapshot[]; initialDeposit: number; totalDebt?: number }) {
  if (data.length < 2) return null;
  const w = 560, h = 100, margin = { top: 10, right: 50, bottom: 10, left: 10 };
  const cw = w - margin.left - margin.right, ch = h - margin.top - margin.bottom;
  // Use equity (includes locked positions + unrealized PnL)
  const balances = data.map(d => d.equity);
  // Reference: effective capital = initialDeposit + totalDebt (what was actually available)
  const effectiveCapital = initialDeposit + (totalDebt || 0);
  const minB = Math.min(...balances, effectiveCapital) * 0.95;
  const maxB = Math.max(...balances, effectiveCapital) * 1.05;
  const range = maxB - minB || 1;
  const xS = (i: number) => margin.left + (i / (data.length - 1)) * cw;
  const yS = (v: number) => margin.top + ch - ((v - minB) / range) * ch;
  // Profit = equity above effective capital
  const lastVal = data[data.length - 1].equity;
  const isProfit = lastVal >= effectiveCapital;
  const lineColor = isProfit ? '#10b981' : '#ef4444';
  const areaPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yS(d.equity)}`).join(' ') + ` L${xS(data.length - 1)},${margin.top + ch} L${margin.left},${margin.top + ch} Z`;
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i)},${yS(d.equity)}`).join(' ');
  // PnL relative to own capital only (not debt)
  const ownEquity = lastVal - (totalDebt || 0);
  const pnlPct = ((ownEquity / initialDeposit - 1) * 100).toFixed(1);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Effective capital reference line */}
      <line x1={margin.left} y1={yS(effectiveCapital)} x2={margin.left + cw} y2={yS(effectiveCapital)} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} strokeDasharray="4 2" opacity={0.5} />
      <text x={margin.left + cw + 3} y={yS(effectiveCapital) + 3} fontSize={7} fill="hsl(var(--muted-foreground))">${effectiveCapital.toFixed(0)}</text>
      {/* Area */}
      <path d={areaPath} fill={lineColor} opacity={0.08} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} />
      {/* Last value */}
      <text x={margin.left + cw + 3} y={yS(lastVal) + 3} fontSize={9} fill={lineColor} fontWeight="bold">${lastVal.toFixed(2)}</text>
      <text x={margin.left + 5} y={margin.top + 12} fontSize={8} fill={isProfit ? '#10b981' : '#ef4444'} fontWeight="bold">
        {parseFloat(pnlPct) >= 0 ? '+' : ''}{pnlPct}% PnL
      </text>
    </svg>
  );
}

// ============================================
// TRADE TERMINAL MODAL — Full-screen trade view
// ============================================
function TradeTerminalModal({ trade, coins, onClose }: { trade: Trade; coins: CoinData[]; onClose: () => void }) {
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

  const tradeSignalForChart: TradeSignal | null = {
    direction: trade.direction, confidence: trade.confidence, entry: trade.entry,
    entryType: trade.entryType, entryReason: trade.entryReason, stopLoss: trade.stopLoss,
    takeProfit1: trade.takeProfit1, takeProfit2: trade.takeProfit2, takeProfit3: trade.takeProfit3,
    riskReward: trade.entry > 0 && trade.stopLoss > 0 ? Math.abs(trade.takeProfit1 - trade.entry) / Math.abs(trade.entry - trade.stopLoss) : 0,
    holdDuration: '', holdDurationHours: 0, reasons: trade.reasons, warnings: [],
    indicators: [], multiTimeframe: { consensus: 'NEUTRAL', alignment: 0 },
    currentPrice: currentPrice || trade.currentPrice, atr: 0, support: 0, resistance: 0,
    trend: 'BULLISH', momentum: 'MODERATE', candlePattern: null, volumeSignal: null,
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-[95vw] h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex" onClick={e => e.stopPropagation()}>

        {/* Close button — always visible */}
        <button onClick={onClose} className="absolute top-3 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors" title="Закрыть">
          <X className="w-5 h-5" />
        </button>

        {/* LEFT: Chart — takes all remaining space */}
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
                  <Badge variant="outline" className="text-[10px]">{trade.timeframe}</Badge>
                  {!trade.resolved && <Badge className="text-[10px] bg-blue-500 text-white">АКТИВЕН</Badge>}
                  {trade.resolved && trade.result === 'WIN' && <Badge className="text-[10px] bg-emerald-500 text-white">+ПРИБЫЛЬ</Badge>}
                  {trade.resolved && trade.result === 'LOSS' && <Badge className="text-[10px] bg-red-500 text-white">-УБЫТОК</Badge>}
                  {trade.resolved && trade.result === 'EXPIRED' && <Badge className="text-[10px] bg-yellow-500 text-white">ИСТЁК</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtDate(trade.timestamp)}
                  {trade.enteredAt && trade.enteredAt !== trade.timestamp && <> · Вход: {fmtTime(trade.enteredAt)}</>}
                  {trade.closedAt && <> · Выход: {fmtTime(trade.closedAt)}</>}
                  {tradeDuration !== null && <> · {tradeDuration >= 60 ? `${Math.floor(tradeDuration/60)}ч ${tradeDuration%60}м` : `${tradeDuration}м`}</>}
                </div>
              </div>
            </div>
            {/* P&L badge in header */}
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

          {/* Chart area — fills remaining height */}
          <div className="flex-1 p-4">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="ml-3 text-sm text-muted-foreground">Загрузка графика...</span>
              </div>
            ) : chartData.length > 0 ? (
              <CandlestickChartComponent data={chartData} overlayIndicators={true} positionTool={null} tradeSignal={tradeSignalForChart} />
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
                    <span className={`font-mono font-bold text-sm text-${level.color}-500`}>${formatPrice(level.price)}</span>
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
                <div className="text-xs text-muted-foreground">Ожидание отката до ${formatPrice(trade.entry)}</div>
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
                    <span className="font-mono font-bold text-sm">${formatPrice(currentPrice)}</span>
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
                    <span className="font-mono font-bold text-sm">${formatPrice(currentPrice)}</span>
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
                    <span className="font-mono font-bold text-sm">${formatPrice(trade.exitPrice)}</span>
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

// Trade filter component
function TradeFilter({ trades, onTradeClick, onDeleteTrade }: { trades: Trade[]; onTradeClick: (trade: Trade) => void; onDeleteTrade: (tradeId: string) => void }) {
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'WIN' | 'LOSS' | 'EXPIRED'>('ALL');
  const [coinFilter, setCoinFilter] = useState<string>('ALL');
  const uniqueCoins = [...new Set(trades.map(t => t.coinSymbol))].sort();

  const filtered = trades.filter(t => {
    if (filter === 'OPEN' && t.resolved) return false;
    if (filter === 'WIN' && t.result !== 'WIN') return false;
    if (filter === 'LOSS' && t.result !== 'LOSS') return false;
    if (filter === 'EXPIRED' && t.result !== 'EXPIRED') return false;
    if (coinFilter !== 'ALL' && t.coinSymbol !== coinFilter) return false;
    return true;
  }).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {(['ALL', 'OPEN', 'WIN', 'LOSS', 'EXPIRED'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2 py-0.5 text-[9px] rounded-md transition-colors ${
            filter === f ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent text-muted-foreground'
          }`}>
            {f === 'ALL' ? 'Все' : f === 'OPEN' ? 'Открытые' : f === 'WIN' ? 'Прибыль' : f === 'LOSS' ? 'Убыток' : 'Истёкшие'}
          </button>
        ))}
        {uniqueCoins.length > 1 && (
          <select value={coinFilter} onChange={e => setCoinFilter(e.target.value)} className="ml-2 px-2 py-0.5 text-[9px] rounded-md border border-border bg-card text-foreground">
            <option value="ALL">Все монеты</option>
            {uniqueCoins.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <TradeList trades={filtered} onTradeClick={onTradeClick} onDeleteTrade={onDeleteTrade} />
    </div>
  );
}

// Trade list component
function TradeList({ trades, onTradeClick, onDeleteTrade }: { trades: Trade[]; onTradeClick: (trade: Trade) => void; onDeleteTrade: (tradeId: string) => void }) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Gauge className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>Сделок ещё не было. Когда система выдаст сигнал, трейдер автоматически откроет позицию.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trades.slice(0, 30).map(trade => (
        <div key={trade.id} onClick={() => onTradeClick(trade)} className={`rounded-xl border p-3 text-[11px] cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all ${
          trade.resolved ? (
            trade.result === 'WIN' ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50' :
            trade.result === 'LOSS' ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50' :
            'border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50'
          ) : 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50'
        }`}>
          {/* Row 1: Direction, Coin, Status, Time */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
              trade.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
            }`}>
              {trade.direction === 'LONG' ? '▲' : '▼'}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-bold ${trade.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {trade.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'}
                </span>
                <span className="font-semibold text-foreground">{trade.coinSymbol}/USDT</span>
                <Badge variant="outline" className="text-[8px]">{trade.timeframe}</Badge>
                <span className="text-muted-foreground">{trade.confidence}%</span>
              </div>
              <div className="text-[9px] text-muted-foreground">
                {new Date(trade.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {trade.enteredAt && trade.enteredAt !== trade.timestamp && (
                  <> → Вход: {new Date(trade.enteredAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</>
                )}
                {trade.closedAt && (
                  <> → Закрыт: {new Date(trade.closedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</>
                )}
              </div>
            </div>
            {!trade.resolved && <Badge className="text-[9px] bg-blue-500 text-white">АКТИВЕН</Badge>}
            {trade.resolved && trade.result === 'WIN' && <Badge className="text-[9px] bg-emerald-500 text-white">+ПРИБЫЛЬ</Badge>}
            {trade.resolved && trade.result === 'LOSS' && <Badge className="text-[9px] bg-red-500 text-white">-УБЫТОК</Badge>}
            {trade.resolved && trade.result === 'EXPIRED' && <Badge className="text-[9px] bg-yellow-500 text-white">ИСТЁК</Badge>}
          </div>

          {/* Row 2: Position details */}
          <div className="grid grid-cols-4 gap-2 mb-1.5">
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">ВХОД</div>
              <div className="font-mono font-bold text-blue-500">${formatPrice(trade.entry)}</div>
              <div className="text-[8px] text-muted-foreground">{trade.entryType} {trade.entryType === 'LIMIT' && !trade.entryReached ? '(ждёт)' : ''}</div>
            </div>
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">СТОП-ЛОСС</div>
              <div className="font-mono font-bold text-red-500">${formatPrice(trade.stopLoss)}</div>
            </div>
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">ТЕЙК-ПРОФИТ</div>
              <div className="font-mono font-bold text-emerald-500">${formatPrice(trade.takeProfit1)}</div>
            </div>
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">ПОЗИЦИЯ</div>
              <div className="font-mono font-bold text-foreground">${trade.positionSize.toFixed(2)}</div>
              <div className="text-[8px] text-muted-foreground">{trade.leverage}x плечо</div>
            </div>
          </div>

          {/* Row 3: Entry reason */}
          {trade.entryReason && (
            <div className="text-[10px] text-muted-foreground mb-1">
              <span className="font-semibold">Причина:</span> {trade.entryReason}
            </div>
          )}

          {/* Row 4: Result & PnL */}
          {trade.resolved && (
            <div className={`flex items-center justify-between mt-1.5 pt-1.5 border-t ${
              trade.result === 'WIN' ? 'border-emerald-500/20' : trade.result === 'LOSS' ? 'border-red-500/20' : 'border-border/30'
            }`}>
              <div className="text-[10px] text-muted-foreground">
                {trade.exitReason}
              </div>
              {trade.pnlUSDT != null && (
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold text-sm ${trade.pnlUSDT >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {trade.pnlUSDT >= 0 ? '+' : ''}{trade.pnlUSDT.toFixed(2)} USDT
                  </span>
                  {trade.pnlPct != null && (
                    <span className={`font-mono text-[10px] ${trade.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Click hint + Delete button for open trades */}
          <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-border/20">
            <span className="text-[9px] text-muted-foreground/50 flex items-center gap-1">
              <ExternalLink className="w-2.5 h-2.5" />
              Открыть в терминале
            </span>
            {!trade.resolved && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Отменить сделку ${trade.coinSymbol}/USDT ${trade.direction}? Средства ($${trade.positionSize.toFixed(2)}) вернутся на депозит.`)) {
                    onDeleteTrade(trade.id);
                  }
                }}
                className="text-[9px] text-red-400 hover:text-red-500 flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-red-500/10 transition-colors"
                title="Отменить сделку"
              >
                <Trash2 className="w-3 h-3" />
                Отменить
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CryptoDashboard() {
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [selectedCoin, setSelectedCoin] = useState('bitcoin');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [tradeSignal, setTradeSignal] = useState<TradeSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [interval, setInterval_] = useState('1h');
  const [searchQuery, setSearchQuery] = useState('');
  const [apiSource, setApiSource] = useState('');
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [showIndicators, setShowIndicators] = useState(true);
  const [positionTool, setPositionTool] = useState<PositionTool>({ enabled: false, direction: 'LONG', entryPrice: 0, targetPrice: 0, stopLoss: 0, amount: 100, leverage: 1 });
  const [copied, setCopied] = useState(false);
  const [advisorAnalysis, setAdvisorAnalysis] = useState<string | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorVisible, setAdvisorVisible] = useState(false);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [showReputationPanel, setShowReputationPanel] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{ opportunities: any[] } | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [traderThinking, setTraderThinking] = useState<any>(null);
  const [showThinkingPanel, setShowThinkingPanel] = useState(false);
  const lastRecordedSignal = useRef<string>('');
  const chartRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchMarketData = useCallback(async () => {
    try { const res = await fetch('/api/crypto/market'); if (res.ok) { const json = await res.json(); setCoins(json.data || []); setApiSource(json.source || ''); setLastUpdate(Date.now()); } } catch {} finally { setLoading(false); }
  }, []);

  const fetchChartData = useCallback(async () => {
    if (!selectedCoin) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setChartLoading(true);
    try {
      const res = await fetch(`/api/crypto/signals?coin=${selectedCoin}&interval=${interval}`, { signal: abortRef.current.signal });
      if (!res.ok) { setChartData([]); setSignal({ type: 'HOLD', strength: 0, indicators: [], summary: 'Данные недоступны' }); setTradeSignal(null); return; }
      const json = await res.json();
      setChartData(json.chartData || []);
      setSignal(json.signal || null);
      setTradeSignal(json.tradeSignal || null);
      setApiSource(json.source || apiSource);
    } catch { setChartData([]); setTradeSignal(null); } finally { setChartLoading(false); }
  }, [selectedCoin, interval, apiSource]);

  const fetchSentiment = useCallback(async () => {
    try { const res = await fetch('/api/crypto/sentiment'); if (res.ok) setSentiment(await res.json()); } catch {}
  }, []);

  const fetchReputation = useCallback(async () => {
    try { const res = await fetch('/api/crypto/reputation'); if (res.ok) setReputation(await res.json()); } catch {}
  }, []);

  // Helper: record trader's thought
  const recordThought = useCallback(async (thought: any) => {
    try {
      await fetch('/api/crypto/trader-thinking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thought),
      });
    } catch {}
  }, []);

  // Fetch trader's thinking log
  const fetchThinking = useCallback(async () => {
    try {
      const res = await fetch('/api/crypto/trader-thinking');
      if (res.ok) {
        const data = await res.json();
        setTraderThinking(data);
      }
    } catch {}
  }, []);

  // Full intraday trader: scan, analyze, open multiple positions, think out loud
  const scanAndTrade = useCallback(async () => {
    setScanLoading(true);
    try {
      // Step 1: Get current reputation (balance, open positions)
      let repData: any = null;
      try {
        const repRes = await fetch('/api/crypto/reputation');
        if (repRes.ok) repData = await repRes.json();
      } catch {}

      const freeBalance = repData?.freeBalance || 0;
      const openPositions = (repData?.trades || []).filter((t: any) => !t.resolved).length;
      const lockedMargin = repData?.lockedInPositions || 0;
      const totalEquity = repData?.balance + lockedMargin + (repData?.trades || []).filter((t: any) => !t.resolved && t.entryReached).reduce((s: number, t: any) => {
        if (!repData?.trades) return s;
        return s; // Simplified — unrealized PnL shown in equity already
      }, 0);

      // Step 2: Scan market for opportunities
      const res = await fetch('/api/crypto/scan');
      if (!res.ok) {
        await recordThought({
          type: 'scan', title: 'Скан рынка не удался',
          detail: 'Не удалось получить данные сканера. Пропускаю цикл.',
          emotion: 'worried', tags: ['error', 'scan'],
          openPositionsCount: openPositions, freeBalance, totalEquity: freeBalance + lockedMargin,
        });
        return;
      }

      const data = await res.json();
      setScanResult(data);
      const allOpps = data.opportunities || [];
      const minConfidence = data.adaptiveRules?.minConfidence || 60;
      const minRr = data.adaptiveRules?.minRr || 1.5;

      // Step 3: Think — analyze market situation
      const bullishOpps = allOpps.filter((o: any) => o.direction === 'LONG');
      const bearishOpps = allOpps.filter((o: any) => o.direction === 'SHORT');
      const marketView = bullishOpps.length > bearishOpps.length * 1.5 ? 'Бычий'
        : bearishOpps.length > bullishOpps.length * 1.5 ? 'Медвежий' : 'Нейтральный';

      // Record scan observation
      await recordThought({
        type: 'scan',
        title: `Скан: ${allOpps.length} сигналов (${bullishOpps.length} LONG, ${bearishOpps.length} SHORT)`,
        detail: `Рынок: ${marketView}. Свободных средств: $${freeBalance.toFixed(2)}. Открытых позиций: ${openPositions}/5. Лучший сигнал: ${allOpps[0]?.symbol || 'нет'} (${allOpps[0]?.score?.toFixed(0) || 0} очков, ${allOpps[0]?.direction || '-'})`,
        emotion: allOpps.length > 0 ? 'analytical' : 'cautious',
        tags: ['scan', 'market_analysis'],
        marketView,
        openPositionsCount: openPositions,
        freeBalance,
        totalEquity: freeBalance + lockedMargin,
      });

      // Step 4: Decide — how many positions can we open?
      const maxPositions = 5;
      const slotsAvailable = maxPositions - openPositions;
      if (slotsAvailable <= 0) {
        await recordThought({
          type: 'decision', title: 'Максимум позиций',
          detail: `Уже открыто ${openPositions} позиций — максимум 5. Жду закрытия.`,
          emotion: 'cautious', tags: ['max_positions', 'wait'],
          openPositionsCount: openPositions, freeBalance, totalEquity: freeBalance + lockedMargin,
        });
        return;
      }

      if (freeBalance < 3) {
        await recordThought({
          type: 'decision', title: 'Недостаточно средств',
          detail: `Свободный баланс $${freeBalance.toFixed(2)} — слишком мало для входа. Минимум $3.`,
          emotion: 'worried', tags: ['low_balance'],
          openPositionsCount: openPositions, freeBalance, totalEquity: freeBalance + lockedMargin,
        });
        return;
      }

      // Step 5: Filter valid opportunities — INTRADAY TRADER opens MULTIPLE positions
      const validOpps = allOpps.filter((o: any) => {
        if (o.confidence < minConfidence * 0.7) return false;
        if (o.score < 25) return false;
        if (o.riskReward < minRr * 0.7) return false;
        return true;
      });

      if (validOpps.length === 0) {
        await recordThought({
          type: 'decision', title: 'Нет подходящих сигналов',
          detail: `Из ${allOpps.length} сигналов ни один не прошёл фильтры (confidence≥${(minConfidence * 0.7).toFixed(0)}%, score≥25, R:R≥${(minRr * 0.7).toFixed(1)}). Лучший: ${allOpps[0]?.symbol || 'нет'} (${allOpps[0]?.score?.toFixed(0) || 0} очков)`,
          emotion: 'cautious', tags: ['no_signals', 'filter'],
          openPositionsCount: openPositions, freeBalance, totalEquity: freeBalance + lockedMargin,
        });
        return;
      }

      // Step 6: Open positions — as many as possible with available funds
      let openedCount = 0;
      const maxToTry = Math.min(slotsAvailable, 3); // Try up to 3 new positions per scan cycle
      const attemptedSymbols: string[] = [];
      const rejectedSymbols: string[] = [];

      for (const opp of validOpps.slice(0, maxToTry + 2)) { // Try a few extra in case some get rejected
        if (openedCount >= maxToTry) break;
        if (freeBalance - openedCount * (freeBalance * 0.12) < 3) break; // Not enough for more

        const isMarketPreferred = opp.confidence >= 75 ||
          Math.abs(opp.price - opp.entry) / opp.price * 100 < 0.15 ||
          (opp.reasons || []).some((r: string) => r.includes('пробой') || r.includes('breakout'));

        try {
          const tradeRes = await fetch('/api/crypto/reputation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              coinId: opp.coinId,
              coinSymbol: opp.symbol,
              direction: opp.direction,
              entryType: isMarketPreferred ? 'MARKET' : 'LIMIT',
              entry: opp.entry,
              stopLoss: opp.stopLoss,
              takeProfit1: opp.takeProfit1,
              takeProfit2: opp.direction === 'LONG'
                ? opp.takeProfit1 + (opp.takeProfit1 - opp.entry) * 0.5
                : opp.takeProfit1 - (opp.entry - opp.takeProfit1) * 0.5,
              takeProfit3: opp.direction === 'LONG'
                ? opp.takeProfit1 + (opp.takeProfit1 - opp.entry)
                : opp.takeProfit1 - (opp.entry - opp.takeProfit1),
              currentPrice: opp.price,
              confidence: opp.confidence,
              timeframe: opp.timeframe,
              entryReason: opp.entryReason,
              reasons: opp.reasons,
              leverage: 3,
            }),
          });

          if (tradeRes.ok) {
            const tradeData = await tradeRes.json();
            if (tradeData.success) {
              openedCount++;
              attemptedSymbols.push(opp.symbol);
              await recordThought({
                type: 'decision',
                title: `ОТКРЫТА позиция: ${opp.symbol} ${opp.direction}`,
                detail: `${isMarketPreferred ? 'РЫНОЧНЫЙ' : 'ЛИМИТНЫЙ'} вход на $${opp.price?.toFixed(2)}. Confidence: ${opp.confidence}%, Score: ${opp.score?.toFixed(0)}, R:R: ${opp.riskReward?.toFixed(2)}. SL: $${opp.stopLoss?.toFixed(2)}, TP1: $${opp.takeProfit1?.toFixed(2)}. Причина: ${opp.entryReason || opp.reasons?.join(', ') || 'технический сигнал'}`,
                coinSymbol: opp.symbol, coinId: opp.coinId,
                direction: opp.direction, confidence: opp.confidence,
                score: opp.score, tradeId: tradeData.tradeId,
                entryType: isMarketPreferred ? 'MARKET' : 'LIMIT',
                emotion: opp.confidence >= 75 ? 'confident' : 'analytical',
                tags: ['open_position', opp.direction.toLowerCase(), isMarketPreferred ? 'market' : 'limit'],
                openPositionsCount: openPositions + openedCount,
                freeBalance: freeBalance - openedCount * (freeBalance * 0.12),
                totalEquity: freeBalance + lockedMargin,
              });
            } else {
              rejectedSymbols.push(`${opp.symbol}(${tradeData.reason})`);
            }
          }
          fetchReputation();
        } catch {}
      }

      // Step 7: Summary thought
      if (openedCount > 0) {
        await recordThought({
          type: 'observation',
          title: `Цикл завершён: открыто ${openedCount} позиций`,
          detail: `Открыты: ${attemptedSymbols.join(', ')}. ${rejectedSymbols.length > 0 ? `Отклонены: ${rejectedSymbols.join(', ')}` : ''}. Рынок: ${marketView}. Свободных средств осталось ~$${(freeBalance - openedCount * freeBalance * 0.12).toFixed(2)}`,
          emotion: openedCount >= 2 ? 'confident' : 'satisfied',
          tags: ['cycle_summary', `${openedCount}_opened`],
          openPositionsCount: openPositions + openedCount,
          freeBalance: freeBalance - openedCount * freeBalance * 0.12,
          totalEquity: freeBalance + lockedMargin,
          marketView,
        });
      } else if (rejectedSymbols.length > 0) {
        await recordThought({
          type: 'observation',
          title: `Цикл завершён: все сигналы отклонены`,
          detail: `Причины: ${rejectedSymbols.join('; ')}. Жду следующий цикл.`,
          emotion: 'cautious', tags: ['cycle_summary', 'all_rejected'],
          openPositionsCount: openPositions, freeBalance, totalEquity: freeBalance + lockedMargin,
        });
      }

      // Refresh thinking panel
      fetchThinking();
    } catch {} finally {
      setScanLoading(false);
    }
  }, [fetchReputation, recordThought, fetchThinking]);

  // Deposit funds as credit
  const depositFunds = useCallback(async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositLoading(true);
    try {
      const res = await fetch('/api/crypto/reputation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, label: `Кредит #${(reputation?.debtHistory?.length || 0) + 1}` }),
      });
      if (res.ok) {
        setDepositAmount('');
        fetchReputation();
      }
    } catch {} finally {
      setDepositLoading(false);
    }
  }, [depositAmount, fetchReputation, reputation]);

  // Delete/cancel a trade, return funds to balance
  const deleteTrade = useCallback(async (tradeId: string) => {
    try {
      const res = await fetch('/api/crypto/reputation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId }),
      });
      if (res.ok) {
        fetchReputation();
      }
    } catch {}
  }, [fetchReputation]);

  // Record signal to reputation system whenever a new actionable signal arrives
  const recordSignal = useCallback(async (ts: TradeSignal, coinId: string, coinSymbol: string) => {
    if (!ts || ts.direction === 'FLAT') return;
    try {
      await fetch('/api/crypto/reputation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coinId,
          coinSymbol,
          direction: ts.direction,
          entryType: ts.entryType || 'LIMIT',
          entry: ts.entry,
          stopLoss: ts.stopLoss,
          takeProfit1: ts.takeProfit1,
          takeProfit2: ts.takeProfit2,
          takeProfit3: ts.takeProfit3,
          currentPrice: ts.currentPrice,
          confidence: ts.confidence,
          timeframe: interval,
          entryReason: ts.entryReason || '',
          reasons: ts.reasons || [],
          leverage: 3,
        }),
      });
      fetchReputation(); // Refresh reputation after recording
    } catch {}
  }, [fetchReputation]);

  const fetchAdvisor = useCallback(async () => {
    if (!tradeSignal || !selectedCoin) return;
    setAdvisorLoading(true);
    setAdvisorVisible(true);
    try {
      const indicatorStr = signal?.indicators?.map(i => `${i.name}: ${i.value} (${i.signal}) ${i.description}`).join('; ') || '';
      const params = new URLSearchParams({
        coin: selectedCoin,
        direction: tradeSignal.direction,
        confidence: String(tradeSignal.confidence),
        entry: String(tradeSignal.entry),
        stopLoss: String(tradeSignal.stopLoss),
        tp1: String(tradeSignal.takeProfit1),
        tp2: String(tradeSignal.takeProfit2),
        tp3: String(tradeSignal.takeProfit3),
        trend: tradeSignal.trend,
        momentum: tradeSignal.momentum,
        reasons: tradeSignal.reasons.join('; '),
        warnings: tradeSignal.warnings.join('; '),
        candlePattern: tradeSignal.candlePattern || '',
        volumeSignal: tradeSignal.volumeSignal || '',
        support: String(tradeSignal.support),
        resistance: String(tradeSignal.resistance),
        atr: String(tradeSignal.atr),
        holdDuration: tradeSignal.holdDuration,
        indicators: indicatorStr,
      });
      const res = await fetch(`/api/crypto/advisor?${params}`);
      if (res.ok) {
        const json = await res.json();
        setAdvisorAnalysis(json.analysis || null);
      } else {
        setAdvisorAnalysis('Не удалось получить анализ. Попробуйте позже.');
      }
    } catch {
      setAdvisorAnalysis('Ошибка подключения к AI-советчику.');
    } finally {
      setAdvisorLoading(false);
    }
  }, [tradeSignal, selectedCoin, signal]);

  useEffect(() => { if (tradeSignal && tradeSignal.direction !== 'FLAT') { const entry = tradeSignal.currentPrice || tradeSignal.entry; if (positionTool.enabled && entry > 0) { const isLong = tradeSignal.direction !== 'SHORT'; setPositionTool(p => ({ ...p, entryPrice: entry, targetPrice: tradeSignal.takeProfit2 || entry * (isLong ? 1.05 : 0.95), stopLoss: tradeSignal.stopLoss || entry * (isLong ? 0.97 : 1.03) })); } } }, [selectedCoin, interval]); // eslint-disable-line

  useEffect(() => { fetchMarketData(); fetchSentiment(); fetchReputation(); }, [fetchMarketData, fetchSentiment, fetchReputation]);
  useEffect(() => { fetchChartData(); }, [fetchChartData]);
  // Record signal to reputation when a new actionable signal arrives (with dedup)
  useEffect(() => {
    if (tradeSignal && tradeSignal.direction !== 'FLAT') {
      const sigKey = `${selectedCoin}-${tradeSignal.direction}-${tradeSignal.entry.toFixed(2)}-${tradeSignal.confidence}`;
      if (sigKey !== lastRecordedSignal.current) {
        lastRecordedSignal.current = sigKey;
        const sym = coins.find(c => c.id === selectedCoin)?.symbol || selectedCoin.toUpperCase();
        recordSignal(tradeSignal, selectedCoin, sym);
      }
    }
  }, [tradeSignal?.direction, tradeSignal?.entry, selectedCoin]); // eslint-disable-line
  useEffect(() => { const iv = setInterval(() => { fetchMarketData(); fetchChartData(); fetchSentiment(); fetchReputation(); fetchThinking(); }, 45000); return () => clearInterval(iv); }, [fetchMarketData, fetchChartData, fetchSentiment, fetchReputation, fetchThinking]);
  // Auto-scan for best trades every 60s — intraday trader needs frequent scans
  useEffect(() => { scanAndTrade(); fetchThinking(); const iv = setInterval(scanAndTrade, 60000); return () => clearInterval(iv); }, [scanAndTrade, fetchThinking]);

  const filteredCoins = coins.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.symbol.toLowerCase().includes(searchQuery.toLowerCase()));
  const selectedCoinData = coins.find(c => c.id === selectedCoin);
  const priceChange24h = selectedCoinData?.price_change_percentage_24h || 0;
  const displayPrice = selectedCoinData?.current_price || chartData[chartData.length - 1]?.close || 0;
  const ts = tradeSignal;

  // Copy trade signal to clipboard
  const copyTrade = useCallback(() => {
    if (!ts || ts.direction === 'FLAT') return;
    const text = `${ts.direction === 'LONG' ? '🟢 ЛОНГ' : '🔴 ШОРТ'} ${(selectedCoinData?.symbol || selectedCoin).toUpperCase()}/USDT\n` +
      `📊 Уверенность: ${ts.confidence}%\n` +
      `💰 Вход: $${formatPrice(ts.entry)}\n` +
      `🛑 Стоп-лосс: $${formatPrice(ts.stopLoss)} (${pctChange(ts.entry, ts.stopLoss)})\n` +
      `🎯 TP1: $${formatPrice(ts.takeProfit1)} (${pctChange(ts.entry, ts.takeProfit1)})\n` +
      `🎯 TP2: $${formatPrice(ts.takeProfit2)} (${pctChange(ts.entry, ts.takeProfit2)})\n` +
      `🎯 TP3: $${formatPrice(ts.takeProfit3)} (${pctChange(ts.entry, ts.takeProfit3)})\n` +
      `📐 R:R = ${ts.riskReward.toFixed(2)}\n` +
      `⏱ Удержание: ${ts.holdDuration}\n` +
      `📈 Тренд: ${ts.trend} | Импульс: ${ts.momentum}\n` +
      `${ts.candlePattern ? `🕯 Паттерн: ${ts.candlePattern}\n` : ''}` +
      `✅ ${ts.reasons.slice(0, 3).join(' | ')}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [ts, selectedCoinData, selectedCoin]);

  // Generate step-by-step trade plan
  const getTradeSteps = (): string[] => {
    if (!ts || ts.direction === 'FLAT') return [];
    const steps: string[] = [];
    steps.push(`1. Открыть ${ts.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'} по рынку @ $${formatPrice(ts.entry)}`);
    steps.push(`2. Установить стоп-лосс: $${formatPrice(ts.stopLoss)}`);
    steps.push(`3. Цель TP1 (фиксация 30%): $${formatPrice(ts.takeProfit1)}`);
    steps.push(`4. Цель TP2 (фиксация 50%): $${formatPrice(ts.takeProfit2)}`);
    steps.push(`5. Цель TP3 (остаток): $${formatPrice(ts.takeProfit3)}`);
    steps.push(`6. Удержание: ${ts.holdDuration}`);
    if (ts.direction === 'LONG') {
      steps.push(`7. Если пробит стоп $${formatPrice(ts.stopLoss)} — закрыть позицию без раздумий`);
    } else {
      steps.push(`7. Если пробит стоп $${formatPrice(ts.stopLoss)} — закрыть позицию без раздумий`);
    }
    return steps;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-[1700px] mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-lg font-bold tracking-tight">IntraTrade Pro</h1><p className="text-[10px] text-muted-foreground">Внутридневной торговый терминал</p></div>
          </div>
          <div className="flex items-center gap-3">
            {reputation && (
              <button onClick={() => setShowReputationPanel(!showReputationPanel)} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition-colors cursor-pointer">
                <span className="text-sm">{reputation.levelEmoji}</span>
                <span className="text-[10px] font-bold text-purple-500">{reputation.level}</span>
                <span className="text-[10px] font-mono font-bold text-foreground">${(reputation.freeBalance + (reputation.lockedInPositions || 0)).toFixed(0)}</span>
                <span className={`text-[9px] font-mono font-bold ${reputation.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {reputation.totalPnl >= 0 ? '+' : ''}{(((reputation.freeBalance + (reputation.lockedInPositions || 0)) / reputation.initialDeposit - 1) * 100).toFixed(0)}%
                </span>
                {reputation.streak !== 0 && <span className={`text-[9px] font-bold ${reputation.streak > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{reputation.streak > 0 ? `${reputation.streak}W` : `${Math.abs(reputation.streak)}L`}</span>}
              </button>
            )}
            <button onClick={() => setShowThinkingPanel(!showThinkingPanel)} className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${showThinkingPanel ? 'border-amber-500/50 bg-amber-500/10' : 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'}`}>
              <Brain className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold text-amber-500">Мышление</span>
              {traderThinking?.thoughts?.length > 0 && <span className="text-[9px] font-mono text-amber-400">{traderThinking.thoughts.length}</span>}
            </button>
            {ts && ts.direction !== 'FLAT' && (
              <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border ${ts.direction === 'LONG' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                {ts.direction === 'LONG' ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                <span className={`text-sm font-bold ${ts.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>{ts.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'}</span>
                <span className="text-xs text-muted-foreground">{ts.confidence}%</span>
              </div>
            )}
            {sentiment && <div className="hidden md:flex items-center gap-1.5 text-xs"><Gauge className="w-4 h-4 text-orange-500" /><span className="text-orange-500">{sentiment.fearGreed.value}</span></div>}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Clock className="w-3 h-3" />{formatTimeAgo(lastUpdate)}</div>
            <Button variant="outline" size="sm" onClick={() => { fetchMarketData(); fetchChartData(); fetchSentiment(); }} className="gap-1 h-7"><RefreshCw className="w-3 h-3" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1700px] mx-auto px-4 py-3">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
          {/* Coin List */}
          <div className="space-y-2">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск монеты..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <Card className="overflow-hidden"><CardContent className="p-0"><ScrollArea className="h-[calc(100vh-140px)]">
              {loading ? <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex items-center gap-2 animate-pulse"><div className="w-7 h-7 bg-muted rounded-full" /><div className="flex-1 space-y-1"><div className="h-3 w-16 bg-muted rounded" /></div></div>)}</div>
              : <div className="divide-y divide-border">{filteredCoins.map(coin => (
                <button key={coin.id} onClick={() => setSelectedCoin(coin.id)} className={`w-full flex items-center gap-2 px-2.5 py-2 hover:bg-accent/50 transition-colors text-left ${selectedCoin === coin.id ? 'bg-accent' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {coin.image ? <img src={coin.image} alt="" className="w-5 h-5" onError={e => {(e.target as HTMLImageElement).style.display='none'}} /> : <span className="text-[9px] font-bold">{coin.symbol.slice(0,2)}</span>}
                  </div>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-1"><span className="font-medium text-xs truncate">{coin.symbol}</span></div><div className="text-[11px] font-mono">${formatPrice(coin.current_price)}</div></div>
                  <div className="text-right flex-shrink-0"><div className={`text-[10px] font-semibold flex items-center gap-0.5 ${(coin.price_change_percentage_24h||0)>=0?'text-emerald-500':'text-red-500'}`}>{(coin.price_change_percentage_24h||0)>=0?<ArrowUpRight className="w-2.5 h-2.5"/>:<ArrowDownRight className="w-2.5 h-2.5"/>}{Math.abs(coin.price_change_percentage_24h||0).toFixed(2)}{'%'}</div></div>
                </button>))}</div>}
            </ScrollArea></CardContent></Card>
          </div>

          {/* Main Panel */}
          <div className="space-y-3">

            {/* ====== TRADE SIGNAL BANNER — MAIN FEATURE ====== */}
            {ts && ts.direction !== 'FLAT' && (
              <Card className={`border-2 overflow-hidden ${ts.direction === 'LONG' ? 'border-emerald-500/70 bg-gradient-to-r from-emerald-500/5 to-transparent' : 'border-red-500/70 bg-gradient-to-r from-red-500/5 to-transparent'}`}>
                <CardContent className="p-0">
                  {/* Top: Signal Header */}
                  <div className={`px-4 py-3 ${ts.direction === 'LONG' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${ts.direction === 'LONG' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                          {ts.direction === 'LONG' ? <MoveUp className="w-8 h-8 text-emerald-500" /> : <MoveDown className="w-8 h-8 text-red-500" />}
                        </div>
                        <div>
                          <div className={`text-3xl font-black tracking-tight ${ts.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>
                            {ts.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px]"><Zap className="w-2.5 h-2.5 mr-0.5"/>{ts.confidence}%</Badge>
                            <Badge variant="outline" className={`text-[10px] ${ts.trend === 'BULLISH' ? 'text-emerald-500' : ts.trend === 'BEARISH' ? 'text-red-500' : 'text-yellow-500'}`}>{ts.trend === 'BULLISH' ? '▲' : ts.trend === 'BEARISH' ? '▼' : '→'} {ts.trend}</Badge>
                            <Badge variant="outline" className="text-[10px]">{ts.momentum === 'STRONG' ? <Flame className="w-2.5 h-2.5 mr-0.5 text-orange-500" /> : <Snowflake className="w-2.5 h-2.5 mr-0.5 text-blue-400" />}{ts.momentum}</Badge>
                            {ts.candlePattern && <Badge className="text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/30">🕯 {ts.candlePattern}</Badge>}
                          </div>
                          <Progress value={ts.confidence} className={`h-1.5 mt-1.5 w-40 ${ts.direction === 'LONG' ? '[&>div]:bg-emerald-500' : '[&>div]:bg-red-500'}`} />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Button variant="outline" size="sm" onClick={copyTrade} className="gap-1.5 h-7 text-xs">
                          {copied ? <><Check className="w-3 h-3" /> Скопировано!</> : <><Copy className="w-3 h-3" /> Скопировать</>}
                        </Button>
                        <span className="text-[9px] text-muted-foreground">{(selectedCoinData?.symbol || selectedCoin).toUpperCase()}/USDT</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Price Levels */}
                  <div className="px-4 py-3 border-t border-border/50">
                    {/* Entry type banner */}
                    {ts.entryType === 'LIMIT' && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                        <Target className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] text-blue-500 font-semibold">ЛИМИТНЫЙ ОРДЕР</span>
                        <span className="text-[10px] text-muted-foreground">— ждите отката до уровня входа</span>
                        {ts.entryReason && <span className="text-[10px] text-muted-foreground ml-auto">{ts.entryReason}</span>}
                      </div>
                    )}
                    {ts.entryType === 'MARKET' && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                        <Zap className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] text-emerald-500 font-semibold">РЫНОЧНЫЙ ОРДЕР</span>
                        <span className="text-[10px] text-muted-foreground">— цена уже у уровня входа</span>
                      </div>
                    )}
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2 text-center">
                        <div className="text-muted-foreground text-[9px] font-semibold">ВХОД {ts.entryType === 'LIMIT' ? '(ЛИМИТ)' : '(РЫНОК)'}</div>
                        <div className="font-mono font-bold text-blue-500 text-sm">${formatPrice(ts.entry)}</div>
                        {ts.entryType === 'LIMIT' && ts.currentPrice !== ts.entry && (
                          <div className="text-[9px] text-blue-400">{pctChange(ts.currentPrice, ts.entry)} от текущей</div>
                        )}
                      </div>
                      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-center">
                        <div className="text-muted-foreground text-[9px] font-semibold">СТОП-ЛОСС</div>
                        <div className="font-mono font-bold text-red-500 text-sm">${formatPrice(ts.stopLoss)}</div>
                        <div className="text-[9px] text-red-400">{pctChange(ts.entry, ts.stopLoss)}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                        <div className="text-muted-foreground text-[9px] font-semibold">TP1 (30%)</div>
                        <div className="font-mono font-bold text-emerald-500 text-sm">${formatPrice(ts.takeProfit1)}</div>
                        <div className="text-[9px] text-emerald-400">{pctChange(ts.entry, ts.takeProfit1)}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                        <div className="text-muted-foreground text-[9px] font-semibold">TP2 (50%)</div>
                        <div className="font-mono font-bold text-emerald-600 text-sm">${formatPrice(ts.takeProfit2)}</div>
                        <div className="text-[9px] text-emerald-500">{pctChange(ts.entry, ts.takeProfit2)}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                        <div className="text-muted-foreground text-[9px] font-semibold">TP3 (20%)</div>
                        <div className="font-mono font-bold text-emerald-700 text-sm">${formatPrice(ts.takeProfit3)}</div>
                        <div className="text-[9px] text-emerald-600">{pctChange(ts.entry, ts.takeProfit3)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                      <span><Target className="w-3 h-3 text-muted-foreground inline mr-1" />R:R: <span className={`font-mono font-bold ${ts.riskReward >= 2 ? 'text-emerald-500' : 'text-yellow-500'}`}>{ts.riskReward.toFixed(2)}</span></span>
                      <span><Timer className="w-3 h-3 text-muted-foreground inline mr-1" />Удержание: <span className="font-semibold">{ts.holdDuration}</span></span>
                      <span><Shield className="w-3 h-3 text-muted-foreground inline mr-1" />Подд: <span className="text-emerald-500 font-mono">${formatPrice(ts.support)}</span></span>
                      <span><Shield className="w-3 h-3 text-muted-foreground inline mr-1" />Сопр: <span className="text-red-500 font-mono">${formatPrice(ts.resistance)}</span></span>
                      {ts.volumeSignal && <span><Volume2 className="w-3 h-3 text-muted-foreground inline mr-1" />{ts.volumeSignal}</span>}
                    </div>
                  </div>

                  {/* Bottom: Step-by-step trade plan */}
                  <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Пошаговый план сделки:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                          {getTradeSteps().map((step, i) => (
                            <div key={i} className="text-[11px] flex items-start gap-1.5">
                              <CheckCircle2 className={`w-3 h-3 mt-0.5 flex-shrink-0 ${i === 0 ? (ts.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500') : i === 1 ? 'text-red-500' : 'text-blue-500'}`} />
                              <span>{step.replace(/^\d+\.\s/, '')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="min-w-[160px] max-w-[200px] space-y-1.5">
                        {ts.reasons.length > 0 && <div><div className="text-[9px] text-emerald-500 font-semibold mb-0.5">Причины входа:</div>{ts.reasons.slice(0, 3).map((r, i) => <div key={i} className="flex items-start gap-1 text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 mt-0.5 flex-shrink-0" />{r}</div>)}</div>}
                        {ts.warnings.length > 0 && <div><div className="text-[9px] text-yellow-500 font-semibold mb-0.5">Риски:</div>{ts.warnings.slice(0, 2).map((w, i) => <div key={i} className="flex items-start gap-1 text-[10px]"><AlertCircle className="w-2.5 h-2.5 text-yellow-500 mt-0.5 flex-shrink-0" />{w}</div>)}</div>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {ts && ts.direction === 'FLAT' && (
              <Card className="border-2 border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Pause className="w-10 h-10 text-yellow-500" />
                    <div>
                      <div className="text-xl font-bold text-yellow-500">НЕТ СИГНАЛА — ЖДИТЕ</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Рынок в боковике. Дождитесь сигнала LONG или SHORT для входа.</div>
                      {ts.reasons[0] && <div className="text-xs text-muted-foreground mt-1">{ts.reasons[0]}</div>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Coin Info + MTF */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
              <Card><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden">{selectedCoinData?.image ? <img src={selectedCoinData.image} alt="" className="w-7 h-7" /> : <span className="text-sm font-bold">{(selectedCoinData?.symbol||'??').slice(0,2)}</span>}</div><div><h2 className="text-base font-bold">{selectedCoinData?.name||selectedCoin}</h2><span className="text-[10px] text-muted-foreground uppercase">{selectedCoinData?.symbol||selectedCoin}/USDT</span></div></div>
                <div className="flex items-baseline gap-2"><span className="text-xl font-bold font-mono">${formatPrice(displayPrice)}</span>{selectedCoinData && <span className={`text-xs font-semibold flex items-center gap-0.5 ${priceChange24h>=0?'text-emerald-500':'text-red-500'}`}>{priceChange24h>=0?<ChevronUp className="w-3 h-3"/>:<ChevronDown className="w-3 h-3"/>}{Math.abs(priceChange24h).toFixed(2)}%</span>}</div>
                <div className="flex gap-3 ml-auto text-[10px]">{selectedCoinData?.market_cap ? <div className="text-center"><div className="text-muted-foreground">Кап.</div><div className="font-mono font-semibold">{formatNumber(selectedCoinData.market_cap)}</div></div> : null}{ts && ts.atr > 0 && <div className="text-center"><div className="text-muted-foreground">ATR</div><div className="font-mono text-blue-500">${formatPrice(ts.atr)}</div></div>}{ts && <div className="text-center"><div className="text-muted-foreground">Подд</div><div className="font-mono text-emerald-500">${formatPrice(ts.support)}</div></div>}{ts && <div className="text-center"><div className="text-muted-foreground">Сопр</div><div className="font-mono text-red-500">${formatPrice(ts.resistance)}</div></div>}</div>
              </div></CardContent></Card>

              {ts && (
                <Card><CardHeader className="px-3 py-2"><CardTitle className="text-xs flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-blue-500" />Мульти-ТФ<Badge variant="outline" className="text-[8px] ml-1">{ts.multiTimeframe.alignment}%</Badge></CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <div className="grid grid-cols-4 gap-1">{(['m5', 'm15', 'h1', 'h4'] as const).map(tf => { const v = ts.multiTimeframe[tf]; return (
                    <div key={tf} className={`rounded-md border p-1.5 text-center ${v ? (v.direction === 'BULLISH' ? 'border-emerald-500/30 bg-emerald-500/5' : v.direction === 'BEARISH' ? 'border-red-500/30 bg-red-500/5' : 'border-border') : 'border-border opacity-40'}`}>
                      <div className="text-[9px] font-bold text-muted-foreground">{tf.toUpperCase()}</div>
                      {v ? <><div className={`text-xs font-bold ${v.direction === 'BULLISH' ? 'text-emerald-500' : v.direction === 'BEARISH' ? 'text-red-500' : 'text-yellow-500'}`}>{v.direction === 'BULLISH' ? '▲' : v.direction === 'BEARISH' ? '▼' : '→'}</div><div className="text-[8px] text-muted-foreground">{Math.abs(v.score)}</div></> : <div className="text-[9px] text-muted-foreground">—</div>}
                    </div>); })}</div>
                  <div className="mt-1.5 text-center"><Badge className={`text-[9px] ${ts.multiTimeframe.consensus.includes('LONG') ? 'bg-emerald-500' : ts.multiTimeframe.consensus.includes('SHORT') ? 'bg-red-500' : 'bg-yellow-500'} text-white`}>
                    {ts.multiTimeframe.consensus === 'STRONG_LONG' ? '⬆ СИЛЬНЫЙ ЛОНГ' : ts.multiTimeframe.consensus === 'LONG' ? '↑ ЛОНГ' : ts.multiTimeframe.consensus === 'STRONG_SHORT' ? '⬇ СИЛЬНЫЙ ШОРТ' : ts.multiTimeframe.consensus === 'SHORT' ? '↓ ШОРТ' : '→ НЕЙТРАЛЬНО'}
                  </Badge></div>
                </CardContent></Card>
              )}
            </div>

            {/* Chart Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-0.5 bg-card rounded-lg border border-border p-0.5">
                {[{v:'1m',l:'1М'},{v:'5m',l:'5М'},{v:'15m',l:'15М'},{v:'1h',l:'1Ч'},{v:'4h',l:'4Ч'}].map(tf => (
                  <button key={tf.v} onClick={() => setInterval_(tf.v)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${interval === tf.v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}>{tf.l}</button>
                ))}
              </div>
              <button onClick={() => setShowIndicators(!showIndicators)} className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${showIndicators ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}><LineChart className="w-3 h-3 inline mr-1"/>Индикаторы</button>
              <button onClick={() => { if (positionTool.enabled) { setPositionTool(p => ({ ...p, enabled: false })); } else { const entry = displayPrice || 0; const isLong = ts?.direction !== 'SHORT'; setPositionTool({ enabled: true, direction: isLong ? 'LONG' : 'SHORT', entryPrice: entry, targetPrice: ts?.takeProfit2 || entry * (isLong ? 1.05 : 0.95), stopLoss: ts?.stopLoss || entry * (isLong ? 0.97 : 1.03), amount: 100, leverage: 1 }); } }} className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${positionTool.enabled ? 'bg-blue-500 text-white border-blue-500' : 'border-border hover:bg-accent'}`}><Crosshair className="w-3 h-3 inline mr-1"/>Позиция</button>
              <button onClick={() => fetchAdvisor()} className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${advisorVisible ? 'bg-purple-500 text-white border-purple-500' : 'border-border hover:bg-accent'}`}><Brain className="w-3 h-3 inline mr-1"/>AI Советчик</button>
            </div>

            {/* Chart */}
            <Card><CardContent className="p-2 sm:p-3">
              {chartLoading ? <div className="h-[480px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /><span className="ml-3 text-sm text-muted-foreground">Загрузка...</span></div>
              : chartData.length > 0 ? <CandlestickChartComponent data={chartData} overlayIndicators={showIndicators} positionTool={positionTool.enabled ? positionTool : null} tradeSignal={ts} />
              : <div className="h-[480px] flex items-center justify-center text-muted-foreground"><div className="text-center"><BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Выберите монету</p></div></div>}
            </CardContent></Card>

            {/* Position Tool Panel */}
            {positionTool.enabled && (
              <Card className={`border-2 ${positionTool.direction === 'LONG' ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
                <CardHeader className="px-3 py-2"><CardTitle className="text-xs flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5 text-blue-500" />Калькулятор позиции<Button variant="ghost" size="sm" className="ml-auto h-5 w-5 p-0" onClick={() => setPositionTool(p => ({ ...p, enabled: false }))}><X className="w-3 h-3" /></Button></CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 pt-0 space-y-3">
                  <div className="flex gap-1"><button onClick={() => setPositionTool(p => ({ ...p, direction: 'LONG' }))} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${positionTool.direction === 'LONG' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'}`}>▲ LONG</button><button onClick={() => setPositionTool(p => ({ ...p, direction: 'SHORT' }))} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${positionTool.direction === 'SHORT' ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500 border border-red-500/30'}`}>▼ SHORT</button></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className="text-[9px] text-muted-foreground block mb-0.5">Вход</label><Input type="number" value={positionTool.entryPrice || ''} onChange={e => setPositionTool(p => ({ ...p, entryPrice: Number(e.target.value) || 0 }))} className="h-7 text-[11px] font-mono" step={displayPrice >= 1 ? 0.01 : 0.0000001} /></div>
                    <div><label className="text-[9px] text-muted-foreground block mb-0.5">Цель</label><Input type="number" value={positionTool.targetPrice || ''} onChange={e => setPositionTool(p => ({ ...p, targetPrice: Number(e.target.value) || 0 }))} className="h-7 text-[11px] font-mono" step={displayPrice >= 1 ? 0.01 : 0.0000001} /></div>
                    <div><label className="text-[9px] text-muted-foreground block mb-0.5">Стоп</label><Input type="number" value={positionTool.stopLoss || ''} onChange={e => setPositionTool(p => ({ ...p, stopLoss: Number(e.target.value) || 0 }))} className="h-7 text-[11px] font-mono" step={displayPrice >= 1 ? 0.01 : 0.0000001} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[9px] text-muted-foreground block mb-0.5">Сумма: ${positionTool.amount}</label><Slider value={[positionTool.amount]} onValueChange={v => setPositionTool(p => ({ ...p, amount: v[0] }))} min={1} max={10000} step={1} /><div className="flex gap-1 mt-1">{[10, 50, 100, 500, 1000].map(a => <button key={a} onClick={() => setPositionTool(p => ({ ...p, amount: a }))} className={`px-1.5 py-0.5 text-[8px] rounded ${positionTool.amount === a ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}>${a}</button>)}</div></div>
                    <div><label className="text-[9px] text-muted-foreground block mb-0.5">Плечо: {positionTool.leverage}x</label><Slider value={[positionTool.leverage]} onValueChange={v => setPositionTool(p => ({ ...p, leverage: v[0] }))} min={1} max={10} step={1} /><div className="flex gap-1 mt-1">{[1, 2, 3, 5, 10].map(l => <button key={l} onClick={() => setPositionTool(p => ({ ...p, leverage: l }))} className={`px-1.5 py-0.5 text-[8px] rounded ${positionTool.leverage === l ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}>{l}x</button>)}</div></div>
                  </div>
                  {positionTool.entryPrice > 0 && (() => { const tp = (positionTool.direction === 'LONG' ? ((positionTool.targetPrice - positionTool.entryPrice) / positionTool.entryPrice) : ((positionTool.entryPrice - positionTool.targetPrice) / positionTool.entryPrice)) * positionTool.amount * positionTool.leverage; const sp = (positionTool.direction === 'LONG' ? ((positionTool.stopLoss - positionTool.entryPrice) / positionTool.entryPrice) : ((positionTool.entryPrice - positionTool.stopLoss) / positionTool.entryPrice)) * positionTool.amount * positionTool.leverage; const r = sp !== 0 ? Math.abs(tp / sp) : 0; const liq = positionTool.leverage > 1 ? (positionTool.direction === 'LONG' ? positionTool.entryPrice * (1 - 1 / positionTool.leverage) : positionTool.entryPrice * (1 + 1 / positionTool.leverage)) : 0; return (
                    <div className="rounded-lg border border-border p-2 space-y-1.5">
                      <div className="flex justify-between items-center text-xs"><span className="text-muted-foreground">Профит:</span><span className={`font-mono font-bold ${tp >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{tp >= 0 ? '+' : ''}{formatPrice(tp)}$</span></div>
                      <div className="flex justify-between items-center text-xs"><span className="text-muted-foreground">Стоп:</span><span className="font-mono font-bold text-red-500">{formatPrice(sp)}$</span></div>
                      <Separator />
                      <div className="flex justify-between items-center text-xs"><span className="text-muted-foreground">R:R:</span><span className={`font-mono font-bold ${r >= 2 ? 'text-emerald-500' : 'text-yellow-500'}`}>1 : {r.toFixed(2)}</span></div>
                      {positionTool.leverage > 1 && <div className="flex justify-between items-center text-xs"><span className="text-muted-foreground">Ликвидация:</span><span className="font-mono text-red-400">${formatPrice(liq)}</span></div>}
                      <div className="flex justify-between items-center text-xs"><span className="text-muted-foreground">Итого:</span><span className={`font-mono font-bold ${tp >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${formatPrice(positionTool.amount + tp)}</span></div>
                    </div>); })()}
                </CardContent>
              </Card>
            )}

            {/* RSI & MACD */}
            {chartData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card><CardHeader className="px-3 py-1.5"><CardTitle className="text-xs flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-purple-500" />RSI (14){(() => { const lr = chartData.filter(d => d.rsi != null).slice(-1)[0]?.rsi; return lr != null ? <span className={`ml-auto font-mono text-sm ${lr < 30 ? 'text-emerald-500' : lr > 70 ? 'text-red-500' : 'text-muted-foreground'}`}>{lr.toFixed(1)}</span> : null; })()}</CardTitle></CardHeader><CardContent className="p-2 pt-0"><MiniLineChart data={chartData.map(d => d.rsi).filter(v => v != null) as number[]} color="#8b5cf6" yMin={0} yMax={100} refLines={[30, 70]} /></CardContent></Card>
                <Card><CardHeader className="px-3 py-1.5"><CardTitle className="text-xs flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-orange-500" />MACD</CardTitle></CardHeader><CardContent className="p-2 pt-0"><MiniMACDChart data={chartData} /></CardContent></Card>
              </div>
            )}

            {/* AI Advisor Panel — Compact */}
            {advisorVisible && (
              <Card className="border border-purple-500/30">
                <CardHeader className="px-3 py-2 flex flex-row items-center gap-2 space-y-0">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-semibold">AI Советчик</span>
                  <Badge variant="outline" className="text-[8px] text-purple-500 border-purple-500/30">
                    {(selectedCoinData?.symbol || selectedCoin).toUpperCase()}
                  </Badge>
                  {ts && ts.direction !== 'FLAT' && (
                    <Badge className={`text-[8px] ${ts.direction === 'LONG' ? 'bg-emerald-500' : 'bg-red-500'} text-white`}>
                      {ts.direction === 'LONG' ? '▲' : '▼'} {ts.confidence}%
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {!advisorLoading && advisorAnalysis && (
                      <Button variant="ghost" size="sm" onClick={() => fetchAdvisor()} className="h-5 w-5 p-0">
                        <RefreshCw className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => { setAdvisorVisible(false); setAdvisorAnalysis(null); }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {advisorLoading ? (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                      <span className="text-xs text-muted-foreground">AI анализирует...</span>
                    </div>
                  ) : advisorAnalysis ? (
                    <div className="space-y-1.5">
                      {advisorAnalysis.split('\n').map((line, i) => {
                        if (line.trim() === '') return null;
                        // Bold header line like **Суть:**
                        if (line.startsWith('**ИТОГ') || line.startsWith('**Итог')) {
                          const clean = line.replace(/\*\*/g, '');
                          return (
                            <div key={i} className="mt-2 rounded-md bg-purple-500/10 border border-purple-500/30 px-3 py-2">
                              <span className="text-xs font-bold text-purple-500">{clean}</span>
                            </div>
                          );
                        }
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <div key={i} className="text-xs font-bold text-foreground mt-1">{line.replace(/\*\*/g, '')}</div>;
                        }
                        if (line.startsWith('**')) {
                          const parts = line.split('**');
                          return <div key={i} className="text-xs text-muted-foreground">
                            {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-foreground">{part}</strong> : part)}
                          </div>;
                        }
                        return <div key={i} className="text-xs text-muted-foreground">{line}</div>;
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-3 text-muted-foreground text-[10px]">
                      Нажмите «AI Советчик» для краткого анализа
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Indicators */}
            {signal && signal.indicators.length > 0 && (
              <Card><CardHeader className="px-3 py-2"><CardTitle className="text-xs flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-blue-500" />Индикаторы</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3 pt-0"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">{signal.indicators.map((ind, i) => (
                <div key={i} className={`rounded-lg border p-2.5 ${ind.signal==='BUY'?'border-emerald-500/30 bg-emerald-500/5':ind.signal==='SELL'?'border-red-500/30 bg-red-500/5':'border-border'}`}>
                  <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold">{ind.name}</span><Badge variant="outline" className={`text-[9px] ${ind.signal==='BUY'?'text-emerald-500 border-emerald-500/30':ind.signal==='SELL'?'text-red-500 border-red-500/30':'text-yellow-500 border-yellow-500/30'}`}>{ind.signal==='BUY'?'ПОКУПКА':ind.signal==='SELL'?'ПРОДАЖА':'НЕЙТР.'}</Badge></div>
                  <div className="text-[10px] font-mono text-muted-foreground">{ind.value}</div><div className="text-[10px] text-muted-foreground mt-0.5">{ind.description}</div>
                </div>))}</div></CardContent></Card>
            )}

            {/* Top Movers */}
            {coins.length > 0 && (
              <Card><CardHeader className="px-3 py-2"><CardTitle className="text-xs flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-cyan-500" />Топ движения 24ч</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3 pt-0"><div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">{coins.filter(c=>c.price_change_percentage_24h!=null).sort((a,b)=>Math.abs(b.price_change_percentage_24h)-Math.abs(a.price_change_percentage_24h)).slice(0,16).map(coin=>(
                <button key={coin.id} onClick={()=>setSelectedCoin(coin.id)} className={`rounded-lg border p-2 text-left transition-all hover:shadow-sm ${selectedCoin===coin.id?'border-primary ring-1 ring-primary':'border-border'}`}>
                  <div className="flex items-center gap-1 mb-0.5"><div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center overflow-hidden">{coin.image?<img src={coin.image} alt="" className="w-3 h-3"/>:<span className="text-[6px] font-bold">{coin.symbol.slice(0,2)}</span>}</div><span className="text-[10px] font-semibold truncate">{coin.symbol}</span></div>
                  <div className="text-[10px] font-mono">${formatPrice(coin.current_price)}</div>
                  <div className={`text-[10px] font-semibold flex items-center gap-0.5 ${(coin.price_change_percentage_24h||0)>=0?'text-emerald-500':'text-red-500'}`}>{(coin.price_change_percentage_24h||0)>=0?<TrendingUp className="w-2.5 h-2.5"/>:<TrendingDown className="w-2.5 h-2.5"/>}{Math.abs(coin.price_change_percentage_24h||0).toFixed(2)}%</div>
                </button>))}</div></CardContent></Card>
            )}

            <div className="text-center text-[9px] text-muted-foreground/50 py-1"><AlertTriangle className="w-2.5 h-2.5 inline mr-0.5"/>Не финансовая рекомендация. Торговля связана с риском.</div>
          </div>
        </div>
      </main>

      {/* ====== TRADER JOURNAL MODAL ====== */}
      {showReputationPanel && reputation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowReputationPanel(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-card border-2 border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header — flex-shrink-0 to prevent compression */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <span className="text-2xl">{reputation.levelEmoji}</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                      Журнал трейдера
                      <Badge className="bg-purple-500 text-white text-[9px]">{reputation.level}</Badge>
                    </h2>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                      <span className="text-muted-foreground">Капитал:</span>
                      <span className="font-mono font-bold text-foreground">${(reputation.freeBalance + (reputation.lockedInPositions || 0)).toFixed(2)}</span>
                      <span className={`font-mono font-bold ${reputation.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {reputation.totalPnl >= 0 ? '+' : ''}{reputation.totalPnl.toFixed(2)} USDT
                      </span>
                      <span className={`text-[9px] ${reputation.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        ({reputation.totalPnl >= 0 ? '+' : ''}{(((reputation.freeBalance + (reputation.lockedInPositions || 0)) / reputation.initialDeposit - 1) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowReputationPanel(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 mt-3">
                <div className="rounded-lg border border-border bg-card p-2 text-center">
                  <div className="text-[8px] text-muted-foreground uppercase">Капитал</div>
                  <div className={`text-xs font-mono font-bold ${(reputation.freeBalance + (reputation.lockedInPositions || 0)) >= reputation.initialDeposit ? 'text-emerald-500' : 'text-red-500'}`}>
                    ${(reputation.freeBalance + (reputation.lockedInPositions || 0)).toFixed(2)}
                  </div>
                </div>
                <div className={`rounded-lg border p-2 text-center ${reputation.freeBalance > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                  <div className={`text-[8px] uppercase ${reputation.freeBalance > 0 ? 'text-emerald-500' : 'text-red-500'}`}>Свободно</div>
                  <div className={`text-xs font-mono font-bold ${reputation.freeBalance > 0 ? 'text-emerald-500' : 'text-red-500'}`}>${(reputation.freeBalance || 0).toFixed(2)}</div>
                </div>
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2 text-center">
                  <div className="text-[8px] text-blue-500 uppercase">В сделках</div>
                  <div className="text-xs font-mono font-bold text-blue-500">${(reputation.lockedInPositions || 0).toFixed(2)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2 text-center">
                  <div className="text-[8px] text-muted-foreground uppercase">Депозит</div>
                  <div className="text-xs font-mono font-bold">${reputation.initialDeposit}</div>
                </div>
              </div>

              {/* Second stats row */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                  <div className="text-[8px] text-emerald-500 uppercase">Прибыль</div>
                  <div className="text-xs font-mono font-bold text-emerald-500">{reputation.wins}</div>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-center">
                  <div className="text-[8px] text-red-500 uppercase">Убыток</div>
                  <div className="text-xs font-mono font-bold text-red-500">{reputation.losses}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2 text-center">
                  <div className="text-[8px] text-muted-foreground uppercase">Винрейт</div>
                  <div className={`text-xs font-mono font-bold ${reputation.winRate >= 50 ? 'text-emerald-500' : 'text-red-500'}`}>{reputation.winRate}%</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2 text-center">
                  <div className="text-[8px] text-muted-foreground uppercase">Очки</div>
                  <div className={`text-xs font-mono font-bold ${reputation.score >= 0 ? 'text-purple-500' : 'text-red-500'}`}>{reputation.score}</div>
                </div>
              </div>

              {/* Debt / Credit row */}
              {(reputation.totalDebt > 0 || reputation.totalRepaid > 0) && (
                <div className="flex items-center gap-2 mt-2">
                  {reputation.totalDebt > 0 && (
                    <div className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                      <div className="text-[8px] text-amber-500 uppercase">Долг</div>
                      <div className="text-xs font-mono font-bold text-amber-500">${reputation.totalDebt.toFixed(2)}</div>
                    </div>
                  )}
                  {reputation.totalRepaid > 0 && (
                    <div className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                      <div className="text-[8px] text-emerald-500 uppercase">Возвращено</div>
                      <div className="text-xs font-mono font-bold text-emerald-500">${reputation.totalRepaid.toFixed(2)}</div>
                    </div>
                  )}
                  <div className="flex-1 rounded-lg border border-border bg-card p-2 text-center">
                    <div className="text-[8px] text-muted-foreground uppercase">Собственные</div>
                    <div className={`text-xs font-mono font-bold ${((reputation.freeBalance + (reputation.lockedInPositions || 0)) - reputation.totalDebt) >= reputation.initialDeposit ? 'text-emerald-500' : 'text-red-500'}`}>
                      ${((reputation.freeBalance + (reputation.lockedInPositions || 0)) - reputation.totalDebt).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* Deposit funds + Scan button */}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder="Сумма USDT"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="h-7 text-[11px] font-mono"
                    min={1}
                    step={1}
                  />
                  <Button
                    size="sm"
                    onClick={depositFunds}
                    disabled={depositLoading || !depositAmount}
                    className="h-7 text-[10px] gap-1 bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    <DollarSign className="w-3 h-3" />
                    {depositLoading ? '...' : 'Дать в кредит'}
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={scanAndTrade}
                  disabled={scanLoading}
                  className="h-7 text-[10px] gap-1 bg-purple-500 hover:bg-purple-600 text-white"
                >
                  <Cpu className="w-3 h-3" />
                  {scanLoading ? 'Скан...' : 'Скан монет'}
                </Button>
              </div>
              {depositAmount && parseFloat(depositAmount) > 0 && (
                <div className="text-[9px] text-amber-500/80 mt-1">
                  Средства будут добавлены как кредит — трейдер должен будет их вернуть из прибыли
                </div>
              )}
            </div>

            {/* Content — scrollable, takes remaining space */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Deposit chart */}
              {reputation.depositHistory && reputation.depositHistory.length > 1 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Динамика депозита</div>
                  <DepositChart data={reputation.depositHistory} initialDeposit={reputation.initialDeposit} totalDebt={reputation.totalDebt} />
                </div>
              )}

              {/* Adaptive learning — Current rules */}
              {reputation.adaptive && (reputation.adaptive.lessons.length > 0 || reputation.adaptive.avoidCoins.length > 0) && (
                <div>
                  <div className="text-[10px] font-bold text-amber-500 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Brain className="w-3 h-3" />
                    Обучение на ошибках
                    <span className="text-[8px] text-muted-foreground font-normal">({reputation.adaptive.lessons.length} уроков)</span>
                  </div>
                  {/* Active adaptive rules */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                      <div className="text-[8px] text-amber-500 uppercase">Мин. SL</div>
                      <div className="text-xs font-mono font-bold text-amber-500">{reputation.adaptive.minSlDistancePct.toFixed(1)}%</div>
                    </div>
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                      <div className="text-[8px] text-amber-500 uppercase">Мин. увер.</div>
                      <div className="text-xs font-mono font-bold text-amber-500">{reputation.adaptive.minConfidence}%</div>
                    </div>
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                      <div className="text-[8px] text-amber-500 uppercase">Мин. R:R</div>
                      <div className="text-xs font-mono font-bold text-amber-500">{reputation.adaptive.minRr.toFixed(1)}</div>
                    </div>
                  </div>
                  {/* Avoided coins */}
                  {reputation.adaptive.avoidCoins.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="text-[9px] text-red-400">Избегать:</span>
                      {reputation.adaptive.avoidCoins.map(c => (
                        <span key={c} className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">{c}</span>
                      ))}
                    </div>
                  )}
                  {/* Recent lessons */}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {reputation.adaptive.lessons.slice(-8).reverse().map((lesson, i) => (
                      <div key={`${lesson.type}-${lesson.timestamp}-${i}`} className={`rounded-lg border p-2 text-[10px] ${
                        lesson.severity === 'high' ? 'border-red-500/30 bg-red-500/5' :
                        lesson.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' :
                        'border-zinc-500/20 bg-zinc-500/5'
                      }`}>
                        <div className="flex items-start gap-1.5">
                          <span className={`mt-0.5 flex-shrink-0 ${
                            lesson.severity === 'high' ? 'text-red-500' :
                            lesson.severity === 'medium' ? 'text-amber-500' : 'text-zinc-400'
                          }`}>
                            {lesson.severity === 'high' ? '🔴' : lesson.severity === 'medium' ? '🟡' : '⚪'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-foreground leading-tight">{lesson.description}</div>
                            <div className="text-muted-foreground text-[8px] mt-0.5">
                              {new Date(lesson.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trade filter + list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Сделки ({reputation.trades.length})
                  </div>
                </div>
                <TradeFilter trades={reputation.trades} onTradeClick={(trade) => { setSelectedTrade(trade); }} onDeleteTrade={deleteTrade} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== TRADER THINKING PANEL ====== */}
      {showThinkingPanel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowThinkingPanel(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-card border-2 border-amber-500/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-gradient-to-r from-amber-500/10 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                      Мышление трейдера
                      <Badge className="bg-amber-500 text-white text-[9px]">LIVE</Badge>
                    </h2>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                      <span className="text-amber-500 font-semibold">{traderThinking?.currentMood || 'Анализ рынка'}</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">Рынок: <span className={traderThinking?.marketView === 'Бычий' ? 'text-emerald-500' : traderThinking?.marketView === 'Медвежий' ? 'text-red-500' : 'text-yellow-500'}>{traderThinking?.marketView || 'Нейтральный'}</span></span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">Позиции: <span className="text-foreground font-mono">{traderThinking?.openPositionsCount || 0}/5</span></span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">Свободно: <span className="font-mono text-foreground">${(traderThinking?.freeBalance || 0).toFixed(2)}</span></span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {traderThinking?.lastScanAt && (
                    <span className="text-[9px] text-muted-foreground">
                      Последний скан: {new Date(traderThinking.lastScanAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowThinkingPanel(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {/* Strategy & quick stats */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                  <div className="text-[8px] text-amber-500 uppercase">Стратегия</div>
                  <div className="text-[10px] font-bold text-foreground">{traderThinking?.activeStrategy || 'Внутридневная'}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2 text-center">
                  <div className="text-[8px] text-muted-foreground uppercase">Эквити</div>
                  <div className="text-xs font-mono font-bold text-foreground">${(traderThinking?.totalEquity || 0).toFixed(2)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2 text-center">
                  <div className="text-[8px] text-muted-foreground uppercase">Мыслей</div>
                  <div className="text-xs font-mono font-bold text-amber-500">{traderThinking?.thoughts?.length || 0}</div>
                </div>
              </div>
            </div>

            {/* Thoughts feed */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {!traderThinking?.thoughts || traderThinking.thoughts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <div className="text-sm">Трейдер ещё не начал думать</div>
                  <div className="text-[10px] mt-1">Запустите скан или дождитесь автоматического цикла</div>
                </div>
              ) : (
                traderThinking.thoughts.map((thought: any, i: number) => {
                  const emotionColors: Record<string, string> = {
                    confident: 'border-emerald-500/40 bg-emerald-500/5',
                    cautious: 'border-yellow-500/30 bg-yellow-500/5',
                    worried: 'border-red-500/30 bg-red-500/5',
                    frustrated: 'border-red-500/40 bg-red-500/10',
                    satisfied: 'border-emerald-500/30 bg-emerald-500/5',
                    analytical: 'border-blue-500/30 bg-blue-500/5',
                    neutral: 'border-border bg-card',
                  };
                  const emotionIcons: Record<string, string> = {
                    confident: '💪', cautious: '⚡', worried: '😰',
                    frustrated: '😤', satisfied: '✅', analytical: '🔍', neutral: '📌',
                  };
                  const typeLabels: Record<string, string> = {
                    scan: 'СКАН', decision: 'РЕШЕНИЕ', close: 'ЗАКРЫТИЕ',
                    adjustment: 'КОРРЕКТИРОВКА', lesson: 'УРОК', observation: 'НАБЛЮДЕНИЕ',
                  };
                  const typeColors: Record<string, string> = {
                    scan: 'text-blue-400', decision: 'text-amber-400', close: 'text-purple-400',
                    adjustment: 'text-orange-400', lesson: 'text-red-400', observation: 'text-zinc-400',
                  };

                  return (
                    <div key={thought.id || i} className={`rounded-xl border p-3 ${emotionColors[thought.emotion] || emotionColors.neutral}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-base flex-shrink-0 mt-0.5">{emotionIcons[thought.emotion] || '📌'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[8px] font-bold uppercase ${typeColors[thought.type] || 'text-zinc-400'}`}>
                              {typeLabels[thought.type] || thought.type}
                            </span>
                            {thought.coinSymbol && (
                              <Badge variant="outline" className="text-[8px] h-4 px-1">
                                {thought.coinSymbol} {thought.direction || ''}
                              </Badge>
                            )}
                            {thought.entryType && (
                              <Badge variant="outline" className={`text-[8px] h-4 px-1 ${thought.entryType === 'MARKET' ? 'border-emerald-500/30 text-emerald-500' : 'border-blue-500/30 text-blue-400'}`}>
                                {thought.entryType === 'MARKET' ? 'РЫНОК' : 'ЛИМИТ'}
                              </Badge>
                            )}
                            {thought.confidence !== undefined && (
                              <span className="text-[8px] text-muted-foreground">conf: {thought.confidence}%</span>
                            )}
                            <span className="text-[8px] text-muted-foreground ml-auto">
                              {new Date(thought.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <div className="text-[11px] font-semibold text-foreground leading-tight">{thought.title}</div>
                          <div className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{thought.detail}</div>
                          {thought.tags && thought.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {thought.tags.map((tag: string, j: number) => (
                                <span key={j} className="text-[7px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== TRADE TERMINAL MODAL ====== */}
      {selectedTrade && (
        <TradeTerminalModal
          trade={selectedTrade}
          coins={coins}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  );
}
