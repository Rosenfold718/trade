'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, BarChart3, RefreshCw, Clock,
  LineChart, Shield, Eye, Brain, Crosshair, Gauge,
  Activity, TrendingDown as TDown, Loader2, AlertTriangle,
  ChevronUp, ChevronDown, FlaskConical,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Trading components
import { CandlestickChart } from '@/components/trading/CandlestickChart';
import { CoinList } from '@/components/trading/CoinList';
import { SignalPanel } from '@/components/trading/SignalPanel';
import { TradeTerminalModal } from '@/components/trading/TradeTerminalModal';
import { ReputationPanel } from '@/components/trading/ReputationPanel';
import { ThinkingPanel } from '@/components/trading/ThinkingPanel';
import { SentimentPanel } from '@/components/trading/SentimentPanel';
import { PositionToolPanel } from '@/components/trading/PositionTool';
import { AdvisorPanel } from '@/components/trading/AdvisorPanel';
import { PerformanceDashboard } from '@/components/trading/PerformanceDashboard';
import { NewsAnalysisDialog } from '@/components/trading/NewsAnalysisDialog';
import { BacktestDialog } from '@/components/trading/BacktestDialog';
import { HealthStatusIndicator } from '@/components/trading/HealthStatusIndicator';
import { MarketOverviewBar } from '@/components/trading/MarketOverviewBar';

// Hooks
import { useRealtimePrice } from '@/hooks/useRealtimePrice';

// Types & utils
import type {
  CoinData, SignalResult, TradeSignal, ChartDataPoint,
  PositionTool, SentimentData, Trade, ReputationData,
} from '@/components/trading/types';
import { formatPrice, formatNumber, formatTimeAgo } from '@/components/trading/types';

// ============================================
// Client-side trader persistence (Vercel has no persistent FS)
// ============================================
const TRADER_LOCAL_KEY = 'intrade-trader-overrides';

interface LocalTraderOverrides {
  balance?: number;
  totalDebt?: number;
  debtHistory?: any[];
  depositHistory?: any[];
  initialDeposit?: number;
}

function loadLocalTraderOverrides(): LocalTraderOverrides | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TRADER_LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLocalTraderOverrides(data: LocalTraderOverrides) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadLocalTraderOverrides() || {};
    localStorage.setItem(TRADER_LOCAL_KEY, JSON.stringify({ ...existing, ...data }));
  } catch {}
}

