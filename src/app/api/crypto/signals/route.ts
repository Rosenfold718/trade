import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import {
  generateSignals,
  generateTradeSignal,
  analyzeMultiTimeframe,
  formatChartData,
  type OHLCV,
} from '@/lib/technical-analysis';
import {
  BINANCE_BASE,
  COINGECKO_BASE,
  BYBIT_BASE,
  COINGECKO_TO_BINANCE,
  COINGECKO_TO_BYBIT,
  getBinanceSymbol,
  getBybitSymbol,
  getBybitInterval,
} from '@/lib/api-sources';
import { fetchSentimentData, calculateSentimentAdjustment } from '@/lib/sentiment-engine';

// Convert CoinGecko market_chart data to OHLCV (daily)
function marketChartToOHLCV(prices: number[][], volumes: number[][]): OHLCV[] {
  if (prices.length === 0) return [];
  const dayMap = new Map<string, { timestamp: number; open: number; high: number; low: number; close: number; volume: number }>();
  for (let i = 0; i < prices.length; i++) {
    const ts = prices[i][0];
    const price = prices[i][1];
    const vol = i < volumes.length ? volumes[i][1] : 0;
    const dateKey = new Date(ts).toISOString().split('T')[0];
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { timestamp: ts, open: price, high: price, low: price, close: price, volume: vol });
    } else {
      const candle = dayMap.get(dateKey)!;
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += vol;
    }
  }
  return Array.from(dayMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Convert CoinGecko market_chart data to hourly OHLCV
function hourlyToOHLCV(prices: number[][], volumes: number[][]): OHLCV[] {
  if (prices.length === 0) return [];
  const hourMap = new Map<number, { timestamp: number; open: number; high: number; low: number; close: number; volume: number }>();
  for (let i = 0; i < prices.length; i++) {
    const ts = prices[i][0];
    const price = prices[i][1];
    const vol = i < volumes.length ? volumes[i][1] : 0;
    const hourKey = Math.floor(ts / 3600000) * 3600000;
    if (!hourMap.has(hourKey)) {
      hourMap.set(hourKey, { timestamp: hourKey, open: price, high: price, low: price, close: price, volume: vol });
    } else {
      const candle = hourMap.get(hourKey)!;
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += vol;
    }
  }
  return Array.from(hourMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Fetch OHLCV from multiple sources with fallback
// CRITICAL: Bybit first (Binance geo-blocked on Vercel → 451)
async function fetchOHLCV(coinId: string, interval: string, limit: number): Promise<{ data: OHLCV[]; source: string }> {
  const timeoutMs = 5000;

  // Determine proper CoinGecko days based on interval
  const cgDays: Record<string, number> = { '1m': 1, '5m': 1, '15m': 1, '1h': 7, '4h': 30 };
  const daysParam = cgDays[interval] || 1;

  // Strategy 1: Bybit (primary — works from US/Vercel)
  const bybitSymbol = getBybitSymbol(coinId);
  if (bybitSymbol) {
    try {
      const symbol = bybitSymbol + 'USDT';
      const bybitInterval = getBybitInterval(interval);
      const bybitLimit = Math.min(limit, 200);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const response = await fetch(
        `${BYBIT_BASE}/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${bybitLimit}`,
        { cache: 'no-store', signal: ctrl.signal }
      );
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        if (data.retCode === 0 && data.result?.list?.length > 0) {
          const klines = [...data.result.list].reverse();
          const ohlcv = klines.map((k: string[]) => ({
            timestamp: parseFloat(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          }));
          return { data: ohlcv, source: 'bybit' };
        }
      }
    } catch { /* try next */ }
  }

  // Strategy 2: Binance (fallback — may 451 from US)
  const binanceSymbol = getBinanceSymbol(coinId);
  if (binanceSymbol) {
    try {
      const symbol = binanceSymbol + 'USDT';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const response = await fetch(
        `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { cache: 'no-store', signal: ctrl.signal }
      );
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0 && !(data as any).code) {
          const ohlcv = data.map((k: any[]) => ({
            timestamp: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          }));
          return { data: ohlcv, source: 'binance' };
        }
      }
    } catch { /* try next */ }
  }

  // Strategy 3: CoinGecko OHLCV
  try {
    const ctrl3 = new AbortController();
    const timer3 = setTimeout(() => ctrl3.abort(), timeoutMs);
    const cgResponse = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/ohlcv?vs_currency=usd&days=${daysParam}`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl3.signal }
    );
    clearTimeout(timer3);
    if (cgResponse.ok) {
      const data = await cgResponse.json();
      if (Array.isArray(data) && data.length > 0 && !(data as any).status) {
        const ohlcv = data.map((candle: number[]) => ({
          timestamp: candle[0], open: candle[1], high: candle[2],
          low: candle[3], close: candle[4], volume: candle[5] || 0,
        }));
        return { data: ohlcv, source: 'coingecko-ohlcv' };
      }
    }
  } catch { /* try next */ }

  // Strategy 4: CoinGecko market_chart
  try {
    const ctrl4 = new AbortController();
    const timer4 = setTimeout(() => ctrl4.abort(), timeoutMs);
    const chartResponse = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${daysParam}`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl4.signal }
    );
    clearTimeout(timer4);
    if (chartResponse.ok) {
      const data = await chartResponse.json();
      if (data.prices && Array.isArray(data.prices) && data.prices.length > 0) {
        const prices: number[][] = data.prices;
        const volumes: number[][] = data.total_volumes || [];
        const ohlcv = hourlyToOHLCV(prices, volumes);
        if (ohlcv.length > 0) return { data: ohlcv, source: 'coingecko-chart' };
      }
    }
  } catch { /* all strategies failed */ }

  return { data: [], source: '' };
}

// In-memory cache with size limit
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30s for intraday data
const MAX_CACHE_SIZE = 50;

function cleanCache() {
  if (cache.size > MAX_CACHE_SIZE) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) keysToDelete.push(key);
    }
    keysToDelete.forEach(k => cache.delete(k));
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < entries.length - MAX_CACHE_SIZE / 2; i++) {
        cache.delete(entries[i][0]);
      }
    }
  }
  if (global.gc) global.gc();
}

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(`api:signals:${clientIp}`, RATE_LIMITS.signals);
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json({ error: 'Rate limit exceeded', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('coin') || 'bitcoin';
    const interval = searchParams.get('interval') || '1h';
    const days = searchParams.get('days') || '1';
    const skipMultiTF = searchParams.get('skipMultiTF') === 'true'; // allow disabling 4-TF for speed

    const cacheKey = `${id}-${interval}-${days}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
    }

    // Determine candle limits based on interval
    let limit: number;
    let currentInterval: string;
    switch (interval) {
      case '1m':
        limit = 200;
        currentInterval = '1m';
        break;
      case '5m':
        limit = 200;
        currentInterval = '5m';
        break;
      case '15m':
        limit = 200;
        currentInterval = '15m';
        break;
      case '1h':
        limit = 168;
        currentInterval = '1h';
        break;
      case '4h':
        limit = 180;
        currentInterval = '4h';
        break;
      default:
        const d = parseInt(days);
        if (d <= 1) { limit = 48; currentInterval = '1h'; }
        else if (d <= 3) { limit = 72; currentInterval = '1h'; }
        else { limit = 84; currentInterval = '4h'; }
    }

    // Fetch current timeframe data
    const { data: ohlcvData, source } = await fetchOHLCV(id, currentInterval, limit);

    if (ohlcvData.length === 0) {
      return NextResponse.json(
        { error: 'Данные временно недоступны. Попробуйте обновить или выберите другую монету.' },
        { status: 404 }
      );
    }

    // Generate the trade signal with single higher-TF (backward-compatible, fast path)
    const tradeSignal = generateTradeSignal(ohlcvData, currentInterval);

    // === 4-TIMEFRAME ANALYSIS (async, optional) ===
    if (!skipMultiTF) {
      try {
        const mtfResult = await analyzeMultiTimeframe(id, currentInterval, ohlcvData);
        tradeSignal.multiTimeframe = mtfResult;
      } catch (e) {
        // If 4-TF fails, keep the existing single-TF result — no breakage
        console.warn('4-TF analysis failed, keeping single-TF result:', e);
      }
    }

    // Also generate the legacy signal for compatibility
    const signalResult = generateSignals(ohlcvData);
    const chartData = formatChartData(ohlcvData);

    // === SENTIMENT INTEGRATION ===
    let sentimentAdjustment: { confidenceModifier: number; positionSizeModifier: number; skipSignal: boolean; reason: string } | undefined;
    try {
      const sentimentData = await fetchSentimentData();
      if (sentimentData && tradeSignal.direction !== 'FLAT') {
        const adjustment = calculateSentimentAdjustment({
          fearGreedValue: sentimentData.fearGreedValue,
          overallSentiment: sentimentData.overallSentiment,
          trendDirection: tradeSignal.trend,
          regime: tradeSignal.multiTimeframe?.regime ?? 'RANGING',
        });

        sentimentAdjustment = {
          confidenceModifier: adjustment.confidenceModifier,
          positionSizeModifier: adjustment.positionSizeModifier,
          skipSignal: adjustment.skipSignal,
          reason: adjustment.reason,
        };

        // Apply confidence adjustment
        tradeSignal.confidence = Math.max(5, Math.min(99, tradeSignal.confidence + adjustment.confidenceModifier));

        // If sentiment says skip, flip to FLAT
        if (adjustment.skipSignal) {
          tradeSignal.direction = 'FLAT';
          tradeSignal.confidence = 0;
          tradeSignal.warnings.push(`Сигнал заблокирован настроениями: ${adjustment.reason}`);
        }
      }
    } catch {
      // Sentiment failure — keep original signal
    }

    const result = {
      signal: signalResult,
      tradeSignal,
      chartData,
      coinId: id,
      source,
      interval: currentInterval,
      candlesCount: ohlcvData.length,
      sentimentAdjustment: sentimentAdjustment ?? null,
    };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    cleanCache();

    return NextResponse.json(result, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
  } catch (error) {
    console.error('Signals API error:', error);
    return NextResponse.json({ error: 'Ошибка анализа. Попробуйте позже.' }, { status: 500 });
  }
}