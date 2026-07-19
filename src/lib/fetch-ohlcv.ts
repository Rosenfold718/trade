// Shared OHLCV fetch utility
// CRITICAL: Binance is geo-blocked on Vercel (US servers) → returns 451
// Bybit must be tried FIRST to avoid 5-8s timeout per request

import { BYBIT_BASE, BINANCE_BASE, COINGECKO_BASE, getBybitSymbol, getBinanceSymbol, getBybitInterval, getBinanceInterval } from './api-sources';

export interface OhlcvCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch OHLCV candles for a single timeframe.
 * Order: Bybit → Binance → CoinGecko OHLCV → CoinGecko market_chart
 */
export async function fetchOHLCV(
  coinId: string,
  interval: string,
  limit: number,
  timeoutMs = 6000,
): Promise<{ data: OhlcvCandle[]; source: string }> {
  // ── 1. Bybit (primary — works from US) ──
  const bybitSymbol = getBybitSymbol(coinId);
  if (bybitSymbol) {
    try {
      const bybitInterval = getBybitInterval(interval);
      const bybitLimit = Math.min(limit, 200);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const resp = await fetch(
        `${BYBIT_BASE}/kline?category=spot&symbol=${bybitSymbol}USDT&interval=${bybitInterval}&limit=${bybitLimit}`,
        { cache: 'no-store', signal: ctrl.signal },
      );
      clearTimeout(timer);
      if (resp.ok) {
        const json = await resp.json();
        if (json.retCode === 0 && json.result?.list?.length > 0) {
          const klines = [...json.result.list].reverse();
          const data: OhlcvCandle[] = klines.map((k: string[]) => ({
            timestamp: parseFloat(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
          if (data.length > 0) return { data, source: 'bybit' };
        }
      }
    } catch { /* fallthrough */ }
  }

  // ── 2. Binance (fallback — may 451 from US) ──
  const binanceSymbol = getBinanceSymbol(coinId);
  if (binanceSymbol) {
    try {
      const binanceInterval = getBinanceInterval(interval);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const resp = await fetch(
        `${BINANCE_BASE}/klines?symbol=${binanceSymbol}USDT&interval=${binanceInterval}&limit=${limit}`,
        { cache: 'no-store', signal: ctrl.signal },
      );
      clearTimeout(timer);
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json) && json.length > 0 && !(json as any).code) {
          const data: OhlcvCandle[] = json.map((k: any[]) => ({
            timestamp: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
          if (data.length > 0) return { data, source: 'binance' };
        }
      }
    } catch { /* fallthrough */ }
  }

  // ── 3. CoinGecko OHLCV ──
  const cgDays: Record<string, number> = { '1m': 1, '5m': 1, '15m': 1, '30m': 1, '1h': 7, '2h': 14, '4h': 30, '6h': 30, '12h': 60, '1d': 365 };
  const days = cgDays[interval] || 7;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/ohlcv?vs_currency=usd&days=${days}`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (resp.ok) {
      const json = await resp.json();
      if (Array.isArray(json) && json.length > 0 && !(json as any).status) {
        const data: OhlcvCandle[] = json.map((c: number[]) => ({
          timestamp: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0,
        }));
        if (data.length > 0) return { data, source: 'coingecko' };
      }
    }
  } catch { /* fallthrough */ }

  return { data: [], source: '' };
}

/**
 * Fetch historical OHLCV with pagination for backtest.
 * Bybit max 200 candles per request, so we paginate with startTime.
 * Order: Bybit → Binance
 */
export async function fetchHistoricalOHLCV(
  coinId: string,
  interval: string,
  startTime: number,
  endTime: number,
  onProgress?: (fetched: number) => void,
): Promise<{ data: OhlcvCandle[]; source: string }> {
  const allCandles: OhlcvCandle[] = [];
  let source = '';

  // ── Try Bybit first (paginated) ──
  const bybitSymbol = getBybitSymbol(coinId);
  if (bybitSymbol) {
    try {
      const bybitInterval = getBybitInterval(interval);
      let cursor = startTime;

      while (cursor < endTime) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        const resp = await fetch(
          `${BYBIT_BASE}/kline?category=spot&symbol=${bybitSymbol}USDT&interval=${bybitInterval}&start=${cursor}&end=${endTime}&limit=200`,
          { cache: 'no-store', signal: ctrl.signal },
        );
        clearTimeout(timer);

        if (!resp.ok) break;

        const json = await resp.json();
        if (json.retCode !== 0 || !json.result?.list?.length) break;

        // Bybit returns newest first, reverse for chronological
        const klines = [...json.result.list].reverse();
        for (const k of klines) {
          const ts = parseFloat(k[0]);
          if (ts < cursor) continue; // avoid duplicates
          allCandles.push({
            timestamp: ts,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          });
          if (ts >= cursor) cursor = ts + 1;
        }

        onProgress?.(allCandles.length);

        if (klines.length < 200) break;
      }

      if (allCandles.length > 0) {
        source = 'bybit';
        return { data: allCandles, source };
      }
    } catch { /* fallthrough to Binance */ }
  }

  // ── Try Binance (paginated) ──
  const binanceSymbol = getBinanceSymbol(coinId);
  if (binanceSymbol) {
    try {
      const binanceInterval = getBinanceInterval(interval);
      let cursor = startTime;

      while (cursor < endTime) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        const resp = await fetch(
          `${BINANCE_BASE}/klines?symbol=${binanceSymbol}USDT&interval=${binanceInterval}&startTime=${cursor}&endTime=${endTime}&limit=1000`,
          { cache: 'no-store', signal: ctrl.signal },
        );
        clearTimeout(timer);

        if (!resp.ok) break;

        const json = await resp.json();
        if (!Array.isArray(json) || json.length === 0) break;

        for (const row of json) {
          const r = row as unknown[];
          const ts = Number(r[0]);
          allCandles.push({
            timestamp: ts,
            open: parseFloat(String(r[1])),
            high: parseFloat(String(r[2])),
            low: parseFloat(String(r[3])),
            close: parseFloat(String(r[4])),
            volume: parseFloat(String(r[5])),
          });
          if (ts >= cursor) cursor = ts + 1;
        }

        onProgress?.(allCandles.length);

        if (json.length < 1000) break;
      }

      if (allCandles.length > 0) {
        source = 'binance';
      }
    } catch { /* all strategies failed */ }
  }

  return { data: allCandles, source };
}