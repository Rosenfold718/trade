// Professional Intraday Trading Analysis Engine v2
// Focus: 1m, 5m, 15m, 1h, 4h timeframes for intraday and 1-3 day trades
// Key improvement: More aggressive signal generation with candlestick patterns, VWAP, volume spikes

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeSignal {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number; // 0-100
  entry: number;
  entryType: 'LIMIT' | 'MARKET'; // LIMIT = wait for pullback, MARKET = enter now
  entryReason: string; // Why this entry level was chosen
  stopLoss: number;
  takeProfit1: number; // conservative (1.5-2 R)
  takeProfit2: number; // moderate (2.5-3 R)
  takeProfit3: number; // aggressive (4-5 R)
  riskReward: number;
  holdDuration: string; // e.g. "2-4 часа", "1-2 дня"
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
  consensus: 'STRONG_LONG' | 'LONG' | 'NEUTRAL' | 'SHORT' | 'STRONG_SHORT';
  alignment: number; // 0-100, how aligned timeframes are
}

export interface TimeframeVerdict {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number; // -100 to +100
  trend: string;
  keyLevel: string;
}

export interface SignalResult {
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  indicators: IndicatorResult[];
  summary: string;
  forecast?: PriceForecast;
  tradeSignal?: TradeSignal;
}

export interface PriceForecast {
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  confidence: number;
  targetPrice: number;
  supportLevel: number;
  resistanceLevel: number;
  shortTerm: string;
  mediumTerm: string;
  longTerm: string;
}

// ============================================
// BASIC INDICATORS
// ============================================

export function SMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) { sum += data[j]; }
    result.push(sum / period);
  }
  return result;
}

export function EMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    result.push(NaN);
  }
  result[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
  }
  return result;
}

export function RSI(closes: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { gains.push(0); losses.push(0); result.push(NaN); continue; }
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
    if (i < period) { result.push(NaN); continue; }
    let avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    if (avgLoss === 0) { result.push(100); } else { result.push(100 - 100 / (1 + avgGain / avgLoss)); }
  }
  return result;
}

export function MACD(closes: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = EMA(closes, fastPeriod);
  const slowEMA = EMA(closes, slowPeriod);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(isNaN(fastEMA[i]) || isNaN(slowEMA[i]) ? NaN : fastEMA[i] - slowEMA[i]);
  }
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalLine = EMA(validMacd, signalPeriod);
  const fullSignal: number[] = [];
  let vIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i])) { fullSignal.push(NaN); } else { fullSignal.push(signalLine[vIdx] || NaN); vIdx++; }
  }
  const histogram: number[] = macdLine.map((m, i) => isNaN(m) || isNaN(fullSignal[i]) ? NaN : m - fullSignal[i]);
  return { macd: macdLine, signal: fullSignal, histogram };
}

export function BollingerBands(closes: number[], period: number = 20, stdDev: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = SMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(middle[i])) { upper.push(NaN); lower.push(NaN); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) { sumSq += Math.pow(closes[j] - middle[i], 2); }
    const sd = Math.sqrt(sumSq / period);
    upper.push(middle[i] + stdDev * sd);
    lower.push(middle[i] - stdDev * sd);
  }
  return { upper, middle, lower };
}

export function Stochastic(highs: number[], lows: number[], closes: number[], kPeriod: number = 14, dPeriod: number = 3): { k: number[]; d: number[] } {
  const k: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1) { k.push(NaN); continue; }
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) { if (highs[j] > hh) hh = highs[j]; if (lows[j] < ll) ll = lows[j]; }
    k.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }
  const validK = k.filter(v => !isNaN(v));
  const dRaw = SMA(validK, dPeriod);
  const d: number[] = [];
  let vi = 0;
  for (let i = 0; i < k.length; i++) { if (isNaN(k[i])) { d.push(NaN); } else { d.push(dRaw[vi] || NaN); vi++; } }
  return { k, d };
}

export function ATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const tr: number[] = [];
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) tr.push(highs[i] - lows[i]);
    else tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) result.push(NaN);
    else if (i === period - 1) result.push(tr.slice(0, period).reduce((a, b) => a + b, 0) / period);
    else result.push((result[i - 1] * (period - 1) + tr[i]) / period);
  }
  return result;
}

export function VWAP(data: OHLCV[]): number[] {
  const result: number[] = [];
  let cumTPV = 0, cumVol = 0;
  for (const c of data) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
    result.push(cumVol === 0 ? c.close : cumTPV / cumVol);
  }
  return result;
}

export function ADX(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const plusDM: number[] = [], minusDM: number[] = [], tr: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { plusDM.push(0); minusDM.push(0); tr.push(highs[i] - lows[i]); continue; }
    const up = highs[i] - highs[i - 1], down = lows[i - 1] - lows[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const sTR = smoothWilder(tr, period), sPDM = smoothWilder(plusDM, period), sMDM = smoothWilder(minusDM, period);
  const plusDI: number[] = [], minusDI: number[] = [], dx: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    plusDI.push(!isNaN(sTR[i]) && sTR[i] !== 0 ? (sPDM[i] / sTR[i]) * 100 : 0);
    minusDI.push(!isNaN(sTR[i]) && sTR[i] !== 0 ? (sMDM[i] / sTR[i]) * 100 : 0);
    const diSum = plusDI[i] + minusDI[i];
    dx.push(diSum === 0 ? 0 : (Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100);
  }
  return smoothWilder(dx, period);
}

function smoothWilder(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) result.push(NaN);
    else if (i === period - 1) result.push(data.slice(0, period).reduce((a, b) => a + b, 0) / period);
    else result.push(!isNaN(result[i - 1]) ? (result[i - 1] * (period - 1) + data[i]) / period : data[i]);
  }
  return result;
}

export function OBV(closes: number[], volumes: number[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) result.push(result[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) result.push(result[i - 1] - volumes[i]);
    else result.push(result[i - 1]);
  }
  return result;
}

// ============================================
// CANDLESTICK PATTERN RECOGNITION (NEW!)
// ============================================

export interface CandlePattern {
  name: string;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number; // 1-10
  description: string;
}

