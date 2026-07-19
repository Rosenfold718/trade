import { NextResponse } from 'next/server';

export const maxDuration = 15;

// CoinGecko ID → Binance symbol mapping
const COIN_TO_BINANCE: Record<string, string> = {
  bitcoin: 'BTCUSDT', ethereum: 'ETHUSDT', solana: 'SOLUSDT',
  ripple: 'XRPUSDT', binancecoin: 'BNBUSDT', cardano: 'ADAUSDT',
  dogecoin: 'DOGEUSDT', 'avalanche-2': 'AVAXUSDT', polkadot: 'DOTUSDT',
  chainlink: 'LINKUSDT', litecoin: 'LTCUSDT', uniswap: 'UNIUSDT',
  cosmos: 'ATOMUSDT', near: 'NEARUSDT', aave: 'AAVEUSDT',
  filecoin: 'FILUSDT', aptos: 'APTUSDT', arbitrum: 'ARBUSDT',
  optimism: 'OPUSDT', sui: 'SUIUSDT', 'injective-protocol': 'INJUSDT',
  pepe: 'PEPEUSDT', 'shiba-inu': 'SHIBUSDT', tron: 'TRXUSDT',
  toncoin: 'TONUSDT', stellar: 'XLMUSDT', 'fetch-ai': 'FETUSDT',
  thorchain: 'RUNEUSDT', maker: 'MKRUSDT', 'the-graph': 'GRTUSDT',
  vechain: 'VETUSDT', algorand: 'ALGOUSDT', 'hedera-hashgraph': 'HBARUSDT',
  dogwifcoin: 'WIFUSDT', 'polygon-ecosystem-token': 'POLUSDT',
  bonk: 'BONKUSDT', celestia: 'TIAUSDT', starknet: 'STRKUSDT',
  'worldcoin-wld': 'WLDUSDT', pendle: 'PENDLEUSDT',
  'ondo-finance': 'ONDOUSDT', 'render-token': 'RENDERUSDT',
  fantom: 'FTMUSDT',
};

function getSymbol(coin: string): string {
  if (COIN_TO_BINANCE[coin]) return COIN_TO_BINANCE[coin];
  return coin.toUpperCase().replace(/-/g, '') + 'USDT';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'BTCUSDT';
  const interval = searchParams.get('interval') || '1h';
  const limit = parseInt(searchParams.get('limit') || '500', 10);

  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Binance API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data: any[][] = await res.json();

    // Binance klines format: [openTime, open, high, low, close, volume, closeTime, ...]
    const candles = data.map(d => ({
      time: Math.floor(d[0] / 1000), // convert ms to seconds for lightweight-charts v4
      open: +d[1],
      high: +d[2],
      low: +d[3],
      close: +d[4],
      volume: +d[5],
    }));

    return NextResponse.json({ candles, symbol, interval, count: candles.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fetch failed' },
      { status: 502 }
    );
  }
}