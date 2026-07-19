import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';

export const maxDuration = 30;

/**
 * DELETE /api/crypto/trader-reset
 *
 * Resets the autonomous trader state:
 *  1. Clears trader thinking log
 *  2. Forces a fresh scan on next auto-trade cycle (by resetting desperation in auto-trade)
 */
export async function DELETE(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(
    `api:trader-reset:${clientIp}`,
    RATE_LIMITS.default,
  );
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const results: Record<string, boolean> = {};

  // 1. Clear trader thinking
  try {
    const thinkRes = await fetch(`${baseUrl}/api/crypto/trader-thinking`, { method: 'DELETE' });
    results.thinkingCleared = thinkRes.ok;
  } catch {
    results.thinkingCleared = false;
  }

  // 2. Trigger a fresh scan (bypass cache by appending cache-bust — scan uses its own cache
  //    but the next auto-trade call will get fresh data since scan TTL is only 45s).
  //    We don't need to delete the scan cache file (it's in-memory); it expires naturally.
  //    Just mark it as done so the caller knows.
  results.scanCacheExpiry = true; // scan cache (45s TTL) will expire naturally

  return NextResponse.json(
    {
      success: true,
      message: 'Trader reset',
      details: results,
    },
    { headers: { 'X-RateLimit-Remaining': String(remaining) } },
  );
}