export function detectCandlePatterns(data: OHLCV[]): CandlePattern | null {
  if (data.length < 5) return null;

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const prev2 = data[data.length - 3];

  const bodySize = Math.abs(last.close - last.open);
  const totalRange = last.high - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const isGreen = last.close > last.open;
  const isRed = last.close < last.open;

  const prevBodySize = Math.abs(prev.close - prev.open);
  const prevIsGreen = prev.close > prev.open;
  const prevIsRed = prev.close < prev.open;

  const avgBody = data.slice(-10).reduce((s, d) => s + Math.abs(d.close - d.open), 0) / 10;

  // 1. Hammer / Inverted Hammer (bullish reversal)
  if (lowerWick > bodySize * 2 && upperWick < bodySize * 0.5 && totalRange > 0 && isRed === false) {
    return { name: 'Молот', signal: 'BULLISH', strength: 7, description: 'Бычий разворот — длинная нижняя тень' };
  }

  // 2. Shooting Star (bearish reversal)
  if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5 && totalRange > 0) {
    return { name: 'Падающая звезда', signal: 'BEARISH', strength: 7, description: 'Медвежий разворот — длинная верхняя тень' };
  }

  // 3. Bullish Engulfing
  if (prevIsRed && isGreen && last.open <= prev.close && last.close >= prev.open && bodySize > prevBodySize) {
    return { name: 'Бычье поглощение', signal: 'BULLISH', strength: 8, description: 'Зелёная свеча поглотила красную — сильный бычий сигнал' };
  }

  // 4. Bearish Engulfing
  if (prevIsGreen && isRed && last.open >= prev.close && last.close <= prev.open && bodySize > prevBodySize) {
    return { name: 'Медвежье поглощение', signal: 'BEARISH', strength: 8, description: 'Красная свеча поглотила зелёную — сильный медвежий сигнал' };
  }

  // 5. Doji (indecision)
  if (totalRange > 0 && bodySize / totalRange < 0.1) {
    return { name: 'Доджи', signal: 'NEUTRAL', strength: 3, description: 'Нерешительность рынка — возможен разворот' };
  }

  // 6. Dragonfly Doji (bullish)
  if (totalRange > 0 && bodySize / totalRange < 0.15 && lowerWick > totalRange * 0.6 && upperWick < totalRange * 0.1) {
    return { name: 'Стрекоза', signal: 'BULLISH', strength: 6, description: 'Бычий доджи — давление покупателей' };
  }

  // 7. Gravestone Doji (bearish)
  if (totalRange > 0 && bodySize / totalRange < 0.15 && upperWick > totalRange * 0.6 && lowerWick < totalRange * 0.1) {
    return { name: 'Надгробие', signal: 'BEARISH', strength: 6, description: 'Медвежий доджи — давление продавцов' };
  }

  // 8. Morning Star (3-candle bullish reversal)
  if (data.length >= 3) {
    const c1 = data[data.length - 3];
    const c2 = data[data.length - 2];
    const c3 = data[data.length - 1];
    const c1Red = c1.close < c1.open;
    const c3Green = c3.close > c3.open;
    const c2Small = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3;
    if (c1Red && c2Small && c3Green && c3.close > (c1.open + c1.close) / 2) {
      return { name: 'Утренняя звезда', signal: 'BULLISH', strength: 9, description: 'Трёхсвечевый бычий разворот' };
    }
  }

  // 9. Evening Star (3-candle bearish reversal)
  if (data.length >= 3) {
    const c1 = data[data.length - 3];
    const c2 = data[data.length - 2];
    const c3 = data[data.length - 1];
    const c1Green = c1.close > c1.open;
    const c3Red = c3.close < c3.open;
    const c2Small = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3;
    if (c1Green && c2Small && c3Red && c3.close < (c1.open + c1.close) / 2) {
      return { name: 'Вечерняя звезда', signal: 'BEARISH', strength: 9, description: 'Трёхсвечевый медвежий разворот' };
    }
  }

  // 10. Pin Bar (bullish)
  if (lowerWick > bodySize * 2.5 && lowerWick > upperWick * 3 && totalRange > avgBody * 0.8) {
    return { name: 'Пин-бар бычий', signal: 'BULLISH', strength: 8, description: 'Отказ от нижних цен — бычий пин-бар' };
  }

  // 11. Pin Bar (bearish)
  if (upperWick > bodySize * 2.5 && upperWick > lowerWick * 3 && totalRange > avgBody * 0.8) {
    return { name: 'Пин-бар медвежий', signal: 'BEARISH', strength: 8, description: 'Отказ от верхних цен — медвежий пин-бар' };
  }

  // 12. Three White Soldiers
  if (data.length >= 3) {
    const last3 = data.slice(-3);
    if (last3.every(d => d.close > d.open) &&
        last3[1].close > last3[0].close && last3[2].close > last3[1].close) {
      return { name: 'Три белых солдата', signal: 'BULLISH', strength: 8, description: 'Три растущие свечи — сильный бычий тренд' };
    }
  }

  // 13. Three Black Crows
  if (data.length >= 3) {
    const last3 = data.slice(-3);
    if (last3.every(d => d.close < d.open) &&
        last3[1].close < last3[0].close && last3[2].close < last3[1].close) {
      return { name: 'Три чёрные вороны', signal: 'BEARISH', strength: 8, description: 'Три падающие свечи — сильный медвежий тренд' };
    }
  }

  // 14. Large body candle (momentum)
  if (bodySize > avgBody * 2.5) {
    if (isGreen) {
      return { name: 'Сильная бычья', signal: 'BULLISH', strength: 6, description: `Тело в ${(bodySize / avgBody).toFixed(1)}x больше среднего — импульс` };
    } else {
      return { name: 'Сильная медвежья', signal: 'BEARISH', strength: 6, description: `Тело в ${(bodySize / avgBody).toFixed(1)}x больше среднего — импульс` };
    }
  }

  return null;
}

// ============================================
// VOLUME ANALYSIS (NEW!)
// ============================================

export interface VolumeAnalysis {
  signal: string | null;
  isVolumeSpike: boolean;
  volumeRatio: number;
  obvTrend: 'RISING' | 'FALLING' | 'FLAT';
  vwapPosition: 'ABOVE' | 'BELOW' | 'AT';
  description: string;
}

export function analyzeVolume(data: OHLCV[]): VolumeAnalysis {
  if (data.length < 20) {
    return { signal: null, isVolumeSpike: false, volumeRatio: 1, obvTrend: 'FLAT', vwapPosition: 'AT', description: 'Недостаточно данных' };
  }

  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume);
  const currentPrice = closes[closes.length - 1];

  // Volume spike detection
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[volumes.length - 1];
  const volumeRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1;
  const isVolumeSpike = volumeRatio > 2.0;

  // OBV trend
  const obv = OBV(closes, volumes);
  const obvRecent = obv.slice(-10);
  const obvTrend: 'RISING' | 'FALLING' | 'FLAT' =
    obvRecent[obvRecent.length - 1] > obvRecent[0] * 1.01 ? 'RISING' :
    obvRecent[obvRecent.length - 1] < obvRecent[0] * 0.99 ? 'FALLING' : 'FLAT';

  // VWAP position
  const vwap = VWAP(data);
  const lastVwap = vwap[vwap.length - 1];
  const vwapPosition: 'ABOVE' | 'BELOW' | 'AT' =
    currentPrice > lastVwap * 1.002 ? 'ABOVE' :
    currentPrice < lastVwap * 0.998 ? 'BELOW' : 'AT';

  // Signal description
  let signal: string | null = null;
  let description = '';

  if (isVolumeSpike) {
    const priceUp = closes[closes.length - 1] > closes[closes.length - 2];
    if (priceUp && obvTrend === 'RISING') {
      signal = 'BULLISH_VOLUME_SPIKE';
      description = `Объём x${volumeRatio.toFixed(1)} + рост OBV — сильное давление покупателей`;
    } else if (!priceUp && obvTrend === 'FALLING') {
      signal = 'BEARISH_VOLUME_SPIKE';
      description = `Объём x${volumeRatio.toFixed(1)} + падение OBV — сильное давление продавцов`;
    } else {
      signal = 'HIGH_VOLUME';
      description = `Аномальный объём x${volumeRatio.toFixed(1)} — возможен разворот`;
    }
  }

  if (vwapPosition === 'ABOVE' && signal === null) {
    signal = 'ABOVE_VWAP';
    description = 'Цена выше VWAP — бычий настрой внутридневных игроков';
  } else if (vwapPosition === 'BELOW' && signal === null) {
    signal = 'BELOW_VWAP';
    description = 'Цена ниже VWAP — медвежий настрой внутридневных игроков';
  }

  if (!signal) {
    description = `Объём x${volumeRatio.toFixed(1)} | OBV: ${obvTrend === 'RISING' ? '↑' : obvTrend === 'FALLING' ? '↓' : '→'} | VWAP: ${vwapPosition === 'ABOVE' ? 'выше' : vwapPosition === 'BELOW' ? 'ниже' : 'на'}`;
  }

  return { signal, isVolumeSpike, volumeRatio, obvTrend, vwapPosition, description };
}

