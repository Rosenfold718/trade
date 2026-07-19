// Shared API source configuration for crypto data providers
// Used by signals, scan, and technical analysis modules

export const BINANCE_BASE = 'https://api.binance.com/api/v3';
export const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
export const BYBIT_BASE = 'https://api.bybit.com/v5/market';

/** Map our interval names to Binance kline interval format */
export function getBinanceInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
    '30m': '30m', '1h': '1h', '2h': '2h', '4h': '4h',
    '6h': '6h', '12h': '12h', '1d': '1d', '1w': '1w',
  };
  return map[interval] || '1h';
}

/** Map our interval names to Bybit kline interval format */
export function getBybitInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360',
    '12h': '720', '1d': 'D', '1w': 'W',
  };
  return map[interval] || '60';
}

/**
 * Get the hierarchy of higher timeframes for multi-TF analysis.
 * Returns timeframes from current (highest weight) to lowest.
 *
 * For 1m:  [1m, 5m, 15m, 1h]
 * For 5m:  [5m, 15m, 1h, 4h]
 * For 15m: [15m, 1h, 4h, 1d]
 * For 1h:  [1h, 4h, 1d]       (only 3 available from API)
 * For 4h:  [4h, 1d]            (only 2 available)
 */
export function getHigherTimeframes(interval: string): string[] {
  const hierarchy: Record<string, string[]> = {
    '1m':  ['1m', '5m', '15m', '1h'],
    '5m':  ['5m', '15m', '1h', '4h'],
    '15m': ['15m', '1h', '4h', '1d'],
    '1h':  ['1h', '4h', '1d'],
    '4h':  ['4h', '1d'],
  };
  return hierarchy[interval] || ['1h', '4h', '1d'];
}

/**
 * Weights for each position in the timeframe hierarchy.
 * Index 0 = current TF (1.0), index 1 = next higher (0.7), etc.
 */
export const TIMEFRAME_WEIGHTS = [1.0, 0.7, 0.5, 0.3];

/** Map timeframe to a key for MultiTimeframeResult */
export function timeframeToKey(interval: string): 'm1' | 'm5' | 'm15' | 'h1' | 'h4' | 'd1' | undefined {
  const map: Record<string, 'm1' | 'm5' | 'm15' | 'h1' | 'h4' | 'd1'> = {
    '1m': 'm1', '5m': 'm5', '15m': 'm15',
    '1h': 'h1', '4h': 'h4', '1d': 'd1',
  };
  return map[interval];
}

// Binance USDT trading pairs
export const COINGECKO_TO_BINANCE: Record<string, string> = {
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
  'enjincoin': 'ENJ', 'gala': 'GALA', 'the-sandbox': 'SAND',
  'decentraland': 'MANA', 'axie-infinity': 'AXS',
  'tezos': 'XTZ', 'flow': 'FLOW',
  'chiliz': 'CHZ', 'curve-dao-token': 'CRV', 'compound-governance-token': 'COMP',
  'synthetix-network-token': 'SNX', '1inch': '1INCH',
  'pancakeswap-token': 'CAKE', 'sushi': 'SUSHI',
  'iota': 'IOTA', 'zilliqa': 'ZIL', 'qtum': 'QTUM',
  'nexo': 'NEXO', 'fantom': 'FTM',
};

export const COINGECKO_TO_BYBIT: Record<string, string> = {
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
  'enjincoin': 'ENJ', 'gala': 'GALA', 'the-sandbox': 'SAND',
  'decentraland': 'MANA', 'axie-infinity': 'AXS',
  'tezos': 'XTZ', 'flow': 'FLOW',
  'chiliz': 'CHZ', 'curve-dao-token': 'CRV', 'compound-governance-token': 'COMP',
  'synthetix-network-token': 'SNX', '1inch': '1INCH',
  'pancakeswap-token': 'CAKE', 'sushi': 'SUSHI',
  'iota': 'IOTA', 'zilliqa': 'ZIL', 'qtum': 'QTUM',
  'nexo': 'NEXO',
};

export function getBinanceSymbol(coinId: string): string | null {
  if (COINGECKO_TO_BINANCE[coinId]) return COINGECKO_TO_BINANCE[coinId];
  const upper = coinId.toUpperCase().replace(/-/g, '');
  if (upper.length <= 6) return upper;
  return null;
}

export function getBybitSymbol(coinId: string): string | null {
  if (COINGECKO_TO_BYBIT[coinId]) return COINGECKO_TO_BYBIT[coinId];
  const upper = coinId.toUpperCase().replace(/-/g, '');
  if (upper.length <= 6) return upper;
  return null;
}