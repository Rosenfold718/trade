import { NextResponse } from 'next/server';

// Crypto sentiment analysis using CoinGecko trending + Fear & Greed
let cachedSentiment: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 300000; // 5 min

export async function GET() {
  try {
    if (cachedSentiment && Date.now() - cachedSentiment.timestamp < CACHE_TTL) {
      return NextResponse.json(cachedSentiment.data);
    }
    
    // Get trending coins
    const trendingRes = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      cache: 'no-store',
    });
    
    let trending: any[] = [];
    if (trendingRes.ok) {
      const trendingData = await trendingRes.json();
      trending = (trendingData.coins || []).slice(0, 7).map((item: any) => ({
        id: item.item?.id,
        symbol: item.item?.symbol?.toUpperCase(),
        name: item.item?.name,
        market_cap_rank: item.item?.market_cap_rank,
        score: item.item?.score,
      }));
    }
    
    // Analyze market sentiment based on Fear & Greed
    let fearGreedValue = 50;
    let fearGreedClass = 'Neutral';
    try {
      const fgRes = await fetch('https://api.alternative.me/fng/?limit=1', { cache: 'no-store' });
      if (fgRes.ok) {
        const fgData = await fgRes.json();
        if (fgData.data?.[0]) {
          fearGreedValue = parseInt(fgData.data[0].value);
          fearGreedClass = fgData.data[0].value_classification;
        }
      }
    } catch (e) {}
    
    // Determine overall sentiment
    let overallSentiment: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
    let sentimentScore = fearGreedValue;
    let recommendation: string;
    
    if (fearGreedValue <= 20) {
      overallSentiment = 'EXTREME_FEAR';
      recommendation = 'Рынок в панике — исторически это лучший момент для покупки (контрариантная стратегия)';
    } else if (fearGreedValue <= 40) {
      overallSentiment = 'FEAR';
      recommendation = 'На рынке страх — осторожно, но есть возможности для покупки на снижении';
    } else if (fearGreedValue <= 60) {
      overallSentiment = 'NEUTRAL';
      recommendation = 'Нейтральный рынок — следуйте техническим сигналам, не поддавайтесь эмоциям';
    } else if (fearGreedValue <= 80) {
      overallSentiment = 'GREED';
      recommendation = 'На рынке жадность — будьте осторожны, возможна коррекция. Фиксируйте прибыль';
    } else {
      overallSentiment = 'EXTREME_GREED';
      recommendation = 'Эйфория на рынке — высокий риск коррекции. Рассмотрите продажу части позиций';
    }
    
    // News sentiment (simplified analysis based on market conditions)
    const newsAnalysis = {
      bullish_factors: [] as string[],
      bearish_factors: [] as string[],
    };
    
    if (fearGreedValue < 30) {
      newsAnalysis.bullish_factors.push('Страх на рынке часто предшествует росту');
      newsAnalysis.bullish_factors.push('Институциональные инвесторы обычно покупают на панике');
    }
    if (fearGreedValue > 70) {
      newsAnalysis.bearish_factors.push('Жадность на рынке часто предшествует коррекции');
      newsAnalysis.bearish_factors.push('Розничные инвесторы обычно покупают на хаях');
    }
    if (trending.length > 3) {
      newsAnalysis.bullish_factors.push(`Высокый интерес к ${trending.length} монетам — активность растёт`);
    }
    
    const result = {
      overallSentiment,
      sentimentScore,
      fearGreed: { value: fearGreedValue, classification: fearGreedClass },
      recommendation,
      newsAnalysis,
      trending,
      source: 'aggregated',
    };
    
    cachedSentiment = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error) {
    console.error('Sentiment API error:', error);
    return NextResponse.json({
      overallSentiment: 'NEUTRAL',
      sentimentScore: 50,
      fearGreed: { value: 50, classification: 'Neutral' },
      recommendation: 'Данные о настроениях недоступны',
      newsAnalysis: { bullish_factors: [], bearish_factors: [] },
      trending: [],
      source: 'fallback',
    });
  }
}
