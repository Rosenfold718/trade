import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import { fetchSentimentData, calculateSentimentAdjustment, type SentimentAdjustment } from '@/lib/sentiment-engine';
import { auditScanCompleted, auditScanFailed } from '@/lib/audit';

const CACHE_TTL = 300000; // 5 min scan cache — reduce API calls
let scanCache: { data: any; timestamp: number } | null = null;

// Scan all top coins and find the best entry opportunity
export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(`api:scan:${clientIp}`, RATE_LIMITS.scan);
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json({ error: 'Rate limit exceeded', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
    // Return cached if fresh
    if (scanCache && Date.now() - scanCache.timestamp < CACHE_TTL) {
      return NextResponse.json(scanCache.data, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
    }

    // Step 1: Get top coins list
    const port = process.env.PORT || 3000;
    const marketRes = await fetch(`http://localhost:${port}/api/crypto/market`);
    if (!marketRes.ok) return NextResponse.json({ opportunities: [], error: 'market_unavailable' });
    const marketData = await marketRes.json();
    const coins: any[] = marketData.data || [];
    if (coins.length === 0) return NextResponse.json({ opportunities: [] });

    // Step 1b: Load adaptive params from reputation
    let avoidCoins: string[] = ['tether', 'usd-coin', 'dai', 'binance-usd', 'staked-ether', 'wrapped-bitcoin', 'usds'];
    let minSlPct = 0.5;
    let minConfidence = 60;
    let minRr = 1.5;
    try {
      const repRes = await fetch(`http://localhost:${port}/api/crypto/reputation`);
      if (repRes.ok) {
        const repData = await repRes.json();
        if (repData.adaptive) {
          avoidCoins = repData.adaptive.avoidCoins || avoidCoins;
          minSlPct = repData.adaptive.minSlDistancePct || minSlPct;
          minConfidence = repData.adaptive.minConfidence || minConfidence;
          minRr = repData.adaptive.minRr || minRr;
        }
      }
    } catch { /* use defaults */ }

    // Step 1c: Fetch sentiment ONCE before the scan loop
    let sentimentData: { fearGreedValue: number; overallSentiment: string; sentimentScore: number } | null = null;
    try {
      sentimentData = await fetchSentimentData();
    } catch { /* no sentiment, proceed without */ }

    // Step 2: Analyze top 25 coins for signals (parallel requests), excluding avoided coins
    const eligibleCoins = coins.filter(c => !avoidCoins.includes(c.id));
    const topCoins = eligibleCoins.slice(0, 25);
    const results: Array<{
      coinId: string;
      symbol: string;
      name: string;
      price: number;
      change24h: number;
      direction: string | null;
      confidence: number;
      entry: number;
      stopLoss: number;
      takeProfit1: number;
      riskReward: number;
      entryReason: string;
      reasons: string[];
      timeframe: string;
      score: number;
      rejectedReason?: string;
    }> = [];

    // Analyze in parallel (max 5 at a time to avoid rate limiting)
    const batchSize = 5;
    for (let i = 0; i < topCoins.length; i += batchSize) {
      const batch = topCoins.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (coin) => {
          try {
            const signalRes = await fetch(`http://localhost:${port}/api/crypto/signals?coin=${coin.id}&interval=1h&skipMultiTF=true`, {
              signal: AbortSignal.timeout(8000),
            });
            if (!signalRes.ok) return null;
            const signalData = await signalRes.json();
            const ts = signalData.tradeSignal;
            if (!ts || ts.direction === 'FLAT') return null;

            // === SENTIMENT ADJUSTMENT per opportunity ===
            let sentimentModifier = 0;
            let sentimentReason = '';
            let sentimentSkip = false;
            if (sentimentData) {
              const adj: SentimentAdjustment = calculateSentimentAdjustment({
                fearGreedValue: sentimentData.fearGreedValue,
                overallSentiment: sentimentData.overallSentiment,
                trendDirection: ts.direction === 'LONG' ? 'BULLISH' : 'BEARISH',
                regime: ts.multiTimeframe?.regime ?? 'RANGING',
              });
              sentimentModifier = adj.confidenceModifier;
              sentimentReason = adj.reason;
              sentimentSkip = adj.skipSignal;

              // Skip if sentiment says too dangerous
              if (sentimentSkip) return null;
            }

            // Calculate composite score
            const rr = ts.riskReward || 0;
            const trendBonus = ts.trend === 'BULLISH' && ts.direction === 'LONG' ? 15 :
                               ts.trend === 'BEARISH' && ts.direction === 'SHORT' ? 15 :
                               ts.trend === ts.direction ? 10 : 0;
            const momentumBonus = ts.momentum === 'STRONG' ? 10 : ts.momentum === 'MODERATE' ? 5 : 0;
            const rrScore = Math.min(rr * 20, 30);
            const absChange = Math.abs(coin.price_change_percentage_24h || 0);
            const volatilityBonus = Math.min(absChange * 1.5, 15);
            let score = (ts.confidence * 0.4) + rrScore + trendBonus + momentumBonus + volatilityBonus;

            // Apply sentiment modifier to score
            score += sentimentModifier;

            // Adaptive penalties
            let rejectedReason: string | undefined;
            const slPct = ts.entry > 0 ? (Math.abs(ts.entry - ts.stopLoss) / ts.entry) * 100 : 0;
            if (slPct > 0 && slPct < minSlPct * 0.8) {
              score -= 20;
              rejectedReason = `SL слишком близко (${slPct.toFixed(2)}% < ${minSlPct}%)`;
            } else if (slPct > 0 && slPct < minSlPct) {
              score -= 8;
            }
            if (ts.confidence < minConfidence) {
              score -= 15;
              if (!rejectedReason) rejectedReason = `Уверенность ${ts.confidence}% < ${minConfidence}%`;
            }
            if (rr < minRr) {
              score -= 10;
              if (!rejectedReason) rejectedReason = `R:R ${rr.toFixed(2)} < ${minRr}`;
            }

            return {
              coinId: coin.id,
              symbol: coin.symbol?.toUpperCase() || coin.id,
              name: coin.name,
              price: coin.current_price,
              change24h: coin.price_change_percentage_24h || 0,
              direction: ts.direction,
              confidence: ts.confidence,
              entry: ts.entry,
              stopLoss: ts.stopLoss,
              takeProfit1: ts.takeProfit1,
              riskReward: rr,
              entryReason: ts.entryReason || '',
              reasons: ts.reasons || [],
              timeframe: '1h',
              score,
              rejectedReason,
            };
          } catch {
            return null;
          }
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) {
          results.push(r.value);
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const response = {
      opportunities: results,
      scannedAt: Date.now(),
      totalScanned: topCoins.length,
      totalSignals: results.length,
      avoidedCoins: avoidCoins,
      adaptiveRules: { minSlPct, minConfidence, minRr },
      sentimentUsed: sentimentData ? {
        fearGreed: sentimentData.fearGreedValue,
        overall: sentimentData.overallSentiment,
        score: sentimentData.sentimentScore,
      } : null,
    };

    scanCache = { data: response, timestamp: Date.now() };
    // Audit: scan completed
    auditScanCompleted(results.length, 0, topCoins.length);
    return NextResponse.json(response, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
  } catch (error) {
    console.error('Scan API error:', error);
    auditScanFailed(String(error));
    return NextResponse.json({ opportunities: [], error: 'scan_failed' }, { status: 500 });
  }
}