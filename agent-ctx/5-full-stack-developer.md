# Task 5 — Real-time Crypto Price WebSocket Service

## Summary
Created a WebSocket mini-service that streams real-time crypto prices from Binance via Socket.IO, plus two React hooks for consuming the data.

## Files Created

### 1. `mini-services/price-service/package.json`
- Standalone Bun project with `socket.io` dependency
- Dev script: `bun --hot index.ts`

### 2. `mini-services/price-service/index.ts`
- **Port**: 3003
- **Binance connection**: `wss://stream.binance.com:9443/ws/!miniTicker@arr` (all mini tickers at once)
- **Re-broadcast**: Per-client Socket.IO with symbol filtering support
- **Price data shape**: `{ symbol, price, change24h, high24h, low24h, volume, timestamp }`
- **Auto-reconnect**: Exponential backoff (1s → max 30s)
- **Health endpoint**: `GET /health` returns `{ status, binanceConnected, cachedSymbols, reconnectAttempts, uptime, timestamp }`
- **Heartbeat**: Ping/pong every 30s (Socket.IO built-in) + stale connection detection (60s silence check every 10s)
- **In-memory cache**: Serves last known prices when Binance is disconnected
- **Per-client filtering**: `subscribe:symbols` / `unsubscribe:symbols` events to limit bandwidth
- **Graceful shutdown**: SIGINT/SIGTERM handlers

### 3. `src/hooks/useRealtimePrices.ts`
- Multi-symbol hook using `useReducer` for the prices Map
- Connects via `io('/?XTransformPort=3003')`
- Returns `{ prices: Map<string, PriceData>, connected, lastUpdate, subscribeToSymbols }`
- Auto-reconnects, receives initial snapshot on connect

### 4. `src/hooks/useRealtimePrice.ts`
- Single-symbol convenience hook
- `useRealtimePrice('BTCUSDT')` → `{ price, change24h, high24h, low24h, volume, connected }`
- Automatically subscribes to only the requested symbol

## Dependencies Installed
- `socket.io@4.8.3` in `mini-services/price-service`
- `socket.io-client@4.8.3` in main project

## Verification
- TypeScript strict mode: ✅ No errors (both hooks and mini-service)
- ESLint: ✅ No errors in new files
- Pre-existing lint errors in other files remain unchanged

## Notes
- Service is NOT started — main agent will handle that
- The `io.emit` override in the server applies per-client symbol filters