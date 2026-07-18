import { NextResponse } from 'next/server';
import { generateSignals, generateTradeSignal, formatChartData, type OHLCV } from '@/lib/technical-analysis';

const BINANCE_BASE = 'https://api.binance.com/api/v3';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const BYBIT_BASE = 'https://api.bybit.com/v5/market';

// Binance USDT trading pairs
const COINGECKO_TO_BINANCE: Record<string, string> = {
  'bitcoin': 'BTC', 'ethereum': 'ETH', 'binancecoin': 'BNB',
  'solana': 'SOL', 'ripple': 'XRP', 'cardano': 'ADA',
  'dogecoin': 'DOGE', 'avalanche-2': 'AVAX', 'polkadot': 'DOT',
  'chainlink': 'LINK', 'litecoin': 'LTC', 'uniswap': 'UNI',
  'cosmos': 'ATOM', 'ethereum-classic': 'ETC', 'near': 'NEAR',
  'aave': 'AAVE', 'filecoin': 'FIL', 'aptos': 'APT',
  'arbitrum': 'ARB', 'optimism': 'OP', 'sui': 'SUI',
  'injective-protocol': 'INJ', 'pepe': 'PEPE', 'shiba-inu': 'SHIB',
  'tron': 'TRX', 'toncoin': 'TON', 'stellar': 'XLM',
  'render-token': 'RNDR', 'fetch-ai': 'FET', 'thorchain': 'RUNE',
  'maker': 'MKR', 'the-graph': 'GRT', 'vechain': 'VET',
  'algorand': 'ALGO', 'usd-coin': 'USDC', 'tether': 'USDT',
  'hedera-hashgraph': 'HBAR', 'sei-network': 'SEI',
  'dogwifcoin': 'WIF', 'polygon-ecosystem-token': 'POL',
  'immutable-x': 'IMX', 'conflux': 'CFX',
  'bonk': 'BONK', 'celestia': 'TIA', 'starknet': 'STRK',
  'worldcoin-wld': 'WLD', 'jupiter-exchange-solana': 'JUP',
  'pendle': 'PENDLE', 'ondo-finance': 'ONDO', 'beam-2': 'BEAM',
  'enjincoin': 'ENJ', 'gala': 'GALA', 'sandox': 'SAND',
  'decentraland': 'MANA', 'axie-infinity': 'AXS', 'the-sandbox': 'SAND',
  'tezos': 'XTZ', 'flow': 'FLOW',
  'chiliz': 'CHZ', 'curve-dao-token': 'CRV', 'compound-governance-token': 'COMP',
  'synthetix-network-token': 'SNX', '1inch': '1INCH',
  'pancakeswap-token': 'CAKE', 'sushi': 'SUSHI',
  'iota': 'IOTA', 'zilliqa': 'ZIL', 'qtum': 'QTUM',
  'nexo': 'NEXO', 'fantom': 'FTM',
  'btc': 'BTC', 'eth': 'ETH', 'bnb': 'BNB', 'sol': 'SOL',
  'xrp': 'XRP', 'ada': 'ADA', 'doge': 'DOGE', 'avax': 'AVAX',
  'dot': 'DOT', 'link': 'LINK', 'ltc': 'LTC', 'uni': 'UNI',
  'atom': 'ATOM', 'near': 'NEAR', 'aave': 'AAVE', 'fil': 'FIL',
  'apt': 'APT', 'arb': 'ARB', 'op': 'OP', 'sui': 'SUI',
  'inj': 'INJ', 'pepe': 'PEPE', 'shib': 'SHIB', 'trx': 'TRX',
  'ton': 'TON', 'xlm': 'XLM', 'etc': 'ETC', 'ftm': 'FTM',
};

