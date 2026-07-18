import { NextResponse } from 'next/server';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const BINANCE_BASE = 'https://api.binance.com/api/v3';
const BYBIT_BASE = 'https://api.bybit.com/v5/market';

const COINGECKO_TO_SYMBOL: Record<string, string> = {
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
  'algorand': 'ALGO', 'hedera-hashgraph': 'HBAR', 'sei-network': 'SEI',
  'dogwifcoin': 'WIF', 'mantle': 'MNT', 'polygon-ecosystem-token': 'POL',
  'immutable-x': 'IMX', 'conflux': 'CFX', 'kaspa': 'KAS',
  'bonk': 'BONK', 'celestia': 'TIA', 'starknet': 'STRK',
  'worldcoin-wld': 'WLD', 'jupiter-exchange-solana': 'JUP',
  'pendle': 'PENDLE', 'ondo-finance': 'ONDO', 'beam-2': 'BEAM',
  'enjincoin': 'ENJ', 'gala': 'GALA', 'sandox': 'SAND',
  'decentraland': 'MANA', 'axie-infinity': 'AXS', 'the-sandbox': 'SAND',
  'tezos': 'XTZ', 'fantom': 'FTM', 'flow': 'FLOW',
  'chiliz': 'CHZ', 'curve-dao-token': 'CRV', 'compound-governance-token': 'COMP',
  'synthetix-network-token': 'SNX', '1inch': '1INCH',
  'pancakeswap-token': 'CAKE', 'sushi': 'SUSHI',
  'iota': 'IOTA', 'zilliqa': 'ZIL', 'qtum': 'QTUM',
  'nexo': 'NEXO', 'kucoin-shares': 'KCS', 'omisego': 'OMG',
};

function getBybitInterval(days: number): string {
  if (days <= 1) return '60';
  if (days <= 7) return '240';
  return 'D';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('coin') || 'bitcoin';
    const days = searchParams.get('days') || '30';
    const d = parseInt(days);

    let interval: string;
    if (d <= 1) interval = '1h';
    else if (d <= 7) interval = '4h';
    else if (d <= 30) interval = '1d';
    else if (d <= 90) interval = '3d';
    else interval = '1w';
    const limit = d <= 1 ? 24 : d <= 7 ? 42 : d <= 30 ? 30 : d <= 90 ? 30 : 52;

    // Strategy 1: Binance
    const symbol = COINGECKO_TO_SYMBOL[id] || id.toUpperCase().replace(/-/g, '');
    try {
      const binanceSymbol = symbol + 'USDT';
      const url = `${BINANCE_BASE}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const response = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0 && !(data as any).code) {
          const ohlcv = data.map((k: any[]) => ({
            timestamp: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          }));
          return NextResponse.json({ data: ohlcv, source: 'binance' });
        }
      }
    } catch { /* try next */ }

    // Strategy 2: Bybit
    try {
      const bybitSymbol = symbol + 'USDT';
      const bybitInterval = getBybitInterval(d);
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), 5000);
      const bybitResponse = await fetch(
        `${BYBIT_BASE}/kline?category=spot&symbol=${bybitSymbol}&interval=${bybitInterval}&limit=${Math.min(limit, 200)}`,
        { cache: 'no-store', signal: ctrl2.signal }
      );
      clearTimeout(timer2);
      if (bybitResponse.ok) {
        const data = await bybitResponse.json();
        if (data.retCode === 0 && data.result?.list?.length > 0) {
          const klines = [...data.result.list].reverse();
          const ohlcv = klines.map((k: string[]) => ({
            timestamp: parseFloat(k[0]), open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
          }));
          return NextResponse.json({ data: ohlcv, source: 'bybit' });
        }
      }
    } catch { /* try next */ }

    // Strategy 3: CoinGecko OHLCV
    try {
      const ctrl3 = new AbortController();
      const timer3 = setTimeout(() => ctrl3.abort(), 5000);
      const cgResponse = await fetch(
        `${COINGECKO_BASE}/coins/${id}/ohlcv?vs_currency=usd&days=${days}`,
        { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl3.signal }
      );
      clearTimeout(timer3);
      if (cgResponse.ok) {
        const data = await cgResponse.json();
        if (Array.isArray(data) && data.length > 0 && !(data as any).status) {
          const ohlcv = data.map((candle: number[]) => ({
            timestamp: candle[0], open: candle[1], high: candle[2],
            low: candle[3], close: candle[4], volume: candle[5] || 0,
          }));
          return NextResponse.json({ data: ohlcv, source: 'coingecko' });
        }
      }
    } catch { /* try next */ }

    // Strategy 4: CoinGecko market_chart
    try {
      const ctrl4 = new AbortController();
      const timer4 = setTimeout(() => ctrl4.abort(), 5000);
      const chartResponse = await fetch(
        `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
        { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl4.signal }
      );
      clearTimeout(timer4);
      if (chartResponse.ok) {
        const data = await chartResponse.json();
        if (data.prices && Array.isArray(data.prices) && data.prices.length > 0) {
          // Convert to daily OHLCV
          const dayMap = new Map<string, any>();
          for (let i = 0; i < data.prices.length; i++) {
            const ts = data.prices[i][0];
            const price = data.prices[i][1];
            const vol = data.total_volumes?.[i]?.[1] || 0;
            const dateKey = new Date(ts).toISOString().split('T')[0];
            if (!dayMap.has(dateKey)) {
              dayMap.set(dateKey, { timestamp: ts, open: price, high: price, low: price, close: price, volume: vol });
            } else {
              const c = dayMap.get(dateKey)!;
              c.high = Math.max(c.high, price);
              c.low = Math.min(c.low, price);
              c.close = price;
              c.volume += vol;
            }
          }
          const ohlcv = Array.from(dayMap.values()).sort((a, b) => a.timestamp - b.timestamp);
          return NextResponse.json({ data: ohlcv, source: 'coingecko-chart' });
        }
      }
    } catch { /* all strategies failed */ }

    return NextResponse.json(
      { error: `Данные для ${id} временно недоступны` },
      { status: 404 }
    );
  } catch (error) {
    console.error('OHLCV API error:', error);
    return NextResponse.json(
      { error: 'Все API недоступны. Попробуйте позже.' },
      { status: 500 }
    );
  }
}
