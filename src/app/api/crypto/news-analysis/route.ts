import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import ZAI from 'z-ai-web-dev-sdk';

// In-memory cache: 10 minutes
const CACHE_TTL = 10 * 60 * 1000;
let cachedAnalysis: { data: unknown; timestamp: number } | null = null;

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(
    `api:news-analysis:${clientIp}`,
    RATE_LIMITS.newsAnalysis,
  );
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // Return cached if fresh
  if (cachedAnalysis && Date.now() - cachedAnalysis.timestamp < CACHE_TTL) {
    return NextResponse.json(
      cachedAnalysis.data,
      { headers: { 'X-RateLimit-Remaining': String(remaining), 'X-Cache': 'HIT' } },
    );
  }

  try {
    // 1. Fetch trending coins from CoinGecko
    let trendingCoins: string[] = [];
    try {
      const trendingRes = await fetch(
        'https://api.coingecko.com/api/v3/search/trending',
        { cache: 'no-store', signal: AbortSignal.timeout(8000) },
      );
      if (trendingRes.ok) {
        const trendingData = await trendingRes.json();
        trendingCoins = (trendingData.coins || [])
          .slice(0, 10)
          .map((c: { item?: { name?: string; symbol?: string } }) =>
            c.item ? `${c.item.name} (${c.item.symbol})` : ''
          )
          .filter(Boolean);
      }
    } catch {
      // CoinGecko unavailable — proceed without trending data
    }

    // 2. Fetch Fear & Greed Index
    let fgValue = 'N/A';
    let fgClassification = 'N/A';
    try {
      const fgRes = await fetch(
        'https://api.alternative.me/fng/?limit=1',
        { cache: 'no-store', signal: AbortSignal.timeout(5000) },
      );
      if (fgRes.ok) {
        const fgData = await fgRes.json();
        fgValue = fgData.data?.[0]?.value ?? 'N/A';
        fgClassification = fgData.data?.[0]?.value_classification ?? 'N/A';
      }
    } catch {
      // Fear & Greed unavailable
    }

    // 3. Build prompt for LLM
    const prompt = `You are a professional crypto trading analyst. Analyze the current market conditions and provide actionable insights.

Current Fear & Greed Index: ${fgValue} (${fgClassification})

Trending coins: ${JSON.stringify(trendingCoins)}

Provide your analysis in this JSON format (respond ONLY with valid JSON, no markdown):
{
  "marketOutlook": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 0-100,
  "keyInsights": ["insight 1", "insight 2", ...],
  "opportunities": [{"coin": "BTC", "direction": "LONG/SHORT", "reason": "..."}],
  "risks": ["risk 1", "risk 2", ...],
  "recommendedAction": "..."
}`;

    // 4. Call LLM
    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      model: 'default',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '';

    // 5. Parse and return
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    let analysis: unknown;

    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0]);
      } catch {
        analysis = {
          marketOutlook: 'NEUTRAL',
          confidence: 50,
          keyInsights: [content],
          opportunities: [],
          risks: [],
          recommendedAction: 'Analysis parsing failed',
        };
      }
    } else {
      analysis = {
        marketOutlook: 'NEUTRAL',
        confidence: 50,
        keyInsights: [content],
        opportunities: [],
        risks: [],
        recommendedAction: 'No structured analysis available',
      };
    }

    const result = { analysis, rawContent: content, source: 'llm', cachedAt: Date.now() };
    cachedAnalysis = { data: result, timestamp: Date.now() };

    return NextResponse.json(result, {
      headers: { 'X-RateLimit-Remaining': String(remaining), 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('News analysis error:', error);
    return NextResponse.json(
      { error: 'News analysis failed', analysis: null, source: 'error' },
      { status: 500, headers: { 'X-RateLimit-Remaining': String(remaining) } },
    );
  }
}