// ============================================
// SWING POINT DETECTION (for stop-loss placement)
// ============================================

/** Find the most recent swing low — a candle whose low is lower than N candles on each side */
export function findLastSwingLow(data: OHLCV[], lookback: number = 5): number {
  if (data.length < lookback * 2 + 1) {
    return data.length > 0 ? Math.min(...data.slice(-20).map(d => d.low)) : 0;
  }
  const recent = data.slice(-(lookback * 4)); // Look in the last ~20 candles
  for (let i = recent.length - 1; i >= lookback; i--) {
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (recent[i].low >= recent[i - j].low || recent[i].low >= recent[Math.min(i + j, recent.length - 1)].low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) return recent[i].low;
  }
  // Fallback: lowest low of recent data
  return Math.min(...data.slice(-20).map(d => d.low));
}

/** Find the most recent swing high — a candle whose high is higher than N candles on each side */
export function findLastSwingHigh(data: OHLCV[], lookback: number = 5): number {
  if (data.length < lookback * 2 + 1) {
    return data.length > 0 ? Math.max(...data.slice(-20).map(d => d.high)) : 0;
  }
  const recent = data.slice(-(lookback * 4));
  for (let i = recent.length - 1; i >= lookback; i--) {
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (recent[i].high <= recent[i - j].high || recent[i].high <= recent[Math.min(i + j, recent.length - 1)].high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) return recent[i].high;
  }
  return Math.max(...data.slice(-20).map(d => d.high));
}

// ============================================
// ADVANCED LEVEL DETECTION
// ============================================

export function findKeyLevels(data: OHLCV[]): {
  supports: number[]; resistances: number[];
  pivot: number; nearestSupport: number; nearestResistance: number;
} {
  if (data.length < 5) return { supports: [], resistances: [], pivot: 0, nearestSupport: 0, nearestResistance: 0 };

  const currentPrice = data[data.length - 1].close;
  const recent = data.slice(-50);

  // Find swing highs and swing lows
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      swingHighs.push(recent[i].high);
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      swingLows.push(recent[i].low);
    }
  }

  // Cluster nearby levels (within 0.3% of each other)
  const clusterLevels = (levels: number[]): number[] => {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const avg = lastCluster.reduce((a, b) => a + b, 0) / lastCluster.length;
      if (Math.abs(sorted[i] - avg) / avg < 0.003) {
        lastCluster.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }
    return clusters.map(c => c.reduce((a, b) => a + b, 0) / c.length).sort((a, b) => a - b);
  };

  const supports = clusterLevels(swingLows.filter(l => l < currentPrice)).reverse();
  const resistances = clusterLevels(swingHighs.filter(h => h > currentPrice));

  const lastCandle = recent[recent.length - 1];
  const pivot = (lastCandle.high + lastCandle.low + lastCandle.close) / 3;

  const nearestSupport = supports.length > 0 ? supports[0] : pivot * 0.97;
  const nearestResistance = resistances.length > 0 ? resistances[0] : pivot * 1.03;

  return { supports, resistances, pivot, nearestSupport, nearestResistance };
}

// ============================================
// SINGLE TIMEFRAME ANALYSIS (IMPROVED — MORE SENSITIVE)
// ============================================

