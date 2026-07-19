import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { fetchHistoricalOHLCV } from '@/lib/fetch-ohlcv';
import { initCache, getCachedCandles, storeCandles } from '@/lib/turso-cache';

// 120s window, 10 requests — backtesting is infrequent but data-heavy
const TV_HISTORY_LIMIT = { windowMs: 120_000, maxRequests: 10 };

// Initialize cache table on first import (fire-and-forget)
let cacheInitialized = false;
async function ensureCache() {
  if (!cacheInitialized) {
    cacheInitialized = true;
    try { await initCache(); } catch { /* non-critical */ }
  }
}

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(
    `tv-history:${clientIp}`,
    TV_HISTORY_LIMIT,
  );

  if (!allowed) {
    const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Превышен лимит запросов. Повторите позже.', retryAfter: retryAfterSeconds },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const coin = searchParams.get('coin');

  if (!coin) {
    return NextResponse.json({ error: 'Missing coin parameter' }, { status: 400 });
  }

  const interval = searchParams.get('interval') || '1h';
  const days = parseInt(searchParams.get('days') || '90', 10);
  const nocache = searchParams.get('nocache') === 'true';

  const from = parseInt(searchParams.get('from') || '0', 10);
  const to = parseInt(searchParams.get('to') || String(Date.now()), 10);

  let startTime: number;
  let endTime: number;

  if (from > 0) {
    startTime = from;
    endTime = to;
  } else {
    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 365.' },
        { status: 400 },
      );
    }
    startTime = Date.now() - days * 86_400_000;
    endTime = Date.now();
  }

  try {
    // ── Step 1: Try Turso cache first ──
    if (!nocache) {
      await ensureCache();
      const { candles: cached, cachedCount } = await getCachedCandles(coin, interval, startTime, endTime);

      if (cachedCount >= 20) {
        // Check if cached data covers most of the requested range
        const cachedNewest = cached[cached.length - 1]?.timestamp || 0;
        const coveragePct = Math.min(100, (cached.length / Math.max(1, days * 24)) * 100);

        // If we have good coverage (> 60%) and data is fresh (within 2 intervals), return cache
        const intervalMs = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
        const iMs = intervalMs[interval] || 3600000;
        const isFresh = (Date.now() - cachedNewest) < iMs * 3;

        if (coveragePct > 60 && isFresh) {
          return NextResponse.json(
            { data: cached, source: 'turso-cache', count: cached.length, cachedCount },
            {
              headers: {
                'Cache-Control': 'public, max-age=300',
                'X-RateLimit-Remaining': String(remaining),
                'X-Data-Source': 'turso-cache',
              },
            },
          );
        }
      }
    }

    // ── Step 2: Fetch from API (Bybit → Binance) ──
    const { data, source } = await fetchHistoricalOHLCV(coin, interval, startTime, endTime);

    if (data.length < 20) {
      return NextResponse.json(
        { error: `Недостаточно данных: ${data.length} свечей (источник: ${source || 'нет'}). Увеличьте количество дней.`, count: data.length },
        { status: 422 },
      );
    }

    // ── Step 3: Store in Turso cache (fire-and-forget) ──
    if (!nocache && data.length > 0) {
      try {
        await ensureCache();
        // Don't await — store in background
        storeCandles(coin, interval, data.map(d => ({
          timestamp: d.timestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
        })), source).catch(() => {});
      } catch { /* non-critical */ }
    }

    return NextResponse.json(
      { data, source: source || 'unknown', count: data.length },
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'X-RateLimit-Remaining': String(remaining),
          'X-Data-Source': source || 'unknown',
        },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Ошибка получения данных: ${message}` },
      { status: 502 },
    );
  }
}