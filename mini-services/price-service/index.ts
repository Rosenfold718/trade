import { Server } from "socket.io";
import http from "http";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PriceData {
  symbol: string;
  price: string;
  change24h: string;
  high24h: string;
  low24h: string;
  volume: string;
  timestamp: number;
}

interface BinanceMiniTicker {
  s: string; // Symbol
  c: string; // Close/Last price
  P: string; // Price change percent (24h)
  h: string; // High price (24h)
  l: string; // Low price (24h)
  v: string; // Total traded base asset volume (24h)
  E: number; // Event time
}

// ─── State ───────────────────────────────────────────────────────────────────

const priceCache = new Map<string, PriceData>();
let binanceWs: WebSocket | null = null;
let binanceConnected = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let lastBinanceMessage = 0;
const HEARTBEAT_TIMEOUT_MS = 60000; // Binance sends data frequently, 60s silence = dead

// Track subscribed symbols per client
const clientFilters = new Map<string, Set<string>>();

// ─── Binance Connection ──────────────────────────────────────────────────────

function connectToBinance() {
  if (binanceWs && (binanceWs.readyState === WebSocket.OPEN || binanceWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  console.log("[Binance] Connecting to wss://stream.binance.com:9443/ws/!miniTicker@arr ...");

  try {
    binanceWs = new WebSocket("wss://stream.binance.com:9443/ws/!miniTicker@arr");

    binanceWs.onopen = () => {
      console.log("[Binance] Connected successfully");
      binanceConnected = true;
      reconnectAttempts = 0;
      lastBinanceMessage = Date.now();
      startHeartbeatCheck();
    };

    binanceWs.onmessage = (event: MessageEvent) => {
      lastBinanceMessage = Date.now();

      try {
        const data = JSON.parse(event.data as string);

        // The !miniTicker@arr stream sends an array of tickers
        if (Array.isArray(data)) {
          for (const ticker of data) {
            processTicker(ticker as BinanceMiniTicker);
          }
        } else {
          processTicker(data as BinanceMiniTicker);
        }
      } catch (err) {
        console.error("[Binance] Failed to parse message:", err);
      }
    };

    binanceWs.onclose = (event) => {
      console.log(`[Binance] Connection closed (code: ${event.code}, reason: ${event.reason})`);
      binanceConnected = false;
      cleanupHeartbeatCheck();
      scheduleReconnect();
    };

    binanceWs.onerror = (event) => {
      console.error("[Binance] WebSocket error:", event);
      binanceConnected = false;
    };
  } catch (err) {
    console.error("[Binance] Failed to create WebSocket:", err);
    binanceConnected = false;
    scheduleReconnect();
  }
}

function processTicker(ticker: BinanceMiniTicker) {
  const symbol = ticker.s;
  const priceData: PriceData = {
    symbol,
    price: ticker.c,
    change24h: ticker.P,
    high24h: ticker.h,
    low24h: ticker.l,
    volume: ticker.v,
    timestamp: ticker.E,
  };

  priceCache.set(symbol, priceData);

  // Broadcast to all connected Socket.IO clients (filtered)
  io.emit("price:update", priceData);
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  console.log(`[Binance] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToBinance();
  }, delay);
}

function startHeartbeatCheck() {
  cleanupHeartbeatCheck();
  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastBinanceMessage > HEARTBEAT_TIMEOUT_MS) {
      console.log("[Binance] No data received for 60s — connection may be stale, reconnecting...");
      binanceConnected = false;
      if (binanceWs) {
        binanceWs.close();
        binanceWs = null;
      }
      cleanupHeartbeatCheck();
      scheduleReconnect();
    }
  }, 10000);
}

function cleanupHeartbeatCheck() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ─── HTTP Server + Socket.IO ────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  // Health endpoint
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        binanceConnected,
        cachedSymbols: priceCache.size,
        reconnectAttempts,
        uptime: process.uptime(),
        timestamp: Date.now(),
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
  },
  pingInterval: 30000,
  pingTimeout: 10000,
});

io.on("connection", (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  clientFilters.set(socket.id, new Set());

  // Send current cache snapshot immediately
  const snapshot: PriceData[] = Array.from(priceCache.values());
  socket.emit("price:snapshot", snapshot);

  // Handle symbol subscription filter
  socket.on("subscribe:symbols", (symbols: string[]) => {
    const filter = clientFilters.get(socket.id);
    if (filter) {
      filter.clear();
      for (const sym of symbols) {
        filter.add(sym);
      }
      console.log(`[Socket.IO] Client ${socket.id} subscribed to ${symbols.length} symbols`);

      // Send filtered snapshot
      const filteredSnapshot = snapshot.filter((p) => filter.has(p.symbol));
      socket.emit("price:snapshot", filteredSnapshot);
    }
  });

  socket.on("unsubscribe:symbols", () => {
    const filter = clientFilters.get(socket.id);
    if (filter) {
      filter.clear();
      console.log(`[Socket.IO] Client ${socket.id} cleared subscriptions`);
      // Send full snapshot
      socket.emit("price:snapshot", snapshot);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);
    clientFilters.delete(socket.id);
  });
});

// ─── Override default broadcast to apply client filters ──────────────────────

const originalEmit = io.emit.bind(io);
io.emit = (event: string, ...args: unknown[]) => {
  if (event === "price:update") {
    const priceData = args[0] as PriceData;

    // Send to each client, respecting their filter
    for (const [socketId, socket] of io.of("/").sockets) {
      const filter = clientFilters.get(socketId);
      if (!filter || filter.size === 0 || filter.has(priceData.symbol)) {
        socket.emit(event, priceData);
      }
    }
    return true;
  }

  // For non-price events, use default broadcast
  return originalEmit(event, ...args);
};

// ─── Start Server ────────────────────────────────────────────────────────────

const PORT = 3003;

httpServer.listen(PORT, () => {
  console.log(`[Price Service] HTTP + Socket.IO server running on port ${PORT}`);
  console.log(`[Price Service] Health check: http://localhost:${PORT}/health`);
});

connectToBinance();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Price Service] Shutting down...");
  if (binanceWs) binanceWs.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  cleanupHeartbeatCheck();
  io.close();
  httpServer.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("\n[Price Service] Received SIGTERM, shutting down...");
  if (binanceWs) binanceWs.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  cleanupHeartbeatCheck();
  io.close();
  httpServer.close(() => process.exit(0));
});