import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const BINANCE_BASE = 'https://api.binance.com/api/v3';

// Simple in-memory cache
let marketCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(`api:market:${clientIp}`, RATE_LIMITS.market);
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json({ error: 'Rate limit exceeded', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
    // Return cached data if fresh
    if (marketCache && Date.now() - marketCache.timestamp < CACHE_TTL) {
      return NextResponse.json(marketCache.data, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
    }
    
    const { searchParams } = new URL(request.url);
    const vsCurrency = searchParams.get('vs_currency') || 'usd';
    
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${vsCurrency}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=1h,24h,7d`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        const formatted = data.map((coin: any) => ({
          id: coin.id,
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          image: coin.image,
          current_price: coin.current_price,
          market_cap: coin.market_cap,
          market_cap_rank: coin.market_cap_rank,
          total_volume: coin.total_volume,
          price_change_percentage_24h: coin.price_change_percentage_24h,
          price_change_percentage_1h_in_currency: coin.price_change_percentage_1h_in_currency,
          price_change_percentage_7d_in_currency: coin.price_change_percentage_7d_in_currency,
          sparkline_in_7d: coin.sparkline_in_7d?.price || [],
          high_24h: coin.high_24h,
          low_24h: coin.low_24h,
          circulating_supply: coin.circulating_supply,
          ath: coin.ath,
          ath_change_percentage: coin.ath_change_percentage,
        }));
        
        const result = { data: formatted, source: 'coingecko' };
        marketCache = { data: result, timestamp: Date.now() };
        return NextResponse.json(result, { headers: { 'X-RateLimit-Remaining': String(remaining) } });
      }
    }
    
    // Fallback to Binance
    return await getBinanceFallback();
  } catch (error) {
    console.error('Market API error:', error);
    return await getBinanceFallback();
  }
}

async function getBinanceFallback() {
  try {
    const topPairs = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
      'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
      'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT', 'AAVEUSDT',
      'FILUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT',
      'INJUSDT', 'PEPEUSDT', 'SHIBUSDT', 'TRXUSDT', 'TONUSDT',
      'ETCUSDT', 'RNDRUSDT', 'FETUSDT', 'RUNEUSDT', 'MKRUSDT',
      'GRTUSDT', 'VETUSDT', 'ALGOUSDT', 'HBARUSDT', 'SEIUSDT',
      'WIFUSDT', 'IMXUSDT', 'CFXUSDT', 'BONKUSDT', 'TIAUSDT',
      'STRKUSDT', 'WLDUSDT', 'JUPUSDT', 'PENDLEUSDT', 'ONDOUSDT',
      'ENJUSDT', 'GALAUSDT', 'SANDUSDT', 'MANAUSDT', 'AXSUSDT',
      'XTZUSDT', 'FLOWUSDT', 'CHZUSDT', 'CRVUSDT', 'COMPUSDT',
      'SNXUSDT', '1INCHUSDT', 'CAKEUSDT', 'SUSHIUSDT', 'IOTAUSDT',
      'ZILUSDT', 'QTUMUSDT', 'NEXOUSDT', 'POLUSDT'
    ];
    
    const changesRes = await fetch(`${BINANCE_BASE}/ticker/24hr`, { cache: 'no-store' });
    if (!changesRes.ok) {
      if (marketCache) return NextResponse.json(marketCache.data);
      return NextResponse.json({ data: [], source: 'none' });
    }
    const changes = await changesRes.json();
    
    const changeMap = new Map<string, any>();
    for (const t of changes) {
      if (topPairs.includes(t.symbol)) changeMap.set(t.symbol, t);
    }
    
    const nameMap: Record<string, string> = {
      'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'BNB': 'BNB', 'SOL': 'Solana',
      'XRP': 'XRP', 'ADA': 'Cardano', 'DOGE': 'Dogecoin', 'AVAX': 'Avalanche',
      'DOT': 'Polkadot', 'LINK': 'Chainlink', 'LTC': 'Litecoin', 'UNI': 'Uniswap',
      'ATOM': 'Cosmos', 'NEAR': 'NEAR Protocol', 'AAVE': 'Aave',
      'FIL': 'Filecoin', 'APT': 'Aptos', 'ARB': 'Arbitrum', 'OP': 'Optimism',
      'SUI': 'Sui', 'INJ': 'Injective', 'PEPE': 'Pepe', 'SHIB': 'Shiba Inu',
      'TRX': 'TRON', 'TON': 'Toncoin', 'ETC': 'Ethereum Classic',
      'RNDR': 'Render', 'FET': 'Fetch.ai', 'RUNE': 'THORChain', 'MKR': 'Maker',
      'GRT': 'The Graph', 'VET': 'VeChain', 'ALGO': 'Algorand', 'HBAR': 'Hedera',
      'SEI': 'Sei', 'WIF': 'dogwifhat', 'IMX': 'Immutable', 'CFX': 'Conflux',
      'BONK': 'Bonk', 'TIA': 'Celestia', 'STRK': 'Starknet', 'WLD': 'Worldcoin',
      'JUP': 'Jupiter', 'PENDLE': 'Pendle', 'ONDO': 'Ondo Finance',
      'ENJ': 'Enjin Coin', 'GALA': 'Gala', 'SAND': 'The Sandbox',
      'MANA': 'Decentraland', 'AXS': 'Axie Infinity', 'XTZ': 'Tezos',
      'FLOW': 'Flow', 'CHZ': 'Chiliz', 'CRV': 'Curve DAO', 'COMP': 'Compound',
      'SNX': 'Synthetix', '1INCH': '1inch', 'CAKE': 'PancakeSwap',
      'SUSHI': 'Sushi', 'IOTA': 'IOTA', 'ZIL': 'Zilliqa', 'QTUM': 'Qtum',
      'NEXO': 'Nexo', 'POL': 'Polygon'
    };
    
    const coingeckoIdMap: Record<string, string> = {
      'BTC': 'bitcoin', 'ETH': 'ethereum', 'BNB': 'binancecoin', 'SOL': 'solana',
      'XRP': 'ripple', 'ADA': 'cardano', 'DOGE': 'dogecoin', 'AVAX': 'avalanche-2',
      'DOT': 'polkadot', 'LINK': 'chainlink', 'LTC': 'litecoin', 'UNI': 'uniswap',
      'ATOM': 'cosmos', 'NEAR': 'near', 'AAVE': 'aave',
      'FIL': 'filecoin', 'APT': 'aptos', 'ARB': 'arbitrum', 'OP': 'optimism',
      'SUI': 'sui', 'INJ': 'injective-protocol', 'PEPE': 'pepe', 'SHIB': 'shiba-inu',
      'TRX': 'tron', 'TON': 'toncoin', 'ETC': 'ethereum-classic',
      'RNDR': 'render-token', 'FET': 'fetch-ai', 'RUNE': 'thorchain', 'MKR': 'maker',
      'GRT': 'the-graph', 'VET': 'vechain', 'ALGO': 'algorand', 'HBAR': 'hedera-hashgraph',
      'SEI': 'sei-network', 'WIF': 'dogwifcoin', 'IMX': 'immutable-x', 'CFX': 'conflux',
      'BONK': 'bonk', 'TIA': 'celestia', 'STRK': 'starknet', 'WLD': 'worldcoin-wld',
      'JUP': 'jupiter-exchange-solana', 'PENDLE': 'pendle', 'ONDO': 'ondo-finance',
      'ENJ': 'enjincoin', 'GALA': 'gala', 'SAND': 'the-sandbox',
      'MANA': 'decentraland', 'AXS': 'axie-infinity', 'XTZ': 'tezos',
      'FLOW': 'flow', 'CHZ': 'chiliz', 'CRV': 'curve-dao-token', 'COMP': 'compound-governance-token',
      'SNX': 'synthetix-network-token', '1INCH': '1inch', 'CAKE': 'pancakeswap-token',
      'SUSHI': 'sushi', 'IOTA': 'iota', 'ZIL': 'zilliqa', 'QTUM': 'qtum',
      'NEXO': 'nexo', 'POL': 'polygon-ecosystem-token'
    };
    
    const filtered = topPairs
      .map((symbol, index) => {
        const info = changeMap.get(symbol);
        if (!info) return null;
        const base = symbol.replace('USDT', '');
        return {
          id: coingeckoIdMap[base] || base.toLowerCase(),
          symbol: base,
          name: nameMap[base] || base,
          image: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${base.toLowerCase()}.png`,
          current_price: parseFloat(info.lastPrice),
          market_cap: parseFloat(info.quoteVolume),
          market_cap_rank: index + 1,
          total_volume: parseFloat(info.volume),
          price_change_percentage_24h: parseFloat(info.priceChangePercent),
          price_change_percentage_1h_in_currency: null,
          price_change_percentage_7d_in_currency: null,
          sparkline_in_7d: [],
          high_24h: parseFloat(info.highPrice),
          low_24h: parseFloat(info.lowPrice),
          circulating_supply: 0,
          ath: parseFloat(info.highPrice),
          ath_change_percentage: 0,
        };
      })
      .filter(Boolean);
    
    const result = { data: filtered, source: 'binance' };
    marketCache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error) {
    console.error('Binance fallback error:', error);
    if (marketCache) {
      return NextResponse.json(marketCache.data);
    }
    return NextResponse.json({ data: [], source: 'none' });
  }
}
