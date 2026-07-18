// Sentiment Engine — adjusts trading signals based on market sentiment (Fear & Greed)
// and market regime to avoid reckless trades in extreme conditions.

export interface SentimentInput {
  fearGreedValue: number;                  // 0-100
  overallSentiment: string;                // EXTREME_FEAR, FEAR, NEUTRAL, GREED, EXTREME_GREED
  trendDirection: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  regime: string;                          // from detectMarketRegime (TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE)
}

export interface SentimentAdjustment {
  confidenceModifier: number;    // -20 to +20
  positionSizeModifier: number;  // 0.5 to 1.5
  skipSignal: boolean;
  reason: string;
}

/**
 * Calculate sentiment-based adjustments to a trading signal.
 *
 * Rules:
 * - EXTREME_FEAR + BULLISH signal  → reduce confidence by 15, position size 0.6x (contrarian but cautious)
 * - EXTREME_FEAR + BEARISH signal  → no change (follow the fear)
 * - EXTREME_GREED + BULLISH signal → reduce confidence by 20, position size 0.5x (don't FOMO)
 * - EXTREME_GREED + BEARISH signal → increase confidence by 10 (smart contrarian)
 * - FEAR / NEUTRAL / GREED → small adjustments (±5)
 * - VOLATILE regime + EXTREME_FEAR → skipSignal (too dangerous)
 */
export function calculateSentimentAdjustment(input: SentimentInput): SentimentAdjustment {
  const { fearGreedValue, overallSentiment, trendDirection, regime } = input;

  const result: SentimentAdjustment = {
    confidenceModifier: 0,
    positionSizeModifier: 1.0,
    skipSignal: false,
    reason: '',
  };

  // === DANGER ZONE: VOLATILE + EXTREME_FEAR → skip entirely ===
  if (regime === 'VOLATILE' && overallSentiment === 'EXTREME_FEAR') {
    result.skipSignal = true;
    result.confidenceModifier = -20;
    result.positionSizeModifier = 0.5;
    result.reason = 'ОПАСНО: Волатильный рынок + экстремальный страх — пропуск сигнала';
    return result;
  }

  // === EXTREME_FEAR scenarios ===
  if (overallSentiment === 'EXTREME_FEAR') {
    if (trendDirection === 'BULLISH') {
      result.confidenceModifier = -15;
      result.positionSizeModifier = 0.6;
      result.reason = 'Экстремальный страх + бычий сигнал: контрариантная сделка с осторожностью';
    } else if (trendDirection === 'BEARISH') {
      result.confidenceModifier = 0;
      result.positionSizeModifier = 1.0;
      result.reason = 'Экстремальный страх + медвежий сигнал: следуем рынку';
    } else {
      result.confidenceModifier = -5;
      result.positionSizeModifier = 0.7;
      result.reason = 'Экстремальный страх + боковик: осторожная позиция';
    }
    return result;
  }

  // === EXTREME_GREED scenarios ===
  if (overallSentiment === 'EXTREME_GREED') {
    if (trendDirection === 'BULLISH') {
      result.confidenceModifier = -20;
      result.positionSizeModifier = 0.5;
      result.reason = 'Экстремальная жадность + бычий сигнал: не FOMO — уменьшаем размер';
    } else if (trendDirection === 'BEARISH') {
      result.confidenceModifier = 10;
      result.positionSizeModifier = 1.2;
      result.reason = 'Экстремальная жадность + медвежий сигнал: умный контрариантный вход';
    } else {
      result.confidenceModifier = -5;
      result.positionSizeModifier = 0.7;
      result.reason = 'Экстремальная жадность + боковик: осторожная позиция';
    }
    return result;
  }

  // === FEAR scenarios ===
  if (overallSentiment === 'FEAR') {
    if (trendDirection === 'BULLISH') {
      result.confidenceModifier = -5;
      result.positionSizeModifier = 0.85;
      result.reason = 'Страх на рынке: бычий сигнал с пониженной уверенностью';
    } else if (trendDirection === 'BEARISH') {
      result.confidenceModifier = 5;
      result.positionSizeModifier = 1.1;
      result.reason = 'Страх на рынке: медвежий сигнал усилен настроениями';
    } else {
      result.confidenceModifier = -3;
      result.positionSizeModifier = 0.9;
      result.reason = 'Страх на рынке: осторожная позиция';
    }
    return result;
  }

  // === GREED scenarios ===
  if (overallSentiment === 'GREED') {
    if (trendDirection === 'BULLISH') {
      result.confidenceModifier = -5;
      result.positionSizeModifier = 0.85;
      result.reason = 'Жадность на рынке: бычий сигнал с пониженной уверенностью';
    } else if (trendDirection === 'BEARISH') {
      result.confidenceModifier = 5;
      result.positionSizeModifier = 1.1;
      result.reason = 'Жадность на рынке: медвежий сигнал усилен';
    } else {
      result.confidenceModifier = -3;
      result.positionSizeModifier = 0.9;
      result.reason = 'Жадность на рынке: осторожная позиция';
    }
    return result;
  }

  // === NEUTRAL sentiment ===
  result.confidenceModifier = 0;
  result.positionSizeModifier = 1.0;
  result.reason = 'Нейтральные настроения: следуем техническим сигналам';
  return result;
}

// ============================================
// SENTIMENT CACHE — avoid hammering the sentiment API
// ============================================

let sentimentCache: { data: { fearGreedValue: number; overallSentiment: string; sentimentScore: number } | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};

const SENTIMENT_CACHE_TTL = 300000; // 5 minutes

/**
 * Fetch sentiment from the internal /api/crypto/sentiment endpoint with 5-min cache.
 * Returns null on failure (caller should treat as NEUTRAL).
 */
export async function fetchSentimentData(): Promise<{ fearGreedValue: number; overallSentiment: string; sentimentScore: number } | null> {
  const now = Date.now();
  if (sentimentCache.data && now - sentimentCache.timestamp < SENTIMENT_CACHE_TTL) {
    return sentimentCache.data;
  }

  try {
    const port = process.env.PORT || 3000;
    const res = await fetch(`http://localhost:${port}/api/crypto/sentiment`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const result = {
      fearGreedValue: data.fearGreed?.value ?? 50,
      overallSentiment: data.overallSentiment ?? 'NEUTRAL',
      sentimentScore: data.sentimentScore ?? 50,
    };

    sentimentCache = { data: result, timestamp: now };
    return result;
  } catch {
    return null;
  }
}