import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import { fetchHistoricalOHLCV } from '@/lib/fetch-ohlcv';

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
  const endTime = Date.now();

  try {
    const { data, source } = await fetchHistoricalOHLCV(coin, interval, startTime, endTime);

    if (data.length < 20) {
      return NextResponse.json(
        { error: `Недостаточно данных: ${data.length} свечей (источник: ${source || 'нет'}). Увеличьте количество дней.` },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { data, source: source || 'unknown' },
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