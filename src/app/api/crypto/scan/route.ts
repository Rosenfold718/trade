import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import { calculateSentimentAdjustment, type SentimentAdjustment } from '@/lib/sentiment-engine';
import { auditScanCompleted, auditScanFailed } from '@/lib/audit';
import { generateTradeSignal } from '@/lib/technical-analysis';
import { BINANCE_BASE, COINGECKO_BASE, BYBIT_BASE, getBinanceSymbol, getBinanceInterval, getBybitSymbol, getBybitInterval } from '@/lib/api-sources';

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

    // Step 1: Get top coins directly from CoinGecko (no localhost)
    const marketUrl = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`;
    const marketRes = await fetch(marketUrl, { signal: AbortSignal.timeout(10000) });
    if (!marketRes.ok) return NextResponse.json({ opportunities: [], error: 'market_unavailable' });
    const coins: any[] = await marketRes.json();
    if (coins.length === 0) return NextResponse.json({ opportunities: [] });

    // Step 1b: Use default adaptive params (no localhost reputation call)
    let avoidCoins = ['tether', 'usd-coin', 'dai', 'binance-usd', 'staked-ether', 'wrapped-bitcoin', 'usds'];
    let minSlPct = 0.5;
    let minConfidence = 55; // LOWERED from 60 to be more aggressive
    let minRr = 1.3; // LOWERED from 1.5 to be more aggressive

    // Step 1c: Fetch sentiment ONCE before the scan loop
    let sentimentData: { fearGreedValue: number; overallSentiment: string; sentimentScore: number } | null = null;
    try {
      // Fetch sentiment directly from the Fear & Greed API (no localhost)
      const fgRes = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) });
      if (fgRes.ok) {
        const fgData = await fgRes.json();
        const fgValue = fgData?.data?.[0]?.value ? parseInt(fgData.data[0].value, 10) : 50;
        let overallSentiment = 'NEUTRAL';
        if (fgValue <= 25) overallSentiment = 'EXTREME_FEAR';
        else if (fgValue <= 45) overallSentiment = 'FEAR';
        else if (fgValue <= 55) overallSentiment = 'NEUTRAL';
        else if (fgValue <= 75) overallSentiment = 'GREED';
        else overallSentiment = 'EXTREME_GREED';
        sentimentData = { fearGreedValue: fgValue, overallSentiment, sentimentScore: fgValue };
      }
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
            // Try to fetch OHLCV data and generate signal directly (no localhost)
            let ts: any = null;

            // Try Binance first
            const binanceSymbol = getBinanceSymbol(coin.id);
            if (binanceSymbol) {
              const symbol = binanceSymbol + 'USDT';
              const binanceInterval = getBinanceInterval('1h');
              try {
                const response = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${binanceInterval}&limit=168`, { signal: AbortSignal.timeout(8000) });
                if (response.ok) {
                  const klines = await response.json();
                  if (Array.isArray(klines) && klines.length > 0) {
                    const ohlcvData = klines.map((k: any[]) => ({
                      timestamp: Number(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
                      low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
                    }));
                    const signal = generateTradeSignal(ohlcvData, '1h');
                    if (signal && signal.direction !== 'FLAT') {
                      ts = signal;
                    }
                  }
                }
              } catch { /* Binance failed, try Bybit */ }

              // Fallback to Bybit if Binance didn't produce a signal
              if (!ts) {
                const bybitSymbol = getBybitSymbol(coin.id);
                if (bybitSymbol) {
                  const bybitSym = bybitSymbol + 'USDT';
                  try {
                    const bybitResponse = await fetch(`${BYBIT_BASE}/kline?category=spot&symbol=${bybitSym}&interval=${getBybitInterval('1h')}&limit=200`, { signal: AbortSignal.timeout(8000) });
                    if (bybitResponse.ok) {
                      const bybitData = await bybitResponse.json();
                      if (bybitData.retCode === 0 && bybitData.result?.list?.length > 0) {
                        const klines = [...bybitData.result.list].reverse();
                        const ohlcvData = klines.map((k: string[]) => ({
                          timestamp: parseFloat(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
                          low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
                        }));
                        const signal = generateTradeSignal(ohlcvData, '1h');
                        if (signal && signal.direction !== 'FLAT') {
                          ts = signal;
                        }
                      }
                    }
                  } catch { /* Bybit also failed */ }
                }
              }
            }

            if (!ts) return null;

            // Use default multiTimeframe since we skip multi-TF analysis in scan
            const mtf = ts.multiTimeframe || { alignment: 50, consensus: 'NEUTRAL', regime: 'RANGING' };

            // === SENTIMENT ADJUSTMENT per opportunity ===
            let sentimentModifier = 0;
            let sentimentReason = '';
            let sentimentSkip = false;
            if (sentimentData) {
              const adj: SentimentAdjustment = calculateSentimentAdjustment({
                fearGreedValue: sentimentData.fearGreedValue,
                overallSentiment: sentimentData.overallSentiment,
                trendDirection: ts.direction === 'LONG' ? 'BULLISH' : 'BEARISH',
                regime: mtf.regime ?? 'RANGING',
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
      avoidedCoins,
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