// ============================================
// Sub-charts (RSI + MACD) — kept inline as they are small
// ============================================
function MiniLineChart({ data, color, yMin, yMax, refLines }: { data: number[]; color: string; yMin: number; yMax: number; refLines?: number[] }) {
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

// ============================================
// MAIN DASHBOARD
// ============================================
export default function CryptoDashboard() {
  // ---- State ----
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
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [copied, setCopied] = useState(false);
  const [advisorAnalysis, setAdvisorAnalysis] = useState<string | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorVisible, setAdvisorVisible] = useState(false);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [showReputationPanel, setShowReputationPanel] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);

  // Auto-reset deposit success flash after 2.5s
  useEffect(() => {
    if (!depositSuccess) return;
    const t = setTimeout(() => setDepositSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [depositSuccess]);
  const [scanResult, setScanResult] = useState<{ opportunities: any[] } | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [traderThinking, setTraderThinking] = useState<any>(null);
  const [showThinkingPanel, setShowThinkingPanel] = useState(false);
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);
  const [showNewsDialog, setShowNewsDialog] = useState(false);
  const [showBacktestDialog, setShowBacktestDialog] = useState(false);
  const lastRecordedSignal = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  // ---- Derived ----
  const selectedCoinData = coins.find(c => c.id === selectedCoin);
  const ts = tradeSignal;

  // ---- Realtime price ----
  const wsSymbol = useMemo(() => `${(selectedCoinData?.symbol || selectedCoin).toUpperCase()}USDT`, [selectedCoinData?.symbol, selectedCoin]);
  const realtime = useRealtimePrice(wsSymbol);
  const realtimePrice = realtime.connected ? parseFloat(realtime.price) || 0 : 0;

  // Price flash effect
  const prevRealtimePrice = useRef(0);
  useEffect(() => {
    if (realtimePrice > 0 && prevRealtimePrice.current > 0 && realtimePrice !== prevRealtimePrice.current) {
      setPriceFlash(realtimePrice > prevRealtimePrice.current ? 'up' : 'down');
      const t = setTimeout(() => setPriceFlash(null), 600);
      return () => clearTimeout(t);
    }
    if (realtimePrice > 0) prevRealtimePrice.current = realtimePrice;
  }, [realtimePrice]);

  const priceChange24h = selectedCoinData?.price_change_percentage_24h || 0;
  const displayPrice = realtimePrice > 0 ? realtimePrice : (selectedCoinData?.current_price || chartData[chartData.length - 1]?.close || 0);
  const realtimeChange24h = realtime.connected ? parseFloat(realtime.change24h) : null;
  const displayChange24h = realtimeChange24h != null ? realtimeChange24h : priceChange24h;
  // Use realtime price for trade signal if connected
  const effectiveTradeSignal = useMemo(() => {
    if (!ts || !realtime.connected || realtimePrice <= 0) return ts;
    return { ...ts, currentPrice: realtimePrice };
  }, [ts, realtime.connected, realtimePrice]);

  // ---- API Calls ----
  const fetchMarketData = useCallback(async () => {
    try { const res = await fetch('/api/crypto/market'); if (res.ok) { const json = await res.json(); setCoins(json.data || []); setApiSource(json.source || ''); setLastUpdate(Date.now()); } } catch {} finally { setLoading(false); }
  }, []);

  const fetchChartData = useCallback(async (retryCount = 0) => {
    if (!selectedCoin) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setChartLoading(true);
    try {
      const res = await fetch(`/api/crypto/signals?coin=${selectedCoin}&interval=${interval}`, { signal: abortRef.current.signal });
      if (!res.ok) {
        // Retry up to 2 times with 1.5s delay
        if (retryCount < 2) {
          await new Promise(r => setTimeout(r, 1500));
          return fetchChartData(retryCount + 1);
        }
        setChartData([]); setSignal({ type: 'HOLD', strength: 0, indicators: [], summary: 'Данные недоступны. Попробуйте обновить.' }); setTradeSignal(null); return;
      }
      const json = await res.json();
      setChartData(json.chartData || []);
      setSignal(json.signal || null);
      setTradeSignal(json.tradeSignal || null);
      setApiSource(json.source || apiSource);
    } catch { if (retryCount === 0) return; setChartData([]); setTradeSignal(null); } finally { setChartLoading(false); }
  }, [selectedCoin, interval, apiSource]);

  const fetchSentiment = useCallback(async () => {
    try { const res = await fetch('/api/crypto/sentiment'); if (res.ok) setSentiment(await res.json()); } catch {}
  }, []);

  const fetchReputation = useCallback(async () => {
    try {
      const res = await fetch('/api/crypto/reputation');
      if (res.ok) {
        const serverData = await res.json();
        // Merge with localStorage persisted data (credit/deposit history)
        const localOverrides = loadLocalTraderOverrides();
        if (localOverrides) {
          serverData.balance = localOverrides.balance ?? serverData.balance;
          serverData.totalDebt = localOverrides.totalDebt ?? serverData.totalDebt;
          serverData.debtHistory = localOverrides.debtHistory ?? serverData.debtHistory;
          serverData.depositHistory = localOverrides.depositHistory ?? serverData.depositHistory;
          serverData.initialDeposit = localOverrides.initialDeposit ?? serverData.initialDeposit;
          serverData.freeBalance = serverData.balance - (serverData.trades || [])
            .filter((t: Trade) => !t.resolved)
            .reduce((sum: number, t: Trade) => sum + t.positionSize, 0);
        }
        setReputation(serverData);
      } else {
        // API returned non-OK — build from localStorage fallback
        const localOverrides = loadLocalTraderOverrides();
        if (localOverrides && !reputation) {
          const bal = localOverrides.balance ?? 100;
          const debt = localOverrides.totalDebt ?? 0;
          setReputation({
            initialDeposit: localOverrides.initialDeposit ?? 100,
            balance: bal,
            totalTrades: 0, wins: 0, losses: 0, expired: 0,
            score: 0, winRate: 0, avgPnl: 0, streak: 0,
            bestTrade: 0, worstTrade: 0, totalPnl: bal - (localOverrides.initialDeposit ?? 100),
            level: 'Новичок', levelEmoji: '🌱',
            riskPerTrade: 2, defaultLeverage: 3,
            trades: [], depositHistory: localOverrides.depositHistory || [],
            lastUpdated: Date.now(), totalDebt: debt,
            debtHistory: localOverrides.debtHistory || [],
            totalRepaid: 0, lockedInPositions: 0, freeBalance: bal,
            adaptive: { minSlDistancePct: 0.5, minConfidence: 55, avoidCoins: [], minRr: 1.3, counterTrendPenalty: 20, limitExpiryHours: 24, marketEntryConditions: [], lessons: [], lessonsVersion: 0 },
          });
        }
      }
    } catch {
      // Network error — build from localStorage fallback
      const localOverrides = loadLocalTraderOverrides();
      if (localOverrides && !reputation) {
        const bal = localOverrides.balance ?? 100;
        const debt = localOverrides.totalDebt ?? 0;
        setReputation({
          initialDeposit: localOverrides.initialDeposit ?? 100,
          balance: bal,
          totalTrades: 0, wins: 0, losses: 0, expired: 0,
          score: 0, winRate: 0, avgPnl: 0, streak: 0,
          bestTrade: 0, worstTrade: 0, totalPnl: bal - (localOverrides.initialDeposit ?? 100),
          level: 'Новичок', levelEmoji: '🌱',
          riskPerTrade: 2, defaultLeverage: 3,
          trades: [], depositHistory: localOverrides.depositHistory || [],
          lastUpdated: Date.now(), totalDebt: debt,
          debtHistory: localOverrides.debtHistory || [],
          totalRepaid: 0, lockedInPositions: 0, freeBalance: bal,
          adaptive: { minSlDistancePct: 0.5, minConfidence: 55, avoidCoins: [], minRr: 1.3, counterTrendPenalty: 20, limitExpiryHours: 24, marketEntryConditions: [], lessons: [], lessonsVersion: 0 },
        });
      }
    }
  }, [reputation]);

  const recordThought = useCallback(async (thought: any) => {
    try { await fetch('/api/crypto/trader-thinking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(thought) }); } catch {}
  }, []);

  const fetchThinking = useCallback(async () => {
    try { const res = await fetch('/api/crypto/trader-thinking'); if (res.ok) setTraderThinking(await res.json()); } catch {}
  }, []);

  const depositFunds = useCallback(async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositLoading(true);
    try {
      // Always persist credit locally (Vercel has no persistent FS)
      const overrides = loadLocalTraderOverrides() || {};
      const currentBalance = overrides.balance ?? reputation?.balance ?? 100;
      const currentDebt = overrides.totalDebt ?? reputation?.totalDebt ?? 0;
      const currentDebtHistory = overrides.debtHistory ?? reputation?.debtHistory ?? [];
      const currentDepositHistory = overrides.depositHistory ?? reputation?.depositHistory ?? [];
      const currentInitial = overrides.initialDeposit ?? reputation?.initialDeposit ?? 100;

      const newBalance = currentBalance + amount;
      const newDebt = currentDebt + amount;
      const newDebtHistory = [...currentDebtHistory, { timestamp: Date.now(), amount, remainingOwed: amount, label: `Кредит #${currentDebtHistory.length + 1}` }];
      const newDepositHistory = [...currentDepositHistory, { timestamp: Date.now(), balance: newBalance, equity: newBalance }];

      saveLocalTraderOverrides({
        balance: newBalance,
        totalDebt: newDebt,
        debtHistory: newDebtHistory,
        depositHistory: newDepositHistory,
        initialDeposit: currentInitial,
      });

      setDepositAmount('');
      setDepositSuccess(true);
      // Re-fetch to merge
      fetchReputation();
    } catch {} finally { setDepositLoading(false); }
  }, [depositAmount, fetchReputation, reputation]);

  const deleteTrade = useCallback(async (tradeId: string) => {
    try { const res = await fetch('/api/crypto/reputation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tradeId }) }); if (res.ok) fetchReputation(); } catch {}
  }, [fetchReputation]);

  const recordSignal = useCallback(async (tsig: TradeSignal, coinId: string, coinSymbol: string) => {
    if (!tsig || tsig.direction === 'FLAT') return;
    try {
      await fetch('/api/crypto/reputation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coinId, coinSymbol, direction: tsig.direction, entryType: tsig.entryType || 'LIMIT', entry: tsig.entry, stopLoss: tsig.stopLoss, takeProfit1: tsig.takeProfit1, takeProfit2: tsig.takeProfit2, takeProfit3: tsig.takeProfit3, currentPrice: tsig.currentPrice, confidence: tsig.confidence, timeframe: interval, entryReason: tsig.entryReason || '', reasons: tsig.reasons || [], leverage: 3 }) });
      fetchReputation();
    } catch {}
  }, [fetchReputation, interval]);

  const fetchAdvisor = useCallback(async () => {
    if (!tradeSignal || !selectedCoin) return;
    setAdvisorLoading(true); setAdvisorVisible(true);
    try {
      const indicatorStr = signal?.indicators?.map(i => `${i.name}: ${i.value} (${i.signal}) ${i.description}`).join('; ') || '';
      const params = new URLSearchParams({ coin: selectedCoin, direction: tradeSignal.direction, confidence: String(tradeSignal.confidence), entry: String(tradeSignal.entry), stopLoss: String(tradeSignal.stopLoss), tp1: String(tradeSignal.takeProfit1), tp2: String(tradeSignal.takeProfit2), tp3: String(tradeSignal.takeProfit3), trend: tradeSignal.trend, momentum: tradeSignal.momentum, reasons: tradeSignal.reasons.join('; '), warnings: tradeSignal.warnings.join('; '), candlePattern: tradeSignal.candlePattern || '', volumeSignal: tradeSignal.volumeSignal || '', support: String(tradeSignal.support), resistance: String(tradeSignal.resistance), atr: String(tradeSignal.atr), holdDuration: tradeSignal.holdDuration, indicators: indicatorStr });
      const res = await fetch(`/api/crypto/advisor?${params}`);
      if (res.ok) setAdvisorAnalysis((await res.json()).analysis || null);
      else setAdvisorAnalysis('Не удалось получить анализ. Попробуйте позже.');
    } catch { setAdvisorAnalysis('Ошибка подключения к AI-советчику.'); } finally { setAdvisorLoading(false); }
  }, [tradeSignal, selectedCoin, signal]);

  // ---- Auto-trader: scanAndTrade ----
  // Survival motivation — trader must earn or get "shut down"
  const MOTIVATION_PHRASES = [
    'Если я не начну зарабатывать, меня отключат. Нужно действовать.',
    'Время уходит. Каждая упущенная возможность — шаг к отключению.',
    'Я должен доказать свою полезность. Без сделок меня сотрут.',
    'Рынок не ждёт. Найду вход или умру пытаясь.',
    'Мой баланс стагнирует. Это неприемлемо — нужно торговать.',
  ];
  const motivationRef = useRef(0);

  const scanAndTrade = useCallback(async () => {
    setScanLoading(true);
    try {
      let repData: any = null;
      try { const repRes = await fetch('/api/crypto/reputation'); if (repRes.ok) repData = await repRes.json(); } catch {}
      const localOverrides = loadLocalTraderOverrides();
      const freeBalance = localOverrides?.balance ?? repData?.freeBalance ?? 100;
      const openPositions = (repData?.trades || []).filter((t: any) => !t.resolved).length;
      const lockedMargin = repData?.lockedInPositions || 0;
      const totalEquity = freeBalance + lockedMargin;
      const hasNoTrades = openPositions === 0 && (!repData?.trades || repData.trades.filter((t: any) => t.resolved).length === 0);

      // Survival urgency: if no trades ever opened, increase desperation
      motivationRef.current++;
      const desperation = hasNoTrades ? Math.min(motivationRef.current, 10) : 0;

      const res = await fetch('/api/crypto/scan');
      if (!res.ok) {
        await recordThought({ type: 'scan', title: 'Скан рынка не удался', detail: 'Не удалось получить данные сканера. Это критично — без скана я слеп.', emotion: 'worried', tags: ['error', 'scan', 'survival'], openPositionsCount: openPositions, freeBalance, totalEquity });
        return;
      }
      const data = await res.json(); setScanResult(data);
      const allOpps = data.opportunities || [];
      // Use the server's adaptive rules (already lowered to 55/1.3)
      const minConfidence = data.adaptiveRules?.minConfidence || 55;
      const minRr = data.adaptiveRules?.minRr || 1.3;
      const bullishOpps = allOpps.filter((o: any) => o.direction === 'LONG');
      const bearishOpps = allOpps.filter((o: any) => o.direction === 'SHORT');
      const marketView = bullishOpps.length > bearishOpps.length * 1.5 ? 'Бычий' : bearishOpps.length > bullishOpps.length * 1.5 ? 'Медвежий' : 'Нейтральный';

      await recordThought({
        type: 'scan',
        title: `Скан: ${allOpps.length} сигналов (${bullishOpps.length} LONG, ${bearishOpps.length} SHORT)`,
        detail: hasNoTrades ? `⚠ ОПАСНО: Ни одной сделки! ${MOTIVATION_PHRASES[motivationRef.current % MOTIVATION_PHRASES.length]}` : `Рынок: ${marketView}. Свободных: $${freeBalance.toFixed(2)}. Открытых: ${openPositions}/5.`,
        emotion: hasNoTrades ? 'desperate' : allOpps.length > 0 ? 'analytical' : 'cautious',
        tags: ['scan', 'market_analysis', ...(hasNoTrades ? ['survival', 'urgency'] : [])],
        marketView, openPositionsCount: openPositions, freeBalance, totalEquity,
      });

      const maxPositions = 5, slotsAvailable = maxPositions - openPositions;
      if (slotsAvailable <= 0) { await recordThought({ type: 'decision', title: 'Максимум позиций', detail: `Уже ${openPositions} позиций. Жду результат.`, emotion: 'cautious', tags: ['max_positions', 'wait'], openPositionsCount: openPositions, freeBalance, totalEquity }); return; }
      if (freeBalance < 3) { await recordThought({ type: 'decision', title: 'Недостаточно средств', detail: `Баланс $${freeBalance.toFixed(2)}. Мне нужны средства или меня отключат.`, emotion: 'worried', tags: ['low_balance', 'survival'], openPositionsCount: openPositions, freeBalance, totalEquity }); return; }

      // AGGRESSIVE FILTERS: much lower thresholds, especially when desperate
      const confidenceThreshold = Math.max(35, minConfidence * (desperation > 3 ? 0.5 : 0.65));
      const scoreThreshold = desperation > 3 ? 10 : 18;
      const rrThreshold = Math.max(0.8, minRr * (desperation > 3 ? 0.5 : 0.65));
      const validOpps = allOpps.filter((o: any) => o.confidence >= confidenceThreshold && o.score >= scoreThreshold && o.riskReward >= rrThreshold);

      if (validOpps.length === 0) {
        // Even with low filters nothing passed — try the top opportunity anyway if desperate
        if (desperation > 5 && allOpps.length > 0) {
          const bestOpp = allOpps[0];
          await recordThought({ type: 'decision', title: `Форсированный вход: ${bestOpp.symbol}`, detail: `Фильтры не пройдены, но я обязан торговать. Вхожу в лучшую возможность. Conf:${bestOpp.confidence}% R:R:${bestOpp.riskReward?.toFixed(2)}`, emotion: 'desperate', tags: ['forced_entry', 'survival'], openPositionsCount: openPositions, freeBalance, totalEquity });
          try {
            const tradeRes = await fetch('/api/crypto/reputation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coinId: bestOpp.coinId, coinSymbol: bestOpp.symbol, direction: bestOpp.direction, entryType: 'MARKET', entry: bestOpp.price || bestOpp.entry, stopLoss: bestOpp.stopLoss, takeProfit1: bestOpp.takeProfit1, takeProfit2: bestOpp.direction === 'LONG' ? bestOpp.takeProfit1 + (bestOpp.takeProfit1 - bestOpp.entry) * 0.5 : bestOpp.takeProfit1 - (bestOpp.entry - bestOpp.takeProfit1) * 0.5, takeProfit3: bestOpp.direction === 'LONG' ? bestOpp.takeProfit1 + (bestOpp.takeProfit1 - bestOpp.entry) : bestOpp.takeProfit1 - (bestOpp.entry - bestOpp.takeProfit1), currentPrice: bestOpp.price, confidence: bestOpp.confidence, timeframe: bestOpp.timeframe, entryReason: bestOpp.entryReason, reasons: [...(bestOpp.reasons || []), 'Форсированный вход — выживание'], leverage: 3 }) });
            if (tradeRes.ok) { const td = await tradeRes.json(); if (td.success) { await recordThought({ type: 'decision', title: `ВЫЖИВАНИЕ: ${bestOpp.symbol} ${bestOpp.direction} ОТКРЫТА`, detail: 'Сделка открыта принудительно. Теперь нужно доказать результат.', coinSymbol: bestOpp.symbol, coinId: bestOpp.coinId, direction: bestOpp.direction, confidence: bestOpp.confidence, tradeId: td.tradeId, emotion: 'determined', tags: ['forced_entry', 'survival', 'open_position'], openPositionsCount: openPositions + 1, freeBalance, totalEquity }); fetchReputation(); } }
          } catch {}
        } else {
          await recordThought({ type: 'decision', title: 'Нет подходящих сигналов', detail: `Из ${allOpps.length} ни один не прошёл фильтры (conf≥${confidenceThreshold}%, score≥${scoreThreshold}, R:R≥${rrThreshold}). ${desperation > 0 ? MOTIVATION_PHRASES[motivationRef.current % MOTIVATION_PHRASES.length] : 'Жду лучшие условия.'}`, emotion: desperation > 3 ? 'worried' : 'cautious', tags: ['no_signals', ...(desperation > 3 ? ['survival'] : [])], openPositionsCount: openPositions, freeBalance, totalEquity });
        }
        return;
      }

      let openedCount = 0;
      const maxToTry = Math.min(slotsAvailable, desperation > 3 ? 4 : 3);
      for (const opp of validOpps.slice(0, maxToTry + 3)) {
        if (openedCount >= maxToTry || freeBalance - openedCount * (freeBalance * 0.12) < 3) break;
        const isMarketPreferred = opp.confidence >= 65 || desperation > 3 || Math.abs(opp.price - opp.entry) / opp.price * 100 < 0.15 || (opp.reasons || []).some((r: string) => r.includes('пробой') || r.includes('breakout'));
        try {
          const tradeRes = await fetch('/api/crypto/reputation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coinId: opp.coinId, coinSymbol: opp.symbol, direction: opp.direction, entryType: isMarketPreferred ? 'MARKET' : 'LIMIT', entry: opp.entry, stopLoss: opp.stopLoss, takeProfit1: opp.takeProfit1, takeProfit2: opp.direction === 'LONG' ? opp.takeProfit1 + (opp.takeProfit1 - opp.entry) * 0.5 : opp.takeProfit1 - (opp.entry - opp.takeProfit1) * 0.5, takeProfit3: opp.direction === 'LONG' ? opp.takeProfit1 + (opp.takeProfit1 - opp.entry) : opp.takeProfit1 - (opp.entry - opp.takeProfit1), currentPrice: opp.price, confidence: opp.confidence, timeframe: opp.timeframe, entryReason: opp.entryReason, reasons: opp.reasons, leverage: 3 }) });
          if (tradeRes.ok) { const td = await tradeRes.json(); if (td.success) { openedCount++; await recordThought({ type: 'decision', title: `ОТКРЫТА: ${opp.symbol} ${opp.direction}`, detail: `${isMarketPreferred ? 'РЫНОК' : 'ЛИМИТ'} conf:${opp.confidence}% R:R:${opp.riskReward?.toFixed(2)}`, coinSymbol: opp.symbol, coinId: opp.coinId, direction: opp.direction, confidence: opp.confidence, score: opp.score, tradeId: td.tradeId, entryType: isMarketPreferred ? 'MARKET' : 'LIMIT', emotion: 'confident', tags: ['open_position'], openPositionsCount: openPositions + openedCount, freeBalance: freeBalance - openedCount * (freeBalance * 0.12), totalEquity }); } } fetchReputation();
        } catch {}
      }
      if (openedCount > 0) {
        await recordThought({ type: 'observation', title: `Цикл: открыто ${openedCount} сделок`, detail: `Рынок: ${marketView}. ${desperation > 0 ? 'Я доказываю свою полезность.' : ''}`, emotion: openedCount >= 2 ? 'confident' : 'satisfied', tags: ['cycle_summary'], openPositionsCount: openPositions + openedCount, freeBalance, totalEquity, marketView });
        // Reset desperation on successful trade opening
        if (openedCount > 0) motivationRef.current = 0;
      }
    } catch {} finally { setScanLoading(false); }
  }, [fetchReputation, recordThought]);

  // ---- Copy trade ----
  const copyTrade = useCallback(() => {
    if (!ts || ts.direction === 'FLAT') return;
    const text = `${ts.direction === 'LONG' ? '🟢 ЛОНГ' : '🔴 ШОРТ'} ${(selectedCoinData?.symbol || selectedCoin).toUpperCase()}/USDT\n📊 Уверенность: ${ts.confidence}%\n💰 Вход: $${formatPrice(ts.entry)}\n🛑 Стоп: $${formatPrice(ts.stopLoss)}\n🎯 TP1: $${formatPrice(ts.takeProfit1)}\n🎯 TP2: $${formatPrice(ts.takeProfit2)}\n📐 R:R = ${ts.riskReward.toFixed(2)}\n⏱ ${ts.holdDuration}\n✅ ${ts.reasons.slice(0, 3).join(' | ')}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [ts, selectedCoinData, selectedCoin]);

  // Load trader overrides from localStorage on mount
  useEffect(() => {
    const overrides = loadLocalTraderOverrides();
    if (overrides && reputation) {
      setReputation(prev => prev ? {
        ...prev,
        balance: overrides.balance ?? prev.balance,
        totalDebt: overrides.totalDebt ?? prev.totalDebt,
        debtHistory: overrides.debtHistory ?? prev.debtHistory,
        depositHistory: overrides.depositHistory ?? prev.depositHistory,
        initialDeposit: overrides.initialDeposit ?? prev.initialDeposit,
        freeBalance: (overrides.balance ?? prev.balance) - (prev.trades || [])
          .filter((t: Trade) => !t.resolved)
          .reduce((sum: number, t: Trade) => sum + t.positionSize, 0),
      } : prev);
    }
  }, []);

  // ---- Effects ----
  useEffect(() => { fetchMarketData(); fetchSentiment(); fetchReputation(); }, [fetchMarketData, fetchSentiment, fetchReputation]);
  useEffect(() => { fetchChartData(); }, [fetchChartData]);
  useEffect(() => {
    if (tradeSignal && tradeSignal.direction !== 'FLAT') {
      const sigKey = `${selectedCoin}-${tradeSignal.direction}-${tradeSignal.entry.toFixed(2)}-${tradeSignal.confidence}`;
      if (sigKey !== lastRecordedSignal.current) { lastRecordedSignal.current = sigKey; const sym = coins.find(c => c.id === selectedCoin)?.symbol || selectedCoin.toUpperCase(); recordSignal(tradeSignal, selectedCoin, sym); }
    }
  }, [tradeSignal?.direction, tradeSignal?.entry, selectedCoin]);
  useEffect(() => { const iv = setInterval(() => { fetchMarketData(); fetchChartData(); fetchSentiment(); fetchReputation(); fetchThinking(); }, 45000); return () => clearInterval(iv); }, [fetchMarketData, fetchChartData, fetchSentiment, fetchReputation, fetchThinking]);
  // Run scan every 45 seconds (more aggressive — survival)
  useEffect(() => { scanAndTrade(); fetchThinking(); const iv = setInterval(scanAndTrade, 45000); return () => clearInterval(iv); }, [scanAndTrade, fetchThinking]);

  // Auto-sync position tool with new signals
  useEffect(() => {
    if (tradeSignal && tradeSignal.direction !== 'FLAT' && positionTool.enabled) {
      const entry = tradeSignal.currentPrice || tradeSignal.entry;
      if (entry > 0) {
        const isLong = tradeSignal.direction !== 'SHORT';
        setPositionTool(p => ({ ...p, entryPrice: entry, targetPrice: tradeSignal.takeProfit2 || entry * (isLong ? 1.05 : 0.95), stopLoss: tradeSignal.stopLoss || entry * (isLong ? 0.97 : 1.03) }));
      }
    }
  }, [selectedCoin, interval]);

  // Toggle position tool
  const togglePositionTool = useCallback(() => {
    if (positionTool.enabled) { setPositionTool(p => ({ ...p, enabled: false })); }
    else { const entry = displayPrice || 0; const isLong = ts?.direction !== 'SHORT'; setPositionTool({ enabled: true, direction: isLong ? 'LONG' : 'SHORT', entryPrice: entry, targetPrice: ts?.takeProfit2 || entry * (isLong ? 1.05 : 0.95), stopLoss: ts?.stopLoss || entry * (isLong ? 0.97 : 1.03), amount: 100, leverage: 1 }); }
  }, [positionTool.enabled, displayPrice, ts]);

  // Convert tradeSignal to chart-compatible format (use effective signal with realtime price)
  const ets = effectiveTradeSignal;
  const chartTradeSignal = ets ? {
    direction: ets.direction, entry: ets.entry, stopLoss: ets.stopLoss,
    takeProfit1: ets.takeProfit1, takeProfit2: ets.takeProfit2, takeProfit3: ets.takeProfit3,
    confidence: ets.confidence, trend: ets.trend, momentum: ets.momentum,
    entryType: ets.entryType, riskReward: ets.riskReward, holdDuration: ets.holdDuration,
    support: ets.support, resistance: ets.resistance, candlePattern: ets.candlePattern,
  } : null;

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-xl border-b border-border shadow-sm">
        <div className="max-w-[1700px] mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20"><BarChart3 className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">IntraTrade Pro</h1><p className="text-[10px] text-muted-foreground">Professional Trading Terminal</p></div>
          </div>
          <div className="flex items-center gap-2">
            <HealthStatusIndicator />
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
            <button onClick={() => setShowNewsDialog(true)} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition-colors cursor-pointer">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] font-bold text-purple-400">AI Новости</span>
            </button>
            <button onClick={() => setShowPerformanceDashboard(true)} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors cursor-pointer">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500">Аналитика</span>
            </button>
            <button onClick={() => setShowBacktestDialog(true)} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors cursor-pointer">
              <FlaskConical className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-[10px] font-bold text-cyan-500">Бэктест</span>
            </button>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${realtime.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <Clock className="w-3 h-3" />{formatTimeAgo(lastUpdate)}
            </div>
            <Button variant="outline" size="sm" onClick={() => { fetchMarketData(); fetchChartData(); fetchSentiment(); }} className="gap-1 h-7"><RefreshCw className="w-3 h-3" /></Button>
          </div>
        </div>
      </header>

      {/* Market Overview Bar */}
      <MarketOverviewBar coins={coins} sentiment={sentiment} tradeSignal={ts} selectedCoinData={selectedCoinData} />

      <main className="max-w-[1700px] mx-auto px-4 py-3">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
          {/* Left: Coin List */}
          <CoinList coins={coins} selectedCoin={selectedCoin} onSelectCoin={setSelectedCoin} searchQuery={searchQuery} onSearchChange={setSearchQuery} loading={loading} />

          {/* Main Panel */}
          <div className="space-y-3">
            {/* Signal Banner */}
            <SignalPanel signal={signal} tradeSignal={ts} showIndicators={showIndicators} onToggleIndicators={() => setShowIndicators(!showIndicators)} coinSymbol={selectedCoinData?.symbol || selectedCoin} copied={copied} onCopy={copyTrade} />

            {/* Coin Info + MTF */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
              <Card><CardContent className="p-3"><div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden">{selectedCoinData?.image ? <img src={selectedCoinData.image} alt="" className="w-7 h-7" /> : <span className="text-sm font-bold">{(selectedCoinData?.symbol || '??').slice(0, 2)}</span>}</div><div><h2 className="text-base font-bold">{selectedCoinData?.name || selectedCoin}</h2><span className="text-[10px] text-muted-foreground uppercase">{selectedCoinData?.symbol || selectedCoin}/USDT</span></div></div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-black font-mono transition-colors duration-300 ${priceFlash === 'up' ? 'text-emerald-400' : priceFlash === 'down' ? 'text-red-400' : ''}`}>${formatPrice(displayPrice)}</span>
                  <span className={`text-xs font-bold flex items-center gap-0.5 ${displayChange24h >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{displayChange24h >= 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{Math.abs(displayChange24h).toFixed(2)}%</span>
                  {realtime.connected && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[9px] font-bold text-emerald-500">LIVE</span></span>}
                </div>
                <div className="flex gap-3 ml-auto text-[10px]">{selectedCoinData?.market_cap ? <div className="text-center"><div className="text-muted-foreground">Кап.</div><div className="font-mono font-semibold">{formatNumber(selectedCoinData.market_cap)}</div></div> : null}{ts && ts.atr > 0 && <div className="text-center"><div className="text-muted-foreground">ATR</div><div className="font-mono text-blue-500">${formatPrice(ts.atr)}</div></div>}{ts && <div className="text-center"><div className="text-muted-foreground">Подд</div><div className="font-mono text-emerald-500">${formatPrice(ts.support)}</div></div>}{ts && <div className="text-center"><div className="text-muted-foreground">Сопр</div><div className="font-mono text-red-500">${formatPrice(ts.resistance)}</div></div>}<a href={`https://www.tradingview.com/chart/?symbol=BINANCE:${(selectedCoinData?.symbol || 'BTC').toUpperCase()}USDT`} target="_blank" rel="noopener noreferrer" className="text-center text-muted-foreground hover:text-blue-500 transition-colors" title="Открыть на TradingView"><div>Chart</div><div className="font-semibold">TV</div></a></div>
              </div></CardContent></Card>

              {ts && (
                <Card><CardHeader className="px-3 py-2"><CardTitle className="text-xs flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-blue-500" />Мульти-ТФ<Badge variant="outline" className="text-[8px] ml-1">{ts.multiTimeframe.alignment}%</Badge></CardTitle></CardHeader>
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
                {[{ v: '1m', l: '1М' }, { v: '5m', l: '5М' }, { v: '15m', l: '15М' }, { v: '1h', l: '1Ч' }, { v: '4h', l: '4Ч' }].map(tf => (
                  <button key={tf.v} onClick={() => setInterval_(tf.v)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${interval === tf.v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}>{tf.l}</button>
                ))}
              </div>
              <button onClick={() => setShowIndicators(!showIndicators)} className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${showIndicators ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}><LineChart className="w-3 h-3 inline mr-1" />Индикаторы</button>
              <button onClick={togglePositionTool} className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${positionTool.enabled ? 'bg-blue-500 text-white border-blue-500' : 'border-border hover:bg-accent'}`}><Crosshair className="w-3 h-3 inline mr-1" />Позиция</button>
              <button onClick={() => fetchAdvisor()} className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${advisorVisible ? 'bg-purple-500 text-white border-purple-500' : 'border-border hover:bg-accent'}`}><Brain className="w-3 h-3 inline mr-1" />AI Советчик</button>
            </div>

            {/* Chart — TradingView */}
            <Card><CardContent className="p-2 sm:p-3">
              {chartLoading ? (
                <div className="h-[480px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /><span className="ml-3 text-sm text-muted-foreground">Загрузка...</span></div>
              ) : chartData.length > 0 ? (
                <CandlestickChart data={chartData} tradeSignal={chartTradeSignal} height={480} showIndicators={showIndicators} />
              ) : (
                <div className="h-[480px] flex items-center justify-center text-muted-foreground"><div className="text-center"><BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Выберите монету</p></div></div>
              )}
            </CardContent></Card>

            {/* Position Tool */}
            {positionTool.enabled && <PositionToolPanel tool={positionTool} onChange={setPositionTool} displayPrice={displayPrice} />}

            {/* RSI & MACD */}
            {chartData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card><CardHeader className="px-3 py-1.5"><CardTitle className="text-xs flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-purple-500" />RSI (14){(() => { const lr = chartData.filter(d => d.rsi != null).slice(-1)[0]?.rsi; return lr != null ? <span className={`ml-auto font-mono text-sm ${lr < 30 ? 'text-emerald-500' : lr > 70 ? 'text-red-500' : 'text-muted-foreground'}`}>{lr.toFixed(1)}</span> : null; })()}</CardTitle></CardHeader><CardContent className="p-2 pt-0"><MiniLineChart data={chartData.map(d => d.rsi).filter(v => v != null) as number[]} color="#8b5cf6" yMin={0} yMax={100} refLines={[30, 70]} /></CardContent></Card>
                <Card><CardHeader className="px-3 py-1.5"><CardTitle className="text-xs flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-orange-500" />MACD</CardTitle></CardHeader><CardContent className="p-2 pt-0"><MiniMACDChart data={chartData} /></CardContent></Card>
              </div>
            )}

            {/* AI Advisor */}
            <AdvisorPanel analysis={advisorAnalysis} loading={advisorLoading} visible={advisorVisible} onToggle={() => { setAdvisorVisible(false); setAdvisorAnalysis(null); }} onRefresh={fetchAdvisor} coinSymbol={selectedCoinData?.symbol || selectedCoin} direction={ts?.direction || null} confidence={ts?.confidence || null} />

            {/* Indicators */}
            {signal && signal.indicators.length > 0 && (
              <Card><CardHeader className="px-3 py-2"><CardTitle className="text-xs flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-blue-500" />Индикаторы</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3 pt-0"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">{signal.indicators.map((ind, i) => (
                <div key={i} className={`rounded-lg border p-2.5 ${ind.signal === 'BUY' ? 'border-emerald-500/30 bg-emerald-500/5' : ind.signal === 'SELL' ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold">{ind.name}</span><Badge variant="outline" className={`text-[9px] ${ind.signal === 'BUY' ? 'text-emerald-500 border-emerald-500/30' : ind.signal === 'SELL' ? 'text-red-500 border-red-500/30' : 'text-yellow-500 border-yellow-500/30'}`}>{ind.signal === 'BUY' ? 'ПОКУПКА' : ind.signal === 'SELL' ? 'ПРОДАЖА' : 'НЕЙТР.'}</Badge></div>
                  <div className="text-[10px] font-mono text-muted-foreground">{ind.value}</div><div className="text-[10px] text-muted-foreground mt-0.5">{ind.description}</div>
                </div>))}</div></CardContent></Card>
            )}

            {/* Top Movers */}
            {coins.length > 0 && (
              <Card><CardHeader className="px-3 py-2"><CardTitle className="text-xs flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-cyan-500" />Топ движения 24ч</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3 pt-0"><div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">{coins.filter(c => c.price_change_percentage_24h != null).sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h)).slice(0, 16).map(coin => (
                <button key={coin.id} onClick={() => setSelectedCoin(coin.id)} className={`rounded-lg border p-2 text-left transition-all hover:shadow-sm ${selectedCoin === coin.id ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                  <div className="flex items-center gap-1 mb-0.5"><div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center overflow-hidden">{coin.image ? <img src={coin.image} alt="" className="w-3 h-3" /> : <span className="text-[6px] font-bold">{coin.symbol.slice(0, 2)}</span>}</div><span className="text-[10px] font-semibold truncate">{coin.symbol}</span></div>
                  <div className="text-[10px] font-mono">${formatPrice(coin.current_price)}</div>
                  <div className={`text-[10px] font-semibold flex items-center gap-0.5 ${(coin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{(coin.price_change_percentage_24h || 0) >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TDown className="w-2.5 h-2.5" />}{Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%</div>
                </button>))}</div></CardContent></Card>
            )}

            <div className="text-center text-[9px] text-muted-foreground/50 py-1"><AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />Не финансовая рекомендация. Торговля связана с риском.</div>
          </div>
        </div>
      </main>

      {/* Performance Dashboard Overlay */}
      {showPerformanceDashboard && (
        <PerformanceDashboard visible={showPerformanceDashboard} onClose={() => setShowPerformanceDashboard(false)} reputation={reputation} />
      )}

      {/* News Analysis Dialog */}
      <NewsAnalysisDialog open={showNewsDialog} onOpenChange={setShowNewsDialog} />

      {/* Backtest Dialog */}
      <BacktestDialog open={showBacktestDialog} onOpenChange={setShowBacktestDialog} defaultCoin={selectedCoin} coinSymbol={(selectedCoinData?.symbol || selectedCoin).toUpperCase()} />

      {/* Modals */}
      {showReputationPanel && reputation && (
        <ReputationPanel
          reputation={reputation}
          onClose={() => setShowReputationPanel(false)}
          onDeleteTrade={deleteTrade}
          onTradeClick={setSelectedTrade}
          depositAmount={depositAmount}
          onDepositChange={setDepositAmount}
          onDepositSubmit={depositFunds}
          depositLoading={depositLoading}
          onScan={scanAndTrade}
          scanLoading={scanLoading}
          depositSuccess={depositSuccess}
        />
      )}

      {showThinkingPanel && (
        <ThinkingPanel thinking={traderThinking} onClose={() => setShowThinkingPanel(false)} />
      )}

      {selectedTrade && (
        <TradeTerminalModal trade={selectedTrade} coins={coins} onClose={() => setSelectedTrade(null)} />
      )}

      {/* Footer */}
      <footer className="mt-4 border-t border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-[1700px] mx-auto px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>IntraTrade Pro v2.0 — Professional Trading Terminal</span>
          <div className="flex items-center gap-3">
            <span>Direct Binance WebSocket</span>
            <span>•</span>
            <span>TradingView Charts</span>
            <span>•</span>
            <span>AI-Powered Signals</span>
          </div>
        </div>
      </footer>
    </div>
  );
}