'use client';

import React, { useEffect, useRef, useMemo, useState } from 'react';

// ─── Coin ID → TradingView symbol mapping (Binance pairs) ───

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

// ─── Interval mapping ───

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

function getTVInterval(interval: string): string {
  return INTERVAL_MAP[interval] || '60';
}

// ─── Component ───

interface TradingViewWidgetProps {
  coinId: string;
  symbol: string;
  interval: string;
  height?: number;
}

export function TradingViewWidget({ coinId, interval, height = 480 }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSymbol = useMemo(() => getTVSymbol(coinId), [coinId]);
  const tvInterval = useMemo(() => getTVInterval(interval), [interval]);
  const [useIframe, setUseIframe] = useState(false);

  // ─── Approach 1: Script-based TradingView Advanced Chart Widget ───
  useEffect(() => {
    if (useIframe) return; // Skip if falling back to iframe
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = '';

    // Create the widget container structure that TradingView expects
    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.height = '100%';
    wrapper.style.width = '100%';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';

    wrapper.appendChild(widgetDiv);
    containerRef.current.appendChild(wrapper);

    // Create the script element with config
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;

    const config = {
      autosize: true,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'ru',
      allow_symbol_change: true,
      calendar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
      backgroundColor: 'rgba(15, 23, 42, 1)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      hide_side_toolbar: false,
      toolbar_bg: '#0f172a',
      enable_publishing: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      show_popup_button: false,
    };

    script.textContent = JSON.stringify(config);
    widgetDiv.appendChild(script);

    // Fallback: if script doesn't load in 8s, switch to iframe
    const fallbackTimer = setTimeout(() => {
      console.warn('[TradingViewWidget] Script approach timed out, switching to iframe fallback');
      setUseIframe(true);
    }, 8000);

    // Detect script load error
    script.onerror = () => {
      console.warn('[TradingViewWidget] Script failed to load, switching to iframe');
      clearTimeout(fallbackTimer);
      setUseIframe(true);
    };

    return () => {
      clearTimeout(fallbackTimer);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [tvSymbol, tvInterval, useIframe]);

  // ─── Approach 2: iframe fallback ───
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
      studies: '[%22RSI%40tv-basicstudies%22%2C%22MACD%40tv-basicstudies%22]',
    });
    return `https://s.tradingview.com/widgetembed/?frameElementId=tv&${params.toString()}`;
  }, [tvSymbol, tvInterval]);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden bg-[#0f172a]"
      style={{ height }}
    >
      {useIframe && (
        <iframe
          src={iframeSrc}
          width="100%"
          height="100%"
          style={{ border: 'none', display: 'block' }}
          allowFullScreen
          loading="lazy"
          title={`TradingView — ${tvSymbol}`}
          referrerpolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      )}
    </div>
  );
}