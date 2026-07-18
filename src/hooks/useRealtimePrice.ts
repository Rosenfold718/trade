'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import type { PriceData } from './useRealtimePrices';

export interface RealtimePriceState {
  price: string;
  change24h: string;
  high24h: string;
  low24h: string;
  volume: string;
  connected: boolean;
}

/**
 * Subscribes to a single symbol's real-time price.
 *
 * Usage:
 *   const { price, change24h, connected } = useRealtimePrice('BTCUSDT');
 */
export function useRealtimePrice(symbol: string): RealtimePriceState {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<PriceData | null>(null);

  // Memoize return value to avoid unnecessary re-renders
  const result = useMemo<RealtimePriceState>(() => ({
    price: data?.price ?? '0',
    change24h: data?.change24h ?? '0',
    high24h: data?.high24h ?? '0',
    low24h: data?.low24h ?? '0',
    volume: data?.volume ?? '0',
    connected,
  }), [data, connected]);

  useEffect(() => {
    if (!symbol) return;

    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Subscribe only to the requested symbol to save bandwidth
      socket.emit('subscribe:symbols', [symbol]);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Snapshot may contain our symbol
    socket.on('price:snapshot', (items: PriceData[]) => {
      for (const item of items) {
        if (item.symbol === symbol) {
          setData(item);
          break;
        }
      }
    });

    // Individual update for our symbol
    socket.on('price:update', (item: PriceData) => {
      if (item.symbol === symbol) {
        setData(item);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [symbol]);

  return result;
}