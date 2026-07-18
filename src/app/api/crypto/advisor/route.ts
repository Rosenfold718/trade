import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';
import ZAI from 'z-ai-web-dev-sdk';

const COIN_NAMES: Record<string, string> = {
  'bitcoin': 'Bitcoin', 'ethereum': 'Ethereum', 'solana': 'Solana',
  'ripple': 'XRP', 'cardano': 'Cardano', 'dogecoin': 'Dogecoin',
  'avalanche-2': 'Avalanche', 'polkadot': 'Polkadot', 'chainlink': 'Chainlink',
  'litecoin': 'Litecoin', 'uniswap': 'Uniswap', 'cosmos': 'Cosmos',
  'near': 'NEAR Protocol', 'aave': 'Aave', 'filecoin': 'Filecoin',
  'aptos': 'Aptos', 'arbitrum': 'Arbitrum', 'optimism': 'Optimism',
  'sui': 'Sui', 'injective-protocol': 'Injective', 'pepe': 'Pepe',
  'shiba-inu': 'Shiba Inu', 'tron': 'TRON', 'toncoin': 'Toncoin',
  'stellar': 'Stellar', 'render-token': 'Render', 'fetch-ai': 'Fetch.ai',
  'thorchain': 'THORChain', 'maker': 'Maker', 'the-graph': 'The Graph',
  'vechain': 'VeChain', 'algorand': 'Algorand', 'hedera-hashgraph': 'Hedera',
  'mantle': 'Mantle', 'kaspa': 'Kaspa', 'fantom': 'Fantom',
  'binancecoin': 'BNB', 'ethereum-classic': 'Ethereum Classic',
  'dogwifcoin': 'dogwifhat', 'immutable-x': 'Immutable', 'conflux': 'Conflux',
  'bonk': 'Bonk', 'celestia': 'Celestia', 'starknet': 'Starknet',
  'worldcoin-wld': 'Worldcoin', 'jupiter-exchange-solana': 'Jupiter',
  'pendle': 'Pendle', 'ondo-finance': 'Ondo Finance',
};

const COIN_SYMBOLS: Record<string, string> = {
  'bitcoin': 'BTC', 'ethereum': 'ETH', 'solana': 'SOL',
  'ripple': 'XRP', 'cardano': 'ADA', 'dogecoin': 'DOGE',
  'avalanche-2': 'AVAX', 'polkadot': 'DOT', 'chainlink': 'LINK',
  'litecoin': 'LTC', 'uniswap': 'UNI', 'cosmos': 'ATOM',
  'near': 'NEAR', 'aave': 'AAVE', 'filecoin': 'FIL',
  'aptos': 'APT', 'arbitrum': 'ARB', 'optimism': 'OP',
  'sui': 'SUI', 'injective-protocol': 'INJ', 'pepe': 'PEPE',
  'shiba-inu': 'SHIB', 'tron': 'TRX', 'toncoin': 'TON',
  'stellar': 'XLM', 'render-token': 'RNDR', 'fetch-ai': 'FET',
  'thorchain': 'RUNE', 'maker': 'MKR', 'the-graph': 'GRT',
  'vechain': 'VET', 'algorand': 'ALGO', 'hedera-hashgraph': 'HBAR',
  'mantle': 'MNT', 'kaspa': 'KAS', 'fantom': 'FTM',
  'binancecoin': 'BNB', 'ethereum-classic': 'ETC',
};

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 90000;

