'use client';

import React, { useMemo } from 'react';

// CoinGecko ID → TradingView symbol mapping (Binance pairs)
const COIN_TO_TV_SYMBOL: Record<string, string> = {
  'bitcoin': 'BINANCE:BTCUSDT',
  'ethereum': 'BINANCE:ETHUSDT',
  'solana': 'BINANCE:SOLUSDT',
  'ripple': 'BINANCE:XRPUSDT',
  'binancecoin': 'BINANCE:BNBUSDT',
  'cardano': 'BINANCE:ADAUSDT',
  'dogecoin': 'BINANCE:DOGEUSDT',
  'avalanche-2': 'BINANCE:AVAXUSDT',
  'polkadot': 'BINANCE:DOTUSDT',
  'chainlink': 'BINANCE:LINKUSDT',
  'litecoin': 'BINANCE:LTCUSDT',
  'uniswap': 'BINANCE:UNIUSDT',
  'cosmos': 'BINANCE:ATOMUSDT',
  'near': 'BINANCE:NEARUSDT',
  'aave': 'BINANCE:AAVEUSDT',
  'filecoin': 'BINANCE:FILUSDT',
  'aptos': 'BINANCE:APTUSDT',
  'arbitrum': 'BINANCE:ARBUSDT',
  'optimism': 'BINANCE:OPUSDT',
  'sui': 'BINANCE:SUIUSDT',
  'injective-protocol': 'BINANCE:INJUSDT',
  'pepe': 'BINANCE:PEPEUSDT',
  'shiba-inu': 'BINANCE:SHIBUSDT',
  'tron': 'BINANCE:TRXUSDT',
  'toncoin': 'BINANCE:TONUSDT',
  'stellar': 'BINANCE:XLMUSDT',
  'fetch-ai': 'BINANCE:FETUSDT',
  'thorchain': 'BINANCE:RUNEUSDT',
  'maker': 'BINANCE:MKRUSDT',
  'the-graph': 'BINANCE:GRTUSDT',
  'vechain': 'BINANCE:VETUSDT',
  'algorand': 'BINANCE:ALGOUSDT',
  'hedera-hashgraph': 'BINANCE:HBARUSDT',
  'dogwifcoin': 'BINANCE:WIFUSDT',
  'polygon-ecosystem-token': 'BINANCE:POLUSDT',
  'bonk': 'BINANCE:BONKUSDT',
  'celestia': 'BINANCE:TIAUSDT',
  'starknet': 'BINANCE:STRKUSDT',
  'worldcoin-wld': 'BINANCE:WLDUSDT',
  'pendle': 'BINANCE:PENDLEUSDT',
  'ondo-finance': 'BINANCE:ONDOUSDT',
  'render-token': 'BINANCE:RENDERUSDT',
  'fantom': 'BINANCE:FTMUSDT',
};

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

function getTVSymbol(coinId: string): string {
  if (COIN_TO_TV_SYMBOL[coinId]) return COIN_TO_TV_SYMBOL[coinId];
  const sym = coinId.toUpperCase().replace(/-/g, '');
  return `BINANCE:${sym}USDT`;
}

interface TradingViewWidgetProps {
  coinId: string;
  symbol: string;
  interval: string;
  height?: number;
}

export function TradingViewWidget({ coinId, interval, height = 480 }: TradingViewWidgetProps) {
  const tvSymbol = useMemo(() => getTVSymbol(coinId), [coinId]);
  const tvInterval = useMemo(() => INTERVAL_MAP[interval] || '60', [interval]);

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      symbol: tvSymbol,
      interval: tvInterval,
      theme: 'dark',
      style: '1',
      locale: 'ru',
      toolbar_bg: '0f172a',
      enable_publishing: 'false',
      hide_top_toolbar: 'false',
      hide_legend: 'false',
      withdateranges: 'true',
      save_image: 'true',
      studies: '["RSI@tv-basicstudies","MACD@tv-basicstudies"]',
    });
    return `https://s.tradingview.com/widgetembed/?frameElementId=tv&${params.toString()}`;
  }, [tvSymbol, tvInterval]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden bg-[#0f172a]" style={{ height }}>
      <iframe
        src={iframeSrc}
        width="100%"
        height="100%"
        style={{ border: 'none', display: 'block' }}
        allowFullScreen
        loading="lazy"
        title={`TradingView - ${tvSymbol}`}
      />
    </div>
  );
}