export function analyzeTimeframe(data: OHLCV[]): TimeframeVerdict {
  if (data.length < 20) return { direction: 'NEUTRAL', score: 0, trend: 'Недостаточно данных', keyLevel: '—' };

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);
  const currentPrice = closes[closes.length - 1];

  let score = 0; // -100 to +100

  // 1. EMA Trend (weight: 25)
  const ema9 = EMA(closes, Math.min(9, Math.floor(closes.length * 0.3)));
  const ema21 = EMA(closes, Math.min(21, Math.floor(closes.length * 0.6)));
  const lastEma9 = ema9[ema9.length - 1];
  const lastEma21 = ema21[ema21.length - 1];

  if (!isNaN(lastEma9) && !isNaN(lastEma21)) {
    if (currentPrice > lastEma9 && lastEma9 > lastEma21) score += 25;
    else if (currentPrice < lastEma9 && lastEma9 < lastEma21) score -= 25;
    else if (currentPrice > lastEma9) score += 12;
    else score -= 12;

    // EMA crossover detection
    if (ema9.length >= 2 && ema21.length >= 2) {
      const prevEma9 = ema9[ema9.length - 2];
      const prevEma21 = ema21[ema21.length - 2];
      if (!isNaN(prevEma9) && !isNaN(prevEma21)) {
        if (prevEma9 <= prevEma21 && lastEma9 > lastEma21) score += 15; // Golden cross
        if (prevEma9 >= prevEma21 && lastEma9 < lastEma21) score -= 15; // Death cross
      }
    }
  }

  // 2. RSI (weight: 20) — IMPROVED: more granular scoring
  const rsi = RSI(closes, Math.min(14, Math.floor(closes.length * 0.4)));
  const lastRSI = rsi[rsi.length - 1];
  if (!isNaN(lastRSI)) {
    if (lastRSI < 20) score += 25;      // Extreme oversold — strong buy
    else if (lastRSI < 30) score += 18;  // Oversold
    else if (lastRSI < 40) score += 8;
    else if (lastRSI < 45) score += 3;
    else if (lastRSI > 80) score -= 25;  // Extreme overbought — strong sell
    else if (lastRSI > 70) score -= 18;  // Overbought
    else if (lastRSI > 60) score -= 8;
    else if (lastRSI > 55) score -= 3;

    // RSI divergence
    if (closes.length >= 10) {
      const recentCloses = closes.slice(-10);
      const recentRSI = rsi.slice(-10).filter(v => !isNaN(v));
      if (recentRSI.length >= 5) {
        const priceTrend = recentCloses[recentCloses.length - 1] - recentCloses[0];
        const rsiTrend = recentRSI[recentRSI.length - 1] - recentRSI[0];
        if (priceTrend > 0 && rsiTrend < 0) score -= 12; // Bearish divergence
        if (priceTrend < 0 && rsiTrend > 0) score += 12; // Bullish divergence
      }
    }
  }

  // 3. MACD (weight: 20) — IMPROVED: stronger crossover signals
  const macd = MACD(closes, 12, 26, 9);
  const lastMacd = macd.macd[macd.macd.length - 1];
  const lastSignal = macd.signal[macd.signal.length - 1];
  const lastHist = macd.histogram[macd.histogram.length - 1];
  const prevHist = macd.histogram[macd.histogram.length - 2];

  if (!isNaN(lastMacd) && !isNaN(lastSignal)) {
    if (lastMacd > lastSignal) score += 12;
    else score -= 12;

    // Histogram momentum
    if (!isNaN(lastHist) && !isNaN(prevHist)) {
      if (lastHist > prevHist && lastHist > 0) score += 10;  // Growing bullish momentum
      else if (lastHist < prevHist && lastHist < 0) score -= 10;  // Growing bearish momentum
      else if (lastHist > prevHist && lastHist < 0) score += 5;  // Slowing bearish
      else if (lastHist < prevHist && lastHist > 0) score -= 5;  // Slowing bullish
    }

    // MACD crossover — strong signal
    if (macd.macd.length >= 2 && macd.signal.length >= 2) {
      const prevMacd = macd.macd[macd.macd.length - 2];
      const prevSignal = macd.signal[macd.signal.length - 2];
      if (!isNaN(prevMacd) && !isNaN(prevSignal)) {
        if (prevMacd <= prevSignal && lastMacd > lastSignal) score += 15; // Bullish crossover
        if (prevMacd >= prevSignal && lastMacd < lastSignal) score -= 15; // Bearish crossover
      }
    }
  }

  // 4. Bollinger Bands (weight: 15) — IMPROVED: squeeze detection scoring
  const bbPeriod = Math.min(20, Math.floor(closes.length * 0.6));
  if (bbPeriod >= 5) {
    const bb = BollingerBands(closes, bbPeriod, 2);
    const lastUpper = bb.upper[bb.upper.length - 1];
    const lastLower = bb.lower[bb.lower.length - 1];
    if (!isNaN(lastUpper) && !isNaN(lastLower)) {
      const bbPos = (currentPrice - lastLower) / (lastUpper - lastLower);
      if (bbPos < 0.05) score += 18;     // At lower band = buy
      else if (bbPos < 0.15) score += 10;
      else if (bbPos > 0.95) score -= 18; // At upper band = sell
      else if (bbPos > 0.85) score -= 10;

      // Squeeze detection — breakout coming
      const bbWidth = (lastUpper - lastLower) / ((lastUpper + lastLower) / 2);
      // Check historical BB width for squeeze
      if (bb.upper.length >= 20) {
        const prevBBWidth = (bb.upper[bb.upper.length - 20] - bb.lower[bb.lower.length - 20]) /
          ((bb.upper[bb.upper.length - 20] + bb.lower[bb.lower.length - 20]) / 2);
        if (!isNaN(prevBBWidth) && bbWidth < prevBBWidth * 0.5) {
          // Bollinger squeeze — breakout imminent
          // Score in the direction of the last close vs EMA
          if (currentPrice > lastEma9) score += 5;
          else score -= 5;
        }
      }
    }
  }

  // 5. Stochastic (weight: 10)
  const stoch = Stochastic(highs, lows, closes, 14, 3);
  const lastK = stoch.k[stoch.k.length - 1];
  const lastD = stoch.d[stoch.d.length - 1];
  if (!isNaN(lastK) && !isNaN(lastD)) {
    if (lastK < 20) score += 10;
    else if (lastK < 30) score += 5;
    else if (lastK > 80) score -= 10;
    else if (lastK > 70) score -= 5;

    // K/D crossover
    const prevK = stoch.k[stoch.k.length - 2];
    const prevD = stoch.d[stoch.d.length - 2];
    if (!isNaN(prevK) && !isNaN(prevD)) {
      if (prevK <= prevD && lastK > lastD && lastK < 50) score += 6;
      if (prevK >= prevD && lastK < lastD && lastK > 50) score -= 6;
    }
  }

  // 6. Volume confirmation (weight: 15) — IMPROVED
  if (volumes.length >= 10) {
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    const lastVol = volumes[volumes.length - 1];
    const volRatio = avgVol > 0 ? lastVol / avgVol : 1;
    const priceChange = closes[closes.length - 1] - closes[closes.length - 2];

    if (volRatio > 2.5) {
      if (priceChange > 0) score += 15; // High volume up move
      else score -= 15; // High volume down move
    } else if (volRatio > 1.5) {
      if (priceChange > 0) score += 8;
      else score -= 8;
    }

    // OBV confirmation
    const obv = OBV(closes, volumes);
    const obvRecent = obv.slice(-5);
    if (obvRecent.length >= 5) {
      const obvTrend = obvRecent[obvRecent.length - 1] - obvRecent[0];
      const priceTrend = closes[closes.length - 1] - closes[closes.length - 5];
      if (obvTrend > 0 && priceTrend > 0) score += 5; // OBV confirms uptrend
      if (obvTrend < 0 && priceTrend < 0) score -= 5; // OBV confirms downtrend
      if (obvTrend > 0 && priceTrend < 0) score += 3; // Bullish divergence OBV
      if (obvTrend < 0 && priceTrend > 0) score -= 3; // Bearish divergence OBV
    }
  }

  // 7. Candlestick pattern bonus (NEW!)
  const pattern = detectCandlePatterns(data);
  if (pattern) {
    if (pattern.signal === 'BULLISH') score += pattern.strength * 2;
    else if (pattern.signal === 'BEARISH') score -= pattern.strength * 2;
  }

  // 8. VWAP position bonus (NEW!)
  if (data.length >= 20) {
    const vwap = VWAP(data);
    const lastVwap = vwap[vwap.length - 1];
    if (!isNaN(lastVwap) && lastVwap > 0) {
      if (currentPrice > lastVwap * 1.005) score += 5;  // Above VWAP = bullish
      else if (currentPrice < lastVwap * 0.995) score -= 5; // Below VWAP = bearish
    }
  }

  // Clamp score
  score = Math.max(-100, Math.min(100, score));

  // LOWERED threshold for signal generation (was ±8, now ±3)
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    score > 3 ? 'BULLISH' : score < -3 ? 'BEARISH' : 'NEUTRAL';

  const trend = score > 40 ? 'Сильный восходящий' :
                score > 15 ? 'Восходящий' :
                score < -40 ? 'Сильный нисходящий' :
                score < -15 ? 'Нисходящий' : 'Боковик';

  const levels = findKeyLevels(data);
  const keyLevel = direction === 'BULLISH'
    ? `Сопр: ${formatTP(levels.nearestResistance)}`
    : direction === 'BEARISH'
    ? `Подд: ${formatTP(levels.nearestSupport)}`
    : `Пивот: ${formatTP(levels.pivot)}`;

  return { direction, score, trend, keyLevel };
}

// ============================================
// MULTI-TIMEFRAME TRADE SIGNAL GENERATOR (IMPROVED)
// ============================================

