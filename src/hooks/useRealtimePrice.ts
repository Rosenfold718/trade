'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { PriceData } from './useRealtimePrices';

export interface RealtimePriceState {
  price: string;
  change24h: string;
  high24h: string;
  low24h: string;
  volume: string;
  connected: boolean;
  prevPrice: string;
}

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

/**
 * Subscribes to a single symbol's real-time price via Binance public WebSocket.
 * Works on Vercel / any deployment — no server-side mini-service needed.
 */
export function useRealtimePrice(symbol: string): RealtimePriceState {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<PriceData | null>(null);
  const [prevPrice, setPrevPrice] = useState('0');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolRef = useRef(symbol);

  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  const connectRef = useRef((sym: string) => {
    if (wsRef.current) return;

    const ws = new WebSocket(`${BINANCE_WS}/${sym.toLowerCase()}@ticker`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.e === '24hrTicker') {
          setPrevPrice(prev => {
            setData({
              symbol: msg.s,
              price: msg.c,
              change24h: msg.P,
              high24h: msg.h,
              low24h: msg.l,
              volume: msg.v,
              timestamp: msg.E,
            });
            return prev || msg.c;
          });
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(() => {
        if (!wsRef.current) {
          connectRef.current(symbolRef.current);
        }
      }, 3000);
    };

    ws.onerror = () => ws.close();
  });

  useEffect(() => {
    if (!symbol) return;
    // Close existing connection if symbol changed
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    connectRef.current(symbol);
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [symbol]);

  const result = useMemo<RealtimePriceState>(() => ({
    price: data?.price ?? '0',
    change24h: data?.change24h ?? '0',
    high24h: data?.high24h ?? '0',
    low24h: data?.low24h ?? '0',
    volume: data?.volume ?? '0',
    connected,
    prevPrice,
  }), [data, connected, prevPrice]);

  return result;
}