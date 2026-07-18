'use client';

import { useEffect, useRef, useState, useCallback, useReducer } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PriceData {
  symbol: string;
  price: string;
  change24h: string;
  high24h: string;
  low24h: string;
  volume: string;
  timestamp: number;
}

export interface RealtimePricesState {
  prices: Map<string, PriceData>;
  connected: boolean;
  lastUpdate: number;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'snapshot'; data: PriceData[] }
  | { type: 'update'; data: PriceData };

function pricesReducer(state: Map<string, PriceData>, action: Action): Map<string, PriceData> {
  const next = new Map(state);
  if (action.type === 'snapshot') {
    for (const item of action.data) {
      next.set(item.symbol, item);
    }
  } else {
    next.set(action.data.symbol, action.data);
  }
  return next;
}

// ─── Binance WebSocket (direct — works on Vercel) ────────────────────────────

const BINANCE_WS = 'wss://stream.binance.com:9443/stream';

/**
 * Connects to Binance's public WebSocket directly from the browser.
 * Maintains a live Map of prices for subscribed symbols.
 * No server-side mini-service needed — works on Vercel, Netlify, etc.
 */
export function useRealtimePrices(): RealtimePricesState & {
  subscribeToSymbols: (symbols: string[]) => void;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [prices, dispatch] = useReducer(pricesReducer, new Map<string, PriceData>());
  const subscribedRef = useRef<Set<string>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolsRef = useRef<string[]>([]);

  const connectRef = useRef((syms: string[]) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (syms.length === 0) return;

    symbolsRef.current = syms;
    const streams = syms.map(s => `${s.toLowerCase()}@ticker`).join('/');
    const ws = new WebSocket(`${BINANCE_WS}?streams=${streams}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const wrapper = JSON.parse(event.data);
        const msg = wrapper.data;
        if (msg?.e === '24hrTicker') {
          dispatch({
            type: 'update',
            data: {
              symbol: msg.s,
              price: msg.c,
              change24h: msg.P,
              high24h: msg.h,
              low24h: msg.l,
              volume: msg.v,
              timestamp: msg.E,
            },
          });
          setLastUpdate(Date.now());
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      const currentSymbols = [...symbolsRef.current];
      reconnectTimer.current = setTimeout(() => {
        if (!wsRef.current && currentSymbols.length > 0) {
          connectRef.current(currentSymbols);
        }
      }, 3000);
    };

    ws.onerror = () => ws.close();
  });

  const subscribeToSymbols = useCallback((symbols: string[]) => {
    const newSymbols = symbols.filter(s => !subscribedRef.current.has(s));
    if (newSymbols.length === 0) return;

    const allSymbols = [...subscribedRef.current, ...newSymbols];
    subscribedRef.current = new Set(allSymbols);
    connectRef.current(allSymbols);
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return { prices, connected, lastUpdate, subscribeToSymbols };
}