export function generateTradeSignal(
  data: OHLCV[],
  timeframe: string, // '1m', '5m', '15m', '1h', '4h'
  higherTFData?: OHLCV[]
): TradeSignal {
  const currentPrice = data.length > 0 ? data[data.length - 1].close : 0;
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  // Default flat signal
  const flatSignal: TradeSignal = {
    direction: 'FLAT',
    confidence: 0,
    entry: currentPrice,
    entryType: 'LIMIT',
    entryReason: 'Нет сигнала для входа',
    stopLoss: currentPrice,
    takeProfit1: currentPrice,
    takeProfit2: currentPrice,
    takeProfit3: currentPrice,
    riskReward: 0,
    holdDuration: '—',
    holdDurationHours: 0,
    reasons: ['Нет чёткого сигнала для входа. Ожидайте.'],
    warnings: ['Рынок в боковике, вход рискован.'],
    indicators: [],
    multiTimeframe: {
      consensus: 'NEUTRAL',
      alignment: 0,
    },
    currentPrice,
    atr: 0,
    support: currentPrice * 0.97,
    resistance: currentPrice * 1.03,
    trend: 'SIDEWAYS',
    momentum: 'WEAK',
    candlePattern: null,
    volumeSignal: null,
  };

  if (data.length < 15) return flatSignal;

  // 1. Analyze current timeframe
  const tfVerdict = analyzeTimeframe(data);

  // 2. Analyze higher timeframe if available
  let higherTFVerdict: TimeframeVerdict | null = null;
  if (higherTFData && higherTFData.length >= 20) {
    higherTFVerdict = analyzeTimeframe(higherTFData);
  }

  // 3. Key levels
  const levels = findKeyLevels(data);
  const { nearestSupport, nearestResistance } = levels;

  // 4. ATR for stop/target calculation
  const atrValues = ATR(highs, lows, closes, 14);
  const lastATR = atrValues[atrValues.length - 1];
  const atr = isNaN(lastATR) ? currentPrice * 0.02 : lastATR;

  // 5. Trend determination
  const ema9 = EMA(closes, 9);
  const ema21 = EMA(closes, 21);
  const lastEma9 = ema9[ema9.length - 1];
  const lastEma21 = ema21[ema21.length - 1];
  const adxValues = ADX(highs, lows, closes, 14);
  const lastADX = adxValues[adxValues.length - 1];
  const trendStrength = isNaN(lastADX) ? 20 : lastADX;

  let trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' = 'SIDEWAYS';
  if (!isNaN(lastEma9) && !isNaN(lastEma21)) {
    if (lastEma9 > lastEma21 && currentPrice > lastEma9) trend = 'BULLISH';
    else if (lastEma9 < lastEma21 && currentPrice < lastEma9) trend = 'BEARISH';
  }

  // 6. Momentum
  const rsiValues = RSI(closes, 14);
  const lastRSI = rsiValues[rsiValues.length - 1] || 50;
  const macdResult = MACD(closes);
  const lastHist = macdResult.histogram[macdResult.histogram.length - 1];
  const prevHist = macdResult.histogram[macdResult.histogram.length - 2];

  let momentum: 'STRONG' | 'MODERATE' | 'WEAK' = 'WEAK';
  const momentumScore = Math.abs(tfVerdict.score);
  if (momentumScore > 50 && trendStrength > 25) momentum = 'STRONG';
  else if (momentumScore > 25) momentum = 'MODERATE';

  // 7. Candle pattern detection
  const candlePattern = detectCandlePatterns(data);
  const patternName = candlePattern ? candlePattern.name : null;

  // 8. Volume analysis
  const volumeAnalysis = analyzeVolume(data);

  // 9. Multi-timeframe consensus
  const mtf: MultiTimeframeResult = {
    consensus: 'NEUTRAL',
    alignment: 0,
  };

  const scores: number[] = [tfVerdict.score];
  if (higherTFVerdict) {
    scores.push(higherTFVerdict.score * 0.7);
  }

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Candle pattern bonus to avgScore
  let adjustedScore = avgScore;
  if (candlePattern) {
    if (candlePattern.signal === 'BULLISH') adjustedScore += candlePattern.strength * 1.5;
    else if (candlePattern.signal === 'BEARISH') adjustedScore -= candlePattern.strength * 1.5;
  }

  // Volume spike bonus
  if (volumeAnalysis.isVolumeSpike) {
    if (volumeAnalysis.signal?.includes('BULLISH')) adjustedScore += 8;
    else if (volumeAnalysis.signal?.includes('BEARISH')) adjustedScore -= 8;
  }

  const alignment = Math.min(100, Math.abs(adjustedScore) * 1.2);

  // LOWERED consensus thresholds
  if (adjustedScore > 25) mtf.consensus = 'STRONG_LONG';
  else if (adjustedScore > 8) mtf.consensus = 'LONG';
  else if (adjustedScore < -25) mtf.consensus = 'STRONG_SHORT';
  else if (adjustedScore < -8) mtf.consensus = 'SHORT';
  else mtf.consensus = 'NEUTRAL';
  mtf.alignment = Math.round(alignment);

  // Assign timeframe verdicts
  if (timeframe === '1m') {
    mtf.m5 = tfVerdict; // 1m maps closest to m5
    if (higherTFVerdict) mtf.m15 = higherTFVerdict;
  } else if (timeframe === '5m') {
    mtf.m5 = tfVerdict;
    if (higherTFVerdict) mtf.m15 = higherTFVerdict;
  } else if (timeframe === '15m') {
    mtf.m15 = tfVerdict;
    if (higherTFVerdict) mtf.h1 = higherTFVerdict;
  } else if (timeframe === '1h') {
    mtf.h1 = tfVerdict;
    if (higherTFVerdict) mtf.h4 = higherTFVerdict;
  } else if (timeframe === '4h') {
    mtf.h4 = tfVerdict;
  }

  // 10. Determine direction — LOWERED THRESHOLDS (was ±5, now ±2)
  const isLong = adjustedScore > 2;
  const isShort = adjustedScore < -2;
  const isFlat = !isLong && !isShort;

  if (isFlat) {
    flatSignal.trend = trend;
    flatSignal.momentum = momentum;
    flatSignal.multiTimeframe = mtf;
    flatSignal.atr = atr;
    flatSignal.support = nearestSupport;
    flatSignal.resistance = nearestResistance;
    flatSignal.indicators = buildIndicatorList(data);
    flatSignal.candlePattern = patternName;
    flatSignal.volumeSignal = volumeAnalysis.description;
    return flatSignal;
  }

  const direction: 'LONG' | 'SHORT' = isLong ? 'LONG' : 'SHORT';

  // ============================================
  // SMART ENTRY v2: STRATEGIC LIMIT ORDER AT REALISTIC PULLBACK LEVEL
  // ============================================
  // Philosophy: A good trader NEVER chases the market. They wait for price to come to them.
  // KEY PRINCIPLE: Enter at a pullback level, place stop BEYOND the structure that invalidates the trade.
  // For LONG: enter on a pullback to EMA/Fib/VWAP, stop below the recent swing low
  // For SHORT: enter on a bounce to EMA/Fib/VWAP, stop above the recent swing high
  
  // Find recent swing points for stop placement
  const swingLow = findLastSwingLow(data);
  const swingHigh = findLastSwingHigh(data);

  // Pullback zone: last 20 candles range for Fib calculations
  const lookback = Math.min(data.length, 40);
  const recentLows = data.slice(-lookback).map(d => d.low);
  const recentHighs = data.slice(-lookback).map(d => d.high);
  const recentLow = Math.min(...recentLows);
  const recentHigh = Math.max(...recentHighs);

  let entry: number;
  let entryType: 'LIMIT' | 'MARKET' = 'LIMIT';
  let entryReason: string;

  // Calculate pullback targets — these are the "ideal" entry zones
  if (direction === 'LONG') {
    // For LONG: we want to buy on a pullback (dip) to a dynamic level
    // DO NOT use support as entry — support is where the STOP goes!
    // Entry levels: EMA21, VWAP, Fib retracements
    const pullbackToEMA = lastEma21;                      // Entry at EMA21 (dynamic support)
    const pullbackToVWAP = volumeAnalysis.vwap;           // Entry at VWAP (fair value)
    const fib382 = currentPrice - (recentHigh - recentLow) * 0.382;  // 38.2% retracement
    const fib50 = currentPrice - (recentHigh - recentLow) * 0.5;     // 50% retracement
    const fib618 = currentPrice - (recentHigh - recentLow) * 0.618;  // 61.8% retracement

    // Collect all valid candidates that are BELOW current price (buy the dip)
    // Sort by distance from current price — pick the CLOSEST realistic level (not the farthest)
    const candidates = [
      { price: pullbackToEMA, reason: 'Откат к EMA21 — динамическая поддержка', minDist: 0.001 },
      { price: pullbackToVWAP, reason: 'Откат к VWAP — справедливая цена дня', minDist: 0.001 },
      { price: fib382, reason: 'Откат 38.2% Фибоначчи — мелкий откат', minDist: 0.002 },
      { price: fib50, reason: 'Откат 50% Фибоначчи — стандартный откат', minDist: 0.003 },
      { price: fib618, reason: 'Откат 61.8% Фибоначчи — глубокий откат', minDist: 0.004 },
    ]
      .filter(c => !isNaN(c.price) && c.price > 0 && c.price < currentPrice * (1 - c.minDist))
      .sort((a, b) => (currentPrice - a.price) - (currentPrice - b.price)); // Closest first

    if (candidates.length > 0) {
      // Pick the closest level to current price that is still meaningfully below it
      // This gives the best risk:reward while being realistic
      entry = candidates[0].price;
      entryType = 'LIMIT';
      entryReason = candidates[0].reason;
    } else {
      // No pullback level found below price — use ATR-based pullback
      // Still use LIMIT, never MARKET for LONG
      entry = currentPrice - atr * 0.5;
      entryType = 'LIMIT';
      entryReason = 'Лимитный ордер на откате (0.5 ATR от текущей цены)';
    }
  } else {
    // For SHORT: we want to sell on a bounce (rip) to a dynamic level
    // DO NOT use resistance as entry — resistance is where the STOP goes!
    const bounceToEMA = lastEma21;                         // Entry at EMA21 (dynamic resistance)
    const bounceToVWAP = volumeAnalysis.vwap;              // Entry at VWAP (fair value)
    const fib382 = currentPrice + (recentHigh - recentLow) * 0.382;  // 38.2% retracement up
    const fib50 = currentPrice + (recentHigh - recentLow) * 0.5;     // 50% retracement up
    const fib618 = currentPrice + (recentHigh - recentLow) * 0.618;  // 61.8% retracement up

    const candidates = [
      { price: bounceToEMA, reason: 'Откат к EMA21 — динамическое сопротивление', minDist: 0.001 },
      { price: bounceToVWAP, reason: 'Откат к VWAP — справедливая цена дня', minDist: 0.001 },
      { price: fib382, reason: 'Откат 38.2% Фибоначчи — мелкий откат', minDist: 0.002 },
      { price: fib50, reason: 'Откат 50% Фибоначчи — стандартный откат', minDist: 0.003 },
      { price: fib618, reason: 'Откат 61.8% Фибоначчи — глубокий откат', minDist: 0.004 },
    ]
      .filter(c => !isNaN(c.price) && c.price > 0 && c.price > currentPrice * (1 + c.minDist))
      .sort((a, b) => (a.price - currentPrice) - (b.price - currentPrice)); // Closest first

    if (candidates.length > 0) {
      entry = candidates[0].price;
      entryType = 'LIMIT';
      entryReason = candidates[0].reason;
    } else {
      entry = currentPrice + atr * 0.5;
      entryType = 'LIMIT';
      entryReason = 'Лимитный ордер на откате (0.5 ATR от текущей цены)';
    }
  }

  // Stop loss: placed BEYOND the structural invalidation point (swing high/low), NOT just ATR
  // For intraday crypto: minimum 1.0% from entry to avoid noise
  const minSlPct = 0.01; // 1.0% minimum SL distance for crypto — 0.5% gets hit by normal volatility
  let stopLoss: number;
  if (direction === 'LONG') {
    // For LONG: stop below the last swing low + buffer
    const structuralStop = swingLow - atr * 0.3;
    const atrStop = entry - atr * 2.0;              // Wider ATR stop (2.0 ATR for crypto)
    const supportStop = nearestSupport - atr * 0.2;
    const minPctStop = entry * (1 - minSlPct);       // At least 1.0% below entry
    
    stopLoss = Math.max(
      Math.min(structuralStop, supportStop),
      atrStop,
      minPctStop                                      // Enforce minimum distance
    );
    if (entry - stopLoss < atr * 1.0) stopLoss = entry - atr * 1.5;
    // Final safety: ensure at least 1.0% distance
    if ((entry - stopLoss) / entry < minSlPct) stopLoss = entry * (1 - minSlPct);
  } else {
    // For SHORT: stop above the last swing high + buffer
    const structuralStop = swingHigh + atr * 0.3;
    const atrStop = entry + atr * 2.0;
    const resistanceStop = nearestResistance + atr * 0.2;
    const minPctStop = entry * (1 + minSlPct);       // At least 1.0% above entry
    
    stopLoss = Math.min(
      Math.max(structuralStop, resistanceStop),
      atrStop,
      minPctStop
    );
    if (stopLoss - entry < atr * 1.0) stopLoss = entry + atr * 1.5;
    if ((stopLoss - entry) / entry < minSlPct) stopLoss = entry * (1 + minSlPct);
  }

  // Take profit levels based on R:R — calculated from ENTRY, not current price
  const risk = Math.abs(entry - stopLoss);
  const takeProfit1 = direction === 'LONG' ? entry + risk * 1.5 : entry - risk * 1.5;
  const takeProfit2 = direction === 'LONG' ? entry + risk * 2.5 : entry - risk * 2.5;
  const takeProfit3 = direction === 'LONG' ? entry + risk * 4 : entry - risk * 4;

  const reward = Math.abs(takeProfit2 - entry);
  const riskReward = risk > 0 ? reward / risk : 0;

  // Hold duration based on timeframe
  const holdDurationHours: number =
    timeframe === '1m' ? 0.5 :
    timeframe === '5m' ? 1 :
    timeframe === '15m' ? 3 :
    timeframe === '1h' ? 8 :
    timeframe === '4h' ? 24 :
    12;

  const holdDuration = holdDurationHours <= 0.5 ? `${holdDurationHours * 60}-${holdDurationHours * 60 + 15} мин` :
                       holdDurationHours <= 2 ? `${holdDurationHours * 60 - 15}-${holdDurationHours * 60 + 30} мин` :
                       holdDurationHours <= 6 ? `${holdDurationHours - 1}-${holdDurationHours + 2} ч` :
                       holdDurationHours <= 12 ? `${holdDurationHours - 2}-${holdDurationHours + 4} ч` :
                       `${Math.round(holdDurationHours / 24 * 10) / 10}-${Math.round((holdDurationHours / 24 + 1) * 10) / 10} дня`;

  // Confidence calculation — IMPROVED
  let confidence = 0;
  confidence += Math.min(35, Math.abs(adjustedScore) * 0.45); // TF score
  confidence += trend === (direction === 'LONG' ? 'BULLISH' : 'BEARISH') ? 15 : trend === 'SIDEWAYS' ? 5 : 0;
  confidence += momentum === 'STRONG' ? 15 : momentum === 'MODERATE' ? 8 : 0;
  confidence += higherTFVerdict ? (higherTFVerdict.direction === (direction === 'LONG' ? 'BULLISH' : 'BEARISH') ? 15 : 0) : 5;
  confidence += riskReward >= 3 ? 10 : riskReward >= 2 ? 5 : 0;
  // Bonus for candle pattern
  if (candlePattern && candlePattern.signal === (direction === 'LONG' ? 'BULLISH' : 'BEARISH')) {
    confidence += candlePattern.strength * 1.5;
  }
  // Bonus for volume confirmation
  if (volumeAnalysis.isVolumeSpike && volumeAnalysis.signal?.includes(direction === 'LONG' ? 'BULLISH' : 'BEARISH')) {
    confidence += 8;
  }
  // Bonus for VWAP confirmation
  if (direction === 'LONG' && volumeAnalysis.vwapPosition === 'ABOVE') confidence += 5;
  if (direction === 'SHORT' && volumeAnalysis.vwapPosition === 'BELOW') confidence += 5;

  confidence = Math.min(95, Math.max(10, Math.round(confidence)));

  // Build reasons and warnings
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Add entry reason first — most important
  reasons.push(entryReason);

  if (direction === 'LONG') {
    if (trend === 'BULLISH') reasons.push('Восходящий тренд подтверждён EMA');
    if (!isNaN(lastRSI) && lastRSI < 40) reasons.push(`RSI ${lastRSI.toFixed(0)} — потенциал роста`);
    if (!isNaN(lastHist) && !isNaN(prevHist) && lastHist > prevHist && lastHist > 0) reasons.push('MACD гистограмма растёт');
    { const mv = macdResult.macd[macdResult.macd.length - 1]; const sv = macdResult.signal[macdResult.signal.length - 1]; if (!isNaN(mv) && !isNaN(sv) && mv > sv) reasons.push('MACD выше сигнальной'); }
    if (higherTFVerdict?.direction === 'BULLISH') reasons.push('Старший ТФ подтверждает рост');
    if (currentPrice <= nearestSupport * 1.005) reasons.push('Цена у уровня поддержки — отбой');
    if (trendStrength > 25) reasons.push(`ADX ${trendStrength.toFixed(0)} — тренд сильный`);
    if (candlePattern && candlePattern.signal === 'BULLISH') reasons.push(`Свечной паттерн: ${candlePattern.name}`);
    if (volumeAnalysis.isVolumeSpike) reasons.push(`Объём x${volumeAnalysis.volumeRatio.toFixed(1)} — подтверждение`);
    if (volumeAnalysis.vwapPosition === 'ABOVE') reasons.push('Цена выше VWAP — бычий настрой');
    if (volumeAnalysis.obvTrend === 'RISING') reasons.push('OBV растёт — накопление');
  } else {
    if (trend === 'BEARISH') reasons.push('Нисходящий тренд подтверждён EMA');
    if (!isNaN(lastRSI) && lastRSI > 60) reasons.push(`RSI ${lastRSI.toFixed(0)} — потенциал снижения`);
    if (!isNaN(lastHist) && !isNaN(prevHist) && lastHist < prevHist && lastHist < 0) reasons.push('MACD гистограмма падает');
    const macdVal = macdResult.macd[macdResult.macd.length - 1];
    const sigVal = macdResult.signal[macdResult.signal.length - 1];
    if (!isNaN(macdVal) && !isNaN(sigVal) && macdVal < sigVal) reasons.push('MACD ниже сигнальной');
    if (higherTFVerdict?.direction === 'BEARISH') reasons.push('Старший ТФ подтверждает снижение');
    if (currentPrice >= nearestResistance * 0.995) reasons.push('Цена у сопротивления — отбой');
    if (trendStrength > 25) reasons.push(`ADX ${trendStrength.toFixed(0)} — тренд сильный`);
    if (candlePattern && candlePattern.signal === 'BEARISH') reasons.push(`Свечной паттерн: ${candlePattern.name}`);
    if (volumeAnalysis.isVolumeSpike) reasons.push(`Объём x${volumeAnalysis.volumeRatio.toFixed(1)} — подтверждение`);
    if (volumeAnalysis.vwapPosition === 'BELOW') reasons.push('Цена ниже VWAP — медвежий настрой');
    if (volumeAnalysis.obvTrend === 'FALLING') reasons.push('OBV падает — распределение');
  }

  if (confidence < 40) warnings.push('Низкая уверенность — используйте меньший размер позиции');
  if (trend === 'SIDEWAYS') warnings.push('Рынок в боковике — выше риск ложного пробоя');
  if (riskReward < 1.5) warnings.push('R:R ниже 1.5 — риск не оправдывает потенциальную прибыль');
  if (trendStrength < 20) warnings.push('Слабый тренд (ADX < 20) — возможен флэт');
  if (higherTFVerdict && ((direction === 'LONG' && higherTFVerdict.direction === 'BEARISH') ||
      (direction === 'SHORT' && higherTFVerdict.direction === 'BULLISH'))) {
    warnings.push('ВНИМАНИЕ: старший ТФ противоречит сигналу!');
  }
  if (!isNaN(lastRSI) && direction === 'LONG' && lastRSI > 70) warnings.push('RSI высокий — покупка на хаях рискованна');
  if (!isNaN(lastRSI) && direction === 'SHORT' && lastRSI < 30) warnings.push('RSI низкий — продажа на лоях рискованна');
  // Warning for LIMIT orders: price hasn't reached entry yet
  if (entryType === 'LIMIT') {
    const distPct = Math.abs(currentPrice - entry) / currentPrice * 100;
    if (distPct > 0.5) warnings.push(`Лимитный ордер — ждите отката ${distPct.toFixed(1)}% до уровня входа`);
  }

  // Build indicators
  const indicators = buildIndicatorList(data);

  return {
    direction,
    confidence,
    entry,
    entryType,
    entryReason,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    riskReward: Math.round(riskReward * 100) / 100,
    holdDuration,
    holdDurationHours,
    reasons,
    warnings,
    indicators,
    multiTimeframe: mtf,
    currentPrice,
    atr,
    support: nearestSupport,
    resistance: nearestResistance,
    trend,
    momentum,
    candlePattern: patternName,
    volumeSignal: volumeAnalysis.description,
  };
}

