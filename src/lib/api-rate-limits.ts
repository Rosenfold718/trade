import type { RateLimitConfig } from './rate-limit';

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  market: { windowMs: 30000, maxRequests: 20 },      // 30s, 20 req (market data)
  signals: { windowMs: 10000, maxRequests: 30 },     // 10s, 30 req (signals)
  scan: { windowMs: 60000, maxRequests: 5 },         // 60s, 5 req (expensive scan)
  reputation: { windowMs: 5000, maxRequests: 60 },   // 5s, 60 req
  sentiment: { windowMs: 60000, maxRequests: 10 },   // 60s, 10 req
  advisor: { windowMs: 60000, maxRequests: 5 },      // 60s, 5 req (uses LLM)
  thinking: { windowMs: 5000, maxRequests: 30 },     // 5s, 30 req
  backtest: { windowMs: 60000, maxRequests: 5 },       // 60s, 5 req
  newsAnalysis: { windowMs: 600000, maxRequests: 3 },  // 10min, 3 req (uses LLM)
  default: { windowMs: 10000, maxRequests: 60 },     // 10s, 60 req
};