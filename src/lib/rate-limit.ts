import { NextResponse } from 'next/server';

export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store — singleton per process
const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;

if (typeof globalThis !== 'undefined' && !((globalThis as any).__rateLimitCleanupStarted)) {
  (globalThis as any).__rateLimitCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref();
}

/**
 * Check if a request is allowed under the given rate limit config.
 * Key + IP-based limiting. Thread-safe via single event loop.
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();

  let entry = store.get(key);

  // If no entry or window expired, create a fresh entry
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(key, entry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Within the window — check if we have capacity
  entry.count += 1;

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Creates a middleware function for a given rate limit config.
 * Returns a function that takes a Request and returns either
 * a 429 NextResponse (if rate limited) or null (if allowed).
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return function rateLimitMiddleware(request: Request, keyPrefix: string): NextResponse | null {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const key = `${keyPrefix}:${clientIp}`;
    const result = rateLimit(key, config);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: retryAfterSeconds },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
          },
        }
      );
    }

    return null; // Request allowed
  };
}