function buildIndicatorList(data: OHLCV[]): IndicatorResult[] {
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);
  const currentPrice = closes[closes.length - 1];
  const indicators: IndicatorResult[] = [];

  // RSI
  const rsi = RSI(closes, 14);
  const lastRSI = rsi[rsi.length - 1];
  if (!isNaN(lastRSI)) {
    indicators.push({
      name: 'RSI (14)',
      value: lastRSI.toFixed(1),
      signal: lastRSI < 30 ? 'BUY' : lastRSI > 70 ? 'SELL' : 'NEUTRAL',
      description: lastRSI < 30 ? 'Перепроданность' : lastRSI > 70 ? 'Перекупленность' : 'Нейтрально',
      weight: 20,
    });
  }

  // MACD
  const macd = MACD(closes);
  const lastMacd = macd.macd[macd.macd.length - 1];
  const lastSig = macd.signal[macd.signal.length - 1];
  if (!isNaN(lastMacd) && !isNaN(lastSig)) {
    indicators.push({
      name: 'MACD',
      value: lastMacd.toFixed(4),
      signal: lastMacd > lastSig ? 'BUY' : 'SELL',
      description: lastMacd > lastSig ? 'Бычий' : 'Медвежий',
      weight: 20,
    });
  }

  // EMA
  const ema9 = EMA(closes, 9);
  const ema21 = EMA(closes, 21);
  const e9 = ema9[ema9.length - 1];
  const e21 = ema21[ema21.length - 1];
  if (!isNaN(e9) && !isNaN(e21)) {
    indicators.push({
      name: 'EMA 9/21',
      value: `${formatTP(e9)} / ${formatTP(e21)}`,
      signal: e9 > e21 ? 'BUY' : 'SELL',
      description: e9 > e21 ? 'Восходящий' : 'Нисходящий',
      weight: 20,
    });
  }

  // Bollinger
  const bb = BollingerBands(closes, Math.min(20, Math.floor(closes.length * 0.6)), 2);
  const bbU = bb.upper[bb.upper.length - 1];
  const bbL = bb.lower[bb.lower.length - 1];
  if (!isNaN(bbU) && !isNaN(bbL)) {
    const pos = ((currentPrice - bbL) / (bbU - bbL)) * 100;
    indicators.push({
      name: 'Bollinger',
      value: `${pos.toFixed(0)}%`,
      signal: pos < 20 ? 'BUY' : pos > 80 ? 'SELL' : 'NEUTRAL',
      description: pos < 20 ? 'У нижней полосы' : pos > 80 ? 'У верхней полосы' : 'В середине',
      weight: 15,
    });
  }

  // Stochastic
  const stoch = Stochastic(highs, lows, closes, 14, 3);
  const lastK = stoch.k[stoch.k.length - 1];
  if (!isNaN(lastK)) {
    indicators.push({
      name: 'Stochastic',
      value: lastK.toFixed(1),
      signal: lastK < 20 ? 'BUY' : lastK > 80 ? 'SELL' : 'NEUTRAL',
      description: lastK < 20 ? 'Перепроданность' : lastK > 80 ? 'Перекупленность' : 'Нейтрально',
      weight: 15,
    });
  }

  // ATR
  const atrVal = ATR(highs, lows, closes, 14);
  const lastATR = atrVal[atrVal.length - 1];
  if (!isNaN(lastATR)) {
    const atrPct = (lastATR / currentPrice) * 100;
    indicators.push({
      name: 'ATR (14)',
      value: `${formatTP(lastATR)} (${atrPct.toFixed(2)}%)`,
      signal: 'NEUTRAL',
      description: atrPct > 3 ? 'Высокая волатильность' : atrPct > 1 ? 'Умеренная волатильность' : 'Низкая волатильность',
      weight: 10,
    });
  }

  // VWAP (NEW!)
  if (data.length >= 20) {
    const vwap = VWAP(data);
    const lastVwap = vwap[vwap.length - 1];
    if (!isNaN(lastVwap) && lastVwap > 0) {
      const vwapPos = ((currentPrice - lastVwap) / lastVwap * 100);
      indicators.push({
        name: 'VWAP',
        value: `${formatTP(lastVwap)} (${vwapPos >= 0 ? '+' : ''}${vwapPos.toFixed(2)}%)`,
        signal: currentPrice > lastVwap ? 'BUY' : 'SELL',
        description: currentPrice > lastVwap ? 'Цена выше VWAP' : 'Цена ниже VWAP',
        weight: 15,
      });
    }
  }

  // Candle Pattern (NEW!)
  const pattern = detectCandlePatterns(data);
  if (pattern) {
    indicators.push({
      name: 'Паттерн',
      value: pattern.name,
      signal: pattern.signal === 'BULLISH' ? 'BUY' : pattern.signal === 'BEARISH' ? 'SELL' : 'NEUTRAL',
      description: pattern.description,
      weight: pattern.strength * 2,
    });
  }

  return indicators;
}

