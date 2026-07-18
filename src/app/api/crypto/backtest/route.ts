import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import { runBacktest, type BacktestConfig } from '@/lib/backtester';

/**
 * GET /api/crypto/backtest
 *
 * Query params:
 *   coin         (required)  CoinGecko coin ID, e.g. "bitcoin"
 *   interval     (default "1h")
 *   days         (default 30)     Number of days to backtest
 *   balance      (default 1000)   Starting balance in USD
 *   leverage     (default 3)
 *   risk         (default 5)      Risk per trade %
 *   trailingStop (default false)  Enable trailing stop
 *   maxPositions (default 3)      Max concurrent open positions
 */
export async function GET(request: Request) {
  // --- Rate limiting: 2 requests per 60 seconds ---
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = rateLimit(`backtest:${clientIp}`, RATE_LIMITS.backtest);

  if (!rl.allowed) {
    const retryAfterSeconds = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Rate limit exceeded. Backtest allows 2 requests per 60 seconds.', retryAfter: retryAfterSeconds },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
        },
      },
    );
  }

  // --- Parse query parameters ---
  const { searchParams } = new URL(request.url);

  const coin = searchParams.get('coin');
  if (!coin) {
    return NextResponse.json(
      { error: 'Missing required parameter: coin (CoinGecko coin ID)' },
      { status: 400 },
    );
  }

  const interval = searchParams.get('interval') || '1h';
  const validIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];
  if (!validIntervals.includes(interval)) {
    return NextResponse.json(
      { error: `Invalid interval "${interval}". Must be one of: ${validIntervals.join(', ')}` },
      { status: 400 },
    );
  }

  const days = parseInt(searchParams.get('days') || '30', 10);
  if (isNaN(days) || days < 1 || days > 365) {
    return NextResponse.json(
      { error: 'Invalid "days" parameter. Must be between 1 and 365.' },
      { status: 400 },
    );
  }

  const balance = parseFloat(searchParams.get('balance') || '1000');
  if (isNaN(balance) || balance < 10) {
    return NextResponse.json(
      { error: 'Invalid "balance" parameter. Must be >= 10.' },
      { status: 400 },
    );
  }

  const leverage = parseInt(searchParams.get('leverage') || '3', 10);
  if (isNaN(leverage) || leverage < 1 || leverage > 100) {
    return NextResponse.json(
      { error: 'Invalid "leverage" parameter. Must be between 1 and 100.' },
      { status: 400 },
    );
  }

  const risk = parseFloat(searchParams.get('risk') || '5');
  if (isNaN(risk) || risk < 0.1 || risk > 100) {
    return NextResponse.json(
      { error: 'Invalid "risk" parameter. Must be between 0.1 and 100.' },
      { status: 400 },
    );
  }

  const trailingStop = searchParams.get('trailingStop') === 'true';
  const maxPositions = parseInt(searchParams.get('maxPositions') || '3', 10);
  if (isNaN(maxPositions) || maxPositions < 1 || maxPositions > 20) {
    return NextResponse.json(
      { error: 'Invalid "maxPositions" parameter. Must be between 1 and 20.' },
      { status: 400 },
    );
  }

  // --- Build config ---
  const now = new Date();
  const endDate = now.toISOString();
  const startDate = new Date(now.getTime() - days * 86_400_000).toISOString();

  const config: BacktestConfig = {
    coinId: coin,
    interval,
    startDate,
    endDate,
    initialBalance: balance,
    riskPerTradePct: risk,
    maxOpenPositions: maxPositions,
    leverage,
    useTrailingStop: trailingStop,
    trailingStepPct: 1.0,
    stopOnMaxDrawdown: 20,
  };

  // --- Run backtest with 2-minute timeout ---
  try {
    const result = await runBacktest(config, AbortSignal.timeout(120_000));

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-RateLimit-Remaining': String(rl.remaining),
      },
    });
  } catch (err: any) {
    if (err.name === 'AbortError' || err?.message?.includes('Aborted')) {
      return NextResponse.json(
        { error: 'Backtest timed out (max 2 minutes). Try a shorter time range or larger interval.' },
        { status: 504 },
      );
    }

    console.error('[backtest] Unexpected error:', err);
    return NextResponse.json(
      { error: `Backtest failed: ${err.message || String(err)}` },
      { status: 500 },
    );
  }
}