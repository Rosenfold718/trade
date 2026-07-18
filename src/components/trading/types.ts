// =============================================
// CryptoDashboard shared types & utility functions
// =============================================

export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  sparkline_in_7d: number[];
  high_24h: number;
  low_24h: number;
}

export interface TradeSignal {
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

export interface IndicatorResult {
  name: string;
  value: number | string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  description: string;
  weight: number;
}

export interface MultiTimeframeResult {
  m5?: TimeframeVerdict;
  m15?: TimeframeVerdict;
  h1?: TimeframeVerdict;
  h4?: TimeframeVerdict;
  consensus: string;
  alignment: number;
}

export interface TimeframeVerdict {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;
  trend: string;
  keyLevel: string;
}

export interface SignalResult {
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  indicators: IndicatorResult[];
  summary: string;
  forecast?: any;
  tradeSignal?: TradeSignal;
}

export interface ChartDataPoint {
  timestamp: number;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9?: number;
  ema21?: number;
  bbUpper?: number;
  bbLower?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
}

export interface PositionTool {
  enabled: boolean;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  amount: number;
  leverage: number;
}

export interface SentimentData {
  overallSentiment: string;
  sentimentScore: number;
  fearGreed: { value: number; classification: string };
  recommendation: string;
  newsAnalysis: { bullish_factors: string[]; bearish_factors: string[] };
  source: string;
}

export interface Trade {
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

export interface DepositSnapshot {
  timestamp: number;
  balance: number;
  equity: number;
}

export interface DebtEntry {
  timestamp: number;
  amount: number;
  remainingOwed: number;
  label: string;
}

export interface Lesson {
  type: string;
  description: string;
  coinId?: string;
  direction?: 'LONG' | 'SHORT';
  value?: number;
  timestamp: number;
  tradeId: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AdaptiveParams {
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

export interface ReputationData {
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

// =============================================
// Utility functions
// =============================================

export function formatPrice(price: number): string {
  if (!price || !isFinite(price)) return '0.00';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}

export function formatNumber(num: number): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

export function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч`;
  return new Date(ts).toLocaleDateString('ru-RU');
}

export function pctChange(from: number, to: number): string {
  if (from === 0) return '0.00';
  const pct = ((to - from) / from) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}