// ============================================
// COMPATIBLE SIGNAL GENERATOR (for existing API)
// ============================================

export function generateSignals(data: OHLCV[]): SignalResult {
  if (data.length < 10) {
    return {
      type: 'HOLD',
      strength: 0,
      indicators: [],
      summary: 'Недостаточно данных для анализа. Нужно минимум 10 свечей.'
    };
  }

  const tradeSignal = generateTradeSignal(data, '1h');
  const type: 'BUY' | 'SELL' | 'HOLD' =
    tradeSignal.direction === 'LONG' ? 'BUY' :
    tradeSignal.direction === 'SHORT' ? 'SELL' : 'HOLD';

  const strength = tradeSignal.confidence;

  const summary = tradeSignal.direction === 'LONG'
    ? `ЛОНГ @ ${formatTP(tradeSignal.entry)} | Стоп: ${formatTP(tradeSignal.stopLoss)} | Цель: ${formatTP(tradeSignal.takeProfit2)} | R:R ${tradeSignal.riskReward} | ${tradeSignal.holdDuration}`
    : tradeSignal.direction === 'SHORT'
    ? `ШОРТ @ ${formatTP(tradeSignal.entry)} | Стоп: ${formatTP(tradeSignal.stopLoss)} | Цель: ${formatTP(tradeSignal.takeProfit2)} | R:R ${tradeSignal.riskReward} | ${tradeSignal.holdDuration}`
    : 'Нет чёткого сигнала. Ожидайте подтверждения.';

  const closes = data.map(d => d.close);
  const currentPrice = closes[closes.length - 1];
  const levels = findKeyLevels(data);

  const forecast: PriceForecast = {
    direction: tradeSignal.direction === 'LONG' ? 'UP' : tradeSignal.direction === 'SHORT' ? 'DOWN' : 'SIDEWAYS',
    confidence: tradeSignal.confidence,
    targetPrice: tradeSignal.takeProfit2,
    supportLevel: tradeSignal.support,
    resistanceLevel: tradeSignal.resistance,
    shortTerm: tradeSignal.direction === 'LONG'
      ? `Рост до ${formatTP(tradeSignal.takeProfit2)} за ${tradeSignal.holdDuration}`
      : tradeSignal.direction === 'SHORT'
      ? `Снижение до ${formatTP(tradeSignal.takeProfit2)} за ${tradeSignal.holdDuration}`
      : 'Боковое движение, ждать сигнала',
    mediumTerm: tradeSignal.trend === 'BULLISH' ? 'Восходящий тренд' : tradeSignal.trend === 'BEARISH' ? 'Нисходящий тренд' : 'Флэт',
    longTerm: tradeSignal.momentum === 'STRONG' ? 'Сильный импульс' : 'Умеренное движение',
  };

  return {
    type,
    strength,
    indicators: tradeSignal.indicators,
    summary,
    forecast,
    tradeSignal,
  };
}

