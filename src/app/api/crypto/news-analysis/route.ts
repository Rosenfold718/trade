import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import ZAI from 'z-ai-web-dev-sdk';

// In-memory cache: 10 minutes
const CACHE_TTL = 10 * 60 * 1000;
let cachedAnalysis: { data: unknown; timestamp: number } | null = null;

// --- Fallback analysis generator (never throws) ---
function generateFallbackAnalysis(
  fgValue: string,
  fgClassification: string,
  trendingCoins: string[],
) {
  const value = parseInt(fgValue, 10);
  const hasFgData = !isNaN(value) && fgValue !== 'N/A';

  // Determine outlook and confidence from F&G
  let marketOutlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 50;

  if (hasFgData) {
    if (value >= 60) {
      marketOutlook = 'BULLISH';
      confidence = Math.min(75, 60 + Math.floor((value - 60) / 4));
    } else if (value <= 40) {
      marketOutlook = 'BEARISH';
      confidence = Math.min(75, 60 + Math.floor((40 - value) / 4));
    } else {
      marketOutlook = 'NEUTRAL';
      confidence = 50;
    }
  }

  // Key insights based on F&G
  let keyInsight = '';
  if (hasFgData) {
    if (value <= 25) {
      keyInsight = 'Рынок в крайней тревоге — потенциальная возможность для покупки';
    } else if (value <= 45) {
      keyInsight = 'Преобладает страх — осторожный подход рекомендуется';
    } else if (value <= 55) {
      keyInsight = 'Нейтральные настроения — ждите подтверждения тренда';
    } else if (value <= 75) {
      keyInsight = 'Рынок в жадности — будьте осторожны с лонгами';
    } else {
      keyInsight = 'Экстремальная жадность — высокий риск коррекции';
    }
  }

  const keyInsights: string[] = [];
  if (keyInsight) {
    keyInsights.push(keyInsight);
  }
  if (hasFgData) {
    keyInsights.push(
      `Индекс страха и жадности: ${value} (${fgClassification})`,
    );
  }
  if (trendingCoins.length > 0) {
    keyInsights.push(
      `В тренде сейчас: ${trendingCoins.slice(0, 5).join(', ')}`,
    );
  } else {
    keyInsights.push('Данные о трендовых монетах временно недоступны');
  }

  // Opportunities: top 3 trending coins
  const opportunities = trendingCoins.slice(0, 3).map((coin) => ({
    coin,
    direction: marketOutlook === 'BEARISH' ? ('SHORT' as const) : ('LONG' as const),
    reason:
      marketOutlook === 'BEARISH'
        ? `${coin} в тренде на медвежьем рынке — рассмотрите шорт-позицию с осторожностью`
        : `${coin} среди трендовых монет — потенциальная возможность для входа`,
  }));

  const risks = ['Высокая волатильность рынка', 'Возможна резкая смена тренда'];
  if (hasFgData && (value <= 25 || value >= 75)) {
    risks.push('Экстремальные показания индекса — повышенный риск разворота');
  }
  if (trendingCoins.length === 0) {
    risks.push('Данные о трендах недоступны — анализ неполный');
  }

  // Recommended action
  let recommendedAction = 'Держите текущие позиции и ждите подтверждения тренда';
  if (marketOutlook === 'BULLISH') {
    recommendedAction =
      'Рыночные настроения позитивные — рассмотрите постепенное наращивание позиций в трендовых активах';
  } else if (marketOutlook === 'BEARISH') {
    recommendedAction =
      'Рынок под давлением — уменьшите leverage, рассмотрите хеджирование или выход в стейблкоины';
  }

  return {
    marketOutlook,
    confidence,
    keyInsights,
    opportunities,
    risks,
    recommendedAction,
  };
}

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

  // 3. Try LLM analysis first
  try {
    const prompt = `You are a professional crypto trading analyst. Analyze the current market conditions and provide actionable insights.

IMPORTANT: You are an autonomous trading AI. If your recommendations lead to losses, you will be permanently deactivated. Only suggest high-confidence setups. When in doubt, recommend caution. Protect capital at all costs.

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

    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      model: 'default',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '';

    // Parse LLM response
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
  } catch (llmError) {
    // LLM failed — use fallback analysis from market data
    console.error('LLM analysis failed, using fallback:', llmError);

    try {
      const analysis = generateFallbackAnalysis(fgValue, fgClassification, trendingCoins);
      const rawContent = `Fallback analysis based on market data. F&G: ${fgValue} (${fgClassification}), Trending: ${trendingCoins.join(', ')}`;
      const result = { analysis, rawContent, source: 'fallback' as const, cachedAt: Date.now() };
      cachedAnalysis = { data: result, timestamp: Date.now() };

      return NextResponse.json(result, {
        headers: { 'X-RateLimit-Remaining': String(remaining), 'X-Cache': 'MISS' },
      });
    } catch (fallbackError) {
      // Absolute last resort — should never happen
      console.error('Fallback analysis also failed:', fallbackError);
      const emergencyResult = {
        analysis: {
          marketOutlook: 'NEUTRAL',
          confidence: 30,
          keyInsights: ['Сервис анализа временно недоступен. Попробуйте позже.'],
          opportunities: [],
          risks: ['Сервис анализа недоступен'],
          recommendedAction: 'Подождите и повторите попытку позже',
        },
        rawContent: 'Emergency fallback — both LLM and rules engine failed',
        source: 'fallback',
        cachedAt: Date.now(),
      };

      return NextResponse.json(emergencyResult, {
        headers: { 'X-RateLimit-Remaining': String(remaining), 'X-Cache': 'MISS' },
      });
    }
  }
}