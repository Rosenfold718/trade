'use client';

import { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { io, Socket } from 'socket.io-client';

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

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Connects to the price-service via Socket.IO and maintains a live Map of prices.
 *
 * Usage:
 *   const { prices, connected, lastUpdate, subscribeToSymbols } = useRealtimePrices();
 */
export function useRealtimePrices(): RealtimePricesState & {
  subscribeToSymbols: (symbols: string[]) => void;
} {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [prices, dispatch] = useReducer(pricesReducer, new Map<string, PriceData>());

  const subscribeToSymbols = useCallback((symbols: string[]) => {
    socketRef.current?.emit('subscribe:symbols', symbols);
  }, []);

  useEffect(() => {
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
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Receive initial snapshot of all cached prices
    socket.on('price:snapshot', (data: PriceData[]) => {
      dispatch({ type: 'snapshot', data });
      setLastUpdate(Date.now());
    });

    // Receive individual price updates
    socket.on('price:update', (data: PriceData) => {
      dispatch({ type: 'update', data });
      setLastUpdate(Date.now());
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { prices, connected, lastUpdate, subscribeToSymbols };
}