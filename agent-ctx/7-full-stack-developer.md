# Task 7: Rate Limiting System

## Summary
Created a comprehensive in-memory rate limiting system for all API routes in the crypto trading terminal.

## Files Created

### `/home/z/my-project/src/lib/rate-limit.ts`
- Singleton in-memory rate limiter using a `Map<string, RateLimitEntry>` store
- `rateLimit(key, config)` — checks if request is allowed, returns `{ allowed, remaining, resetAt }`
- `createRateLimitMiddleware(config)` — returns a middleware function that takes a `Request` and returns a `429 NextResponse` or `null`
- Automatic cleanup of expired entries every 60 seconds via `setInterval` with `.unref()` (doesn't block process exit)
- Guard flag on `globalThis` prevents duplicate cleanup timers in dev hot-reload

### `/home/z/my-project/src/lib/api-rate-limits.ts`
Predefined rate limit configs per route:
| Route | Window | Max Req | Rationale |
|-------|--------|---------|-----------|
| market | 30s | 20 | Market data polling |
| signals | 10s | 30 | Per-coin signal checks |
| scan | 60s | 5 | Expensive multi-coin scan |
| reputation | 5s | 60 | Frequent state reads |
| sentiment | 60s | 10 | External API calls |
| advisor | 60s | 5 | Uses LLM (expensive) |
| thinking | 5s | 30 | Frequent thought reads |
| default | 10s | 60 | Fallback |

## Files Modified (7 API routes)

All routes updated with:
1. Import of `rateLimit` and `RATE_LIMITS`
2. IP-based rate limit check at handler entry using `x-forwarded-for` header
3. `429` response with `{ error, retryAfter }` body, `Retry-After` and `X-RateLimit-Remaining` headers
4. `X-RateLimit-Remaining` header added to `200` success responses (cache hits and fresh data)

### Routes updated:
- `src/app/api/crypto/market/route.ts` — `api:market:{ip}`
- `src/app/api/crypto/signals/route.ts` — `api:signals:{ip}`
- `src/app/api/crypto/scan/route.ts` — `api:scan:{ip}`
- `src/app/api/crypto/reputation/route.ts` — `api:reputation:{ip}` (added `request: Request` param)
- `src/app/api/crypto/sentiment/route.ts` — `api:sentiment:{ip}` (added `request: Request` param)
- `src/app/api/crypto/advisor/route.ts` — `api:advisor:{ip}`
- `src/app/api/crypto/trader-thinking/route.ts` — `api:thinking:{ip}` (added `request: Request` param)

## Verification
- ESLint: No new errors (all errors are pre-existing in CryptoDashboard.tsx)
- Dev server: All routes returning 200 successfully, no compilation errors
- No existing logic was changed — only rate limiting was added