const COINGECKO_TO_BYBIT: Record<string, string> = {
  'mantle': 'MNT', 'kaspa': 'KAS', 'kucoin-shares': 'KCS',
  'render-token': 'RENDER', 'fantom': 'FTM', 'omisego': 'OMG',
  'bitcoin': 'BTC', 'ethereum': 'ETH', 'binancecoin': 'BNB',
  'solana': 'SOL', 'ripple': 'XRP', 'cardano': 'ADA',
  'dogecoin': 'DOGE', 'avalanche-2': 'AVAX', 'polkadot': 'DOT',
  'chainlink': 'LINK', 'litecoin': 'LTC', 'uniswap': 'UNI',
  'cosmos': 'ATOM', 'ethereum-classic': 'ETC', 'near': 'NEAR',
  'aave': 'AAVE', 'filecoin': 'FIL', 'aptos': 'APT',
  'arbitrum': 'ARB', 'optimism': 'OP', 'sui': 'SUI',
  'injective-protocol': 'INJ', 'pepe': 'PEPE', 'shiba-inu': 'SHIB',
  'tron': 'TRX', 'toncoin': 'TON', 'stellar': 'XLM',
  'fetch-ai': 'FET', 'thorchain': 'RUNE',
  'maker': 'MKR', 'the-graph': 'GRT', 'vechain': 'VET',
  'algorand': 'ALGO', 'hedera-hashgraph': 'HBAR', 'sei-network': 'SEI',
  'dogwifcoin': 'WIF', 'polygon-ecosystem-token': 'POL',
  'immutable-x': 'IMX', 'conflux': 'CFX',
  'bonk': 'BONK', 'celestia': 'TIA', 'starknet': 'STRK',
  'worldcoin-wld': 'WLD', 'jupiter-exchange-solana': 'JUP',
  'pendle': 'PENDLE', 'ondo-finance': 'ONDO', 'beam-2': 'BEAM',
  'enjincoin': 'ENJ', 'gala': 'GALA', 'sandox': 'SAND',
  'decentraland': 'MANA', 'axie-infinity': 'AXS', 'the-sandbox': 'SAND',
  'tezos': 'XTZ', 'flow': 'FLOW',
  'chiliz': 'CHZ', 'curve-dao-token': 'CRV', 'compound-governance-token': 'COMP',
  'synthetix-network-token': 'SNX', '1inch': '1INCH',
  'pancakeswap-token': 'CAKE', 'sushi': 'SUSHI',
  'iota': 'IOTA', 'zilliqa': 'ZIL', 'qtum': 'QTUM',
  'nexo': 'NEXO',
};

function getBinanceSymbol(coinId: string): string | null {
  if (COINGECKO_TO_BINANCE[coinId]) return COINGECKO_TO_BINANCE[coinId];
  const upper = coinId.toUpperCase().replace(/-/g, '');
  if (upper.length <= 6) return upper;
  return null;
}

function getBybitSymbol(coinId: string): string | null {
  if (COINGECKO_TO_BYBIT[coinId]) return COINGECKO_TO_BYBIT[coinId];
  const upper = coinId.toUpperCase().replace(/-/g, '');
  if (upper.length <= 6) return upper;
  return null;
}

// Convert Bybit interval format
function getBybitInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360',
    '12h': '720', '1d': 'D', '1w': 'W',
  };
  return map[interval] || '60';
}

// Binance interval → next higher timeframe
function getHigherTimeframe(interval: string): string {
  const map: Record<string, string> = {
    '1m': '5m', '5m': '15m', '15m': '1h', '1h': '4h', '4h': '1d',
  };
  return map[interval] || '1h';
}

