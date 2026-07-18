import { NextResponse } from 'next/server';

const CACHE_TTL = 300000; // 60s scan cache — reduce API calls
let scanCache: { data: any; timestamp: number } | null = null;

// Scan all top coins and find the best entry opportunity
export async function GET(request: Request) {
  try {
    // Return cached if fresh
    if (scanCache && Date.now() - scanCache.timestamp < CACHE_TTL) {
      return NextResponse.json(scanCache.data);
    }

    // Step 1: Get top coins list
    const marketRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/crypto/market`);
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
      const repRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/crypto/reputation`);
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
      rejectedReason?: string; // Why this opportunity was rejected by adaptive rules
    }> = [];

    // Analyze in parallel (max 5 at a time to avoid rate limiting)
    const batchSize = 5;
    for (let i = 0; i < topCoins.length; i += batchSize) {
      const batch = topCoins.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (coin) => {
          try {
            const signalRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/crypto/signals?coin=${coin.id}&interval=1h`, {
              signal: AbortSignal.timeout(8000),
            });
            if (!signalRes.ok) return null;
            const signalData = await signalRes.json();
            const ts = signalData.tradeSignal;
            if (!ts || ts.direction === 'FLAT') return null;

            // Calculate composite score:
            // - Confidence (0-100) x 0.4
            // - Risk/Reward (>2 = good) x 20
            // - Trend alignment x 15
            // - Momentum bonus x 10
            // - Volatility bonus x 15 (prefer more volatile coins for intraday)
            const rr = ts.riskReward || 0;
            const trendBonus = ts.trend === 'BULLISH' && ts.direction === 'LONG' ? 15 :
                               ts.trend === 'BEARISH' && ts.direction === 'SHORT' ? 15 :
                               ts.trend === ts.direction ? 10 : 0;
            const momentumBonus = ts.momentum === 'STRONG' ? 10 : ts.momentum === 'MODERATE' ? 5 : 0;
            const rrScore = Math.min(rr * 20, 30);
            // Volatility: higher |24h change| = more volatile = better for intraday
            const absChange = Math.abs(coin.price_change_percentage_24h || 0);
            const volatilityBonus = Math.min(absChange * 1.5, 15); // Cap at 15
            let score = (ts.confidence * 0.4) + rrScore + trendBonus + momentumBonus + volatilityBonus;

            // Adaptive penalties
            let rejectedReason: string | undefined;
            const slPct = ts.entry > 0 ? (Math.abs(ts.entry - ts.stopLoss) / ts.entry) * 100 : 0;
            if (slPct > 0 && slPct < minSlPct * 0.8) { // Only reject if significantly below threshold (80% of min)
              score -= 20; // Heavy penalty for SL too close
              rejectedReason = `SL слишком близко (${slPct.toFixed(2)}% < ${minSlPct}%)`;
            } else if (slPct > 0 && slPct < minSlPct) {
              score -= 8; // Mild penalty for SL at boundary
            }
            if (ts.confidence < minConfidence) {
              score -= 15; // Penalty for low confidence
              if (!rejectedReason) rejectedReason = `Уверенность ${ts.confidence}% < ${minConfidence}%`;
            }
            if (rr < minRr) {
              score -= 10; // Penalty for bad R:R
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
    };

    scanCache = { data: response, timestamp: Date.now() };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Scan API error:', error);
    return NextResponse.json({ opportunities: [], error: 'scan_failed' }, { status: 500 });
  }
}
