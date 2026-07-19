import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import { BINANCE_BASE, getBinanceSymbol, getBinanceInterval } from '@/lib/api-sources';

// Types
interface OhlcvCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(`backtest-ohlcv:${clientIp}`, RATE_LIMITS.backtestOhlcv);

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
  const days = parseInt(searchParams.get('days') || '14', 10);

  if (isNaN(days) || days < 1 || days > 365) {
    return NextResponse.json({ error: 'Invalid days parameter. Must be between 1 and 365.' }, { status: 400 });
  }

  const startTime = Date.now() - days * 86_400_000;

  const binanceSymbol = getBinanceSymbol(coin);
  if (!binanceSymbol) {
    return NextResponse.json({ error: `Нет данных Binance для ${coin}` }, { status: 400 });
  }

  try {
    const binanceInterval = getBinanceInterval(interval);
    const allCandles: OhlcvCandle[] = [];
    let cursor = startTime;

    while (cursor < Date.now()) {
      const url = `${BINANCE_BASE}/klines?symbol=${binanceSymbol}USDT&interval=${binanceInterval}&startTime=${cursor}&endTime=${Date.now()}&limit=1000`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!resp.ok) throw new Error(`Binance returned ${resp.status}`);

      const rows: unknown[] = await resp.json();
      if (!Array.isArray(rows) || rows.length === 0) break;

      for (const row of rows) {
        const r = row as unknown[];
        allCandles.push({
          timestamp: Number(r[0]),
          open: parseFloat(String(r[1])),
          high: parseFloat(String(r[2])),
          low: parseFloat(String(r[3])),
          close: parseFloat(String(r[4])),
          volume: parseFloat(String(r[5])),
        });
        if (Number(r[0]) >= cursor) cursor = Number(r[0]) + 1;
      }

      if (rows.length < 1000) break;
    }

    if (allCandles.length < 20) {
      return NextResponse.json(
        { error: `Недостаточно данных: ${allCandles.length} свечей. Увеличьте количество дней.` },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { data: allCandles, source: 'binance' },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-RateLimit-Remaining': String(remaining),
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