// ============================================
// CHART DATA FORMATTING
// ============================================

export function formatChartData(data: OHLCV[]) {
  const closes = data.map(d => d.close);
  const ema9 = EMA(closes, 9);
  const ema21 = EMA(closes, Math.min(21, Math.floor(closes.length * 0.7)));
  const sma20 = SMA(closes, Math.min(20, Math.floor(closes.length * 0.7)));
  const bbPeriod = Math.min(20, Math.floor(closes.length * 0.7));
  const bb = bbPeriod >= 5 ? BollingerBands(closes, bbPeriod, 2) : { upper: [], middle: [], lower: [] };
  const rsi = RSI(closes, 14);
  const macd = MACD(closes);

  return data.map((d, i) => ({
    timestamp: d.timestamp,
    date: new Date(d.timestamp).toLocaleDateString('ru-RU'),
    time: new Date(d.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
    ema9: isNaN(ema9[i]) ? undefined : ema9[i],
    ema21: isNaN(ema21[i]) ? undefined : ema21[i],
    sma20: isNaN(sma20[i]) ? undefined : sma20[i],
    bbUpper: isNaN(bb.upper[i]) ? undefined : bb.upper[i],
    bbMiddle: isNaN(bb.middle[i]) ? undefined : bb.middle[i],
    bbLower: isNaN(bb.lower[i]) ? undefined : bb.lower[i],
    rsi: isNaN(rsi[i]) ? undefined : rsi[i],
    macd: isNaN(macd.macd[i]) ? undefined : macd.macd[i],
    macdSignal: isNaN(macd.signal[i]) ? undefined : macd.signal[i],
    macdHist: isNaN(macd.histogram[i]) ? undefined : macd.histogram[i],
  }));
}

function formatTP(price: number): string {
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  if (price >= 0.01) return price.toFixed(5);
  return price.toFixed(8);
}