const fmtPrice = (p: string | number) => {
  const n = typeof p === 'string' ? parseFloat(p) : p;
  if (!n || !isFinite(n)) return '0.00';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toFixed(8);
};

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(`api:advisor:${clientIp}`, RATE_LIMITS.advisor);
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json({ error: 'Rate limit exceeded', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
    const { searchParams } = new URL(request.url);
    const coinId = searchParams.get('coin') || 'bitcoin';
    const direction = searchParams.get('direction') || 'FLAT';
    const confidence = searchParams.get('confidence') || '0';
    const entry = searchParams.get('entry') || '0';
    const stopLoss = searchParams.get('stopLoss') || '0';
    const tp1 = searchParams.get('tp1') || '0';
    const tp2 = searchParams.get('tp2') || '0';
    const tp3 = searchParams.get('tp3') || '0';
    const trend = searchParams.get('trend') || 'SIDEWAYS';
    const momentum = searchParams.get('momentum') || 'WEAK';
    const reasons = searchParams.get('reasons') || '';
    const warnings = searchParams.get('warnings') || '';
    const candlePattern = searchParams.get('candlePattern') || '';
    const volumeSignal = searchParams.get('volumeSignal') || '';
    const support = searchParams.get('support') || '0';
    const resistance = searchParams.get('resistance') || '0';
    const atr = searchParams.get('atr') || '0';
    const holdDuration = searchParams.get('holdDuration') || '';
    const indicators = searchParams.get('indicators') || '';

    const cacheKey = `${coinId}-${direction}-${confidence}-${Math.floor(Date.now() / CACHE_TTL)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
    }

    const coinName = COIN_NAMES[coinId] || coinId;
    const coinSymbol = COIN_SYMBOLS[coinId] || coinId.toUpperCase();
    const isActionable = direction === 'LONG' || direction === 'SHORT';

    // Search for recent news
    let newsContext = '';
    try {
      const zaiSearch = await ZAI.create();
      const searchResults = await zaiSearch.functions.invoke('web_search', {
        query: `${coinName} ${coinSymbol} crypto news today`,
        num: 3,
        recency_days: 1,
      });
      if (Array.isArray(searchResults) && searchResults.length > 0) {
        newsContext = searchResults.slice(0, 3).map((r: any, i: number) =>
          `${i + 1}. ${r.snippet || r.content || ''}`
        ).join(' ');
      }
    } catch (e) {
      console.error('Web search failed:', e);
    }

    // Candle pattern brief explanation
    const candleExplanations: Record<string, string> = {
      'Hammer': 'покупатели отбили атаку продавцов — возможен разворот вверх',
      'Inverted Hammer': 'покупатели пытались поднять — нужен подтвеждение',
      'Shooting Star': 'покупатели не удержали рост — продавцы давят',
      'Bullish Engulfing': 'покупатели массово вошли — перехват инициативы',
      'Bearish Engulfing': 'продавцы подавили покупателей — ожидайте снижение',
      'Morning Star': 'продавцы выдохлись, покупатели перехватывают',
      'Evening Star': 'покупатели устали, продавцы перехватывают',
      'Bullish Pin Bar': 'покупатели агрессивно защищают уровень',
      'Bearish Pin Bar': 'продавцы не дают цене расти выше уровня',
      'Doji': 'рынок в нерешительности — жди разворота',
      'Three White Soldiers': 'покупатели доминируют 3 свечи подряд',
      'Three Black Crows': 'продавцы доминируют 3 свечи подряд',
    };
    const candleNote = candlePattern ? (candleExplanations[candlePattern] || `паттерн "${candlePattern}" — важный сигнал`) : '';

    const systemPrompt = `Ты — криптотрейдер-аналитик. Отвечай ТОЛЬКО на русском. МАКСИМАЛЬНО КРАТКО — вся сумма должна уместиться в 6-8 коротких строк. Никаких длинных объяснений, аналогий, вступлений. Только конкретика.

Формат ответа (СТРОГО):

**Суть:** [1 предложение — кто контролирует рынок]
**Причина:** [1-2 предложения — почему движется цена: свечи + объём + новости]
**Свечи:** [1 предложение — что означает паттерн для поведения участников]
**Риски:** [1 предложение — главная угроза позиции]
**ИТОГ:** [ОДНА фраза: ПОКУПАТЬ/ПРОДАВАТЬ/ЖДАТЬ + уровень входа + стоп + цель + время]

Пример правильного ИТОГа: "ПОКУПАТЬ от $62800, стоп $62400, цель $64100, на 2-4 часа"
Пример для FLAT: "ЖДАТЬ пробоя $64000 вверх для LONG или $62500 вниз для SHORT"

ПРАВИЛА:
- Каждая секция — 1-2 предложения максимум
- Никаких "Представь что", "Давай разберем", "Привет" — сразу к делу
- ИТОГ — всегда конкретный, с цифрами
- Общий объём — не более 400 символов`;

    const userPrompt = `${coinName} (${coinSymbol}/USDT):
${isActionable ? `Сигнал: ${direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'} ${confidence}%
Вход: $${fmtPrice(entry)} | Стоп: $${fmtPrice(stopLoss)} | TP1: $${fmtPrice(tp1)} | TP2: $${fmtPrice(tp2)}
Тренд: ${trend} | Импульс: ${momentum} | Удержание: ${holdDuration}
Подд: $${fmtPrice(support)} | Сопр: $${fmtPrice(resistance)} | ATR: $${fmtPrice(atr)}` : 'Сигнала нет — рынок в боковике'}
${candleNote ? `Паттерн: ${candlePattern} — ${candleNote}` : ''}
${reasons ? `Причины: ${reasons}` : ''}
${warnings ? `Риски: ${warnings}` : ''}
${volumeSignal ? `Объём: ${volumeSignal}` : ''}
${newsContext ? `Новости: ${newsContext}` : ''}

Дай краткий анализ.`;

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const analysis = completion.choices[0]?.message?.content || 'Не удалось получить анализ.';

    const result = {
      analysis,
      coinId,
      coinName,
      coinSymbol,
      timestamp: Date.now(),
      direction,
    };
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    if (cache.size > 30) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) cache.delete(key);
      }
    }

    return NextResponse.json(result, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
  } catch (error) {
    console.error('Advisor API error:', error);
    return NextResponse.json({ error: 'AI-советчик временно недоступен.' }, { status: 503 });
  }
}