// Convert CoinGecko market_chart data to OHLCV
function marketChartToOHLCV(prices: number[][], volumes: number[][]): OHLCV[] {
  if (prices.length === 0) return [];
  const dayMap = new Map<string, { timestamp: number; open: number; high: number; low: number; close: number; volume: number }>();
  for (let i = 0; i < prices.length; i++) {
    const ts = prices[i][0];
    const price = prices[i][1];
    const vol = i < volumes.length ? volumes[i][1] : 0;
    const dateKey = new Date(ts).toISOString().split('T')[0];
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { timestamp: ts, open: price, high: price, low: price, close: price, volume: vol });
    } else {
      const candle = dayMap.get(dateKey)!;
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += vol;
    }
  }
  return Array.from(dayMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function hourlyToOHLCV(prices: number[][], volumes: number[][]): OHLCV[] {
  if (prices.length === 0) return [];
  const hourMap = new Map<number, { timestamp: number; open: number; high: number; low: number; close: number; volume: number }>();
  for (let i = 0; i < prices.length; i++) {
    const ts = prices[i][0];
    const price = prices[i][1];
    const vol = i < volumes.length ? volumes[i][1] : 0;
    const hourKey = Math.floor(ts / 3600000) * 3600000;
    if (!hourMap.has(hourKey)) {
      hourMap.set(hourKey, { timestamp: hourKey, open: price, high: price, low: price, close: price, volume: vol });
    } else {
      const candle = hourMap.get(hourKey)!;
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += vol;
    }
  }
  return Array.from(hourMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Fetch OHLCV from multiple sources with fallback
async function fetchOHLCV(coinId: string, interval: string, limit: number): Promise<{ data: OHLCV[]; source: string }> {
  const timeoutMs = 8000; // 8s timeout per source
  
  // Strategy 1: Binance
  const binanceSymbol = getBinanceSymbol(coinId);
  if (binanceSymbol) {
    try {
      const symbol = binanceSymbol + 'USDT';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const response = await fetch(
        `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { cache: 'no-store', signal: ctrl.signal }
      );
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0 && !data.code) {
          const ohlcv = data.map((k: any[]) => ({
            timestamp: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          }));
          return { data: ohlcv, source: 'binance' };
        }
      }
    } catch { /* try next */ }
  }

  // Strategy 2: Bybit
  const bybitSymbol = getBybitSymbol(coinId);
  if (bybitSymbol) {
    try {
      const symbol = bybitSymbol + 'USDT';
      const bybitInterval = getBybitInterval(interval);
      const bybitLimit = Math.min(limit, 200);
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), timeoutMs);
      const response = await fetch(
        `${BYBIT_BASE}/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${bybitLimit}`,
        { cache: 'no-store', signal: ctrl2.signal }
      );
      clearTimeout(timer2);
      if (response.ok) {
        const data = await response.json();
        if (data.retCode === 0 && data.result?.list?.length > 0) {
          const klines = [...data.result.list].reverse();
          const ohlcv = klines.map((k: string[]) => ({
            timestamp: parseFloat(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          }));
          return { data: ohlcv, source: 'bybit' };
        }
      }
    } catch { /* try next */ }
  }

  // Strategy 3: CoinGecko OHLCV
  try {
    const ctrl3 = new AbortController();
    const timer3 = setTimeout(() => ctrl3.abort(), timeoutMs);
    const cgResponse = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/ohlcv?vs_currency=usd&days=1`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl3.signal }
    );
    clearTimeout(timer3);
    if (cgResponse.ok) {
      const data = await cgResponse.json();
      if (Array.isArray(data) && data.length > 0 && !data.status) {
        const ohlcv = data.map((candle: number[]) => ({
          timestamp: candle[0], open: candle[1], high: candle[2],
          low: candle[3], close: candle[4], volume: candle[5] || 0,
        }));
        return { data: ohlcv, source: 'coingecko-ohlcv' };
      }
    }
  } catch { /* try next */ }

  // Strategy 4: CoinGecko market_chart
  try {
    const ctrl4 = new AbortController();
    const timer4 = setTimeout(() => ctrl4.abort(), timeoutMs);
    const chartResponse = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=1`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl4.signal }
    );
    clearTimeout(timer4);
    if (chartResponse.ok) {
      const data = await chartResponse.json();
      if (data.prices && Array.isArray(data.prices) && data.prices.length > 0) {
        const prices: number[][] = data.prices;
        const volumes: number[][] = data.total_volumes || [];
        const ohlcv = hourlyToOHLCV(prices, volumes);
        if (ohlcv.length > 0) return { data: ohlcv, source: 'coingecko-chart' };
      }
    }
  } catch { /* all strategies failed */ }

  return { data: [], source: '' };
}

// In-memory cache with size limit
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30s for intraday data
const MAX_CACHE_SIZE = 50;

function cleanCache() {
  if (cache.size > MAX_CACHE_SIZE) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) keysToDelete.push(key);
    }
    keysToDelete.forEach(k => cache.delete(k));
    // If still too large, delete oldest
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < entries.length - MAX_CACHE_SIZE / 2; i++) {
        cache.delete(entries[i][0]);
      }
    }
  }
  // Force GC hint if available
  if (global.gc) global.gc();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('coin') || 'bitcoin';
    const interval = searchParams.get('interval') || '1h'; // Default to 1h for intraday
    const days = searchParams.get('days') || '1';

    const cacheKey = `${id}-${interval}-${days}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // Determine candle limits based on interval
    let limit: number;
    let currentInterval: string;
    switch (interval) {
      case '1m':
        limit = 200;  // ~3 hours of 1m candles
        currentInterval = '1m';
        break;
      case '5m':
        limit = 200;  // ~16 hours of 5m candles
        currentInterval = '5m';
        break;
      case '15m':
        limit = 200;  // ~50 hours of 15m candles
        currentInterval = '15m';
        break;
      case '1h':
        limit = 168;  // 7 days of hourly candles
        currentInterval = '1h';
        break;
      case '4h':
        limit = 180;  // 30 days of 4h candles
        currentInterval = '4h';
        break;
      default:
        // Legacy "days" parameter support
        const d = parseInt(days);
        if (d <= 1) { limit = 48; currentInterval = '1h'; }
        else if (d <= 3) { limit = 72; currentInterval = '1h'; }
        else { limit = 84; currentInterval = '4h'; }
    }

    // Fetch current timeframe data
    const { data: ohlcvData, source } = await fetchOHLCV(id, currentInterval, limit);

    if (ohlcvData.length === 0) {
      return NextResponse.json(
        { error: 'Данные временно недоступны. Попробуйте обновить или выберите другую монету.' },
        { status: 404 }
      );
    }

    // Fetch higher timeframe data for multi-timeframe analysis
    // Only fetch if we have enough current TF data and cache doesn't have it
    const higherInterval = getHigherTimeframe(currentInterval);
    let higherTFData: OHLCV[] | undefined;
    const htfCacheKey = `${id}-${higherInterval}-htf`;
    const htfCached = cache.get(htfCacheKey);
    if (htfCached && Date.now() - htfCached.timestamp < CACHE_TTL * 3) {
      higherTFData = htfCached.data;
    } else {
      try {
        const htfResult = await fetchOHLCV(id, higherInterval, 60);
        if (htfResult.data.length >= 20) {
          higherTFData = htfResult.data;
          cache.set(htfCacheKey, { data: higherTFData, timestamp: Date.now() });
        }
      } catch { /* ignore */ }
    }

    // Generate the trade signal with multi-timeframe analysis
    const tradeSignal = generateTradeSignal(ohlcvData, currentInterval, higherTFData);

    // Also generate the legacy signal for compatibility
    const signalResult = generateSignals(ohlcvData);
    const chartData = formatChartData(ohlcvData);

    const result = {
      signal: signalResult,
      tradeSignal,
      chartData,
      coinId: id,
      source,
      interval: currentInterval,
      candlesCount: ohlcvData.length,
      higherTFSource: higherTFData.length > 0 ? 'available' : 'unavailable',
    };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    cleanCache();

    return NextResponse.json(result);
  } catch (error) {
    console.error('Signals API error:', error);
    return NextResponse.json({ error: 'Ошибка анализа. Попробуйте позже.' }, { status: 500 });
  }
}
