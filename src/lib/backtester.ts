/**
 * backtester.ts — Comprehensive backtesting engine for crypto trading signals.
 *
 * Walks forward through historical OHLCV data, generates signals at each bar,
 * opens/closes positions based on signal confidence and risk parameters,
 * and computes detailed performance metrics.
 */

import type { OHLCV, TradeSignal } from './technical-analysis';
import { generateTradeSignal } from './technical-analysis';
import { calculateRealisticPnL, COMMISSION_RATE, DEFAULT_SLIPPAGE } from './trading-engine';
import { BINANCE_BASE, COINGECKO_BASE, getBinanceSymbol, getBinanceInterval } from './api-sources';

// ============================================
// TYPES
// ============================================

export interface BacktestConfig {
  coinId: string;
  interval: string;           // e.g. '1h'
  startDate: string;          // ISO date
  endDate: string;            // ISO date
  initialBalance: number;     // default 1000
  riskPerTradePct: number;    // default 5
  maxOpenPositions: number;   // default 3
  leverage: number;           // default 3
  useTrailingStop: boolean;   // default false
  trailingStepPct: number;    // default 1.0
  stopOnMaxDrawdown: number;  // default 20 (%)
}

export interface BacktestTrade {
  id: string;
  coinId: string;
  direction: 'LONG' | 'SHORT';
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  leverage: number;
  grossPnl: number;
  commission: number;
  slippage: number;
  netPnl: number;
  pnlPct: number;
  result: 'WIN' | 'LOSS' | 'EXPIRED';
  exitReason: string;
  holdDuration: number; // hours
  confidence: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  expired: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  netProfitPct: number;
  maxDrawdownPct: number;
  maxDrawdownDuration: number; // hours
  avgWin: number;
  avgLoss: number;
  avgWinPct: number;
  avgLossPct: number;
  largestWin: number;
  largestLoss: number;
  avgHoldDuration: number;  // hours
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  expectancy: number;
  recoveryFactor: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  errors: string[];
}

// ============================================
// INTERNAL: OPEN POSITION TRACKER
// ============================================

interface OpenPosition {
  id: string;
  entryIndex: number;
  entryDate: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  // trailing stop tracking
  currentStopLoss: number;
  highestPrice: number;
  lowestPrice: number;
}

// ============================================
// HISTORICAL DATA FETCHING
// ============================================

/**
 * Fetch historical OHLCV data from Binance with pagination.
 * Falls back to CoinGecko if Binance fails.
 */
export async function fetchHistoricalOHLCV(
  coinId: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<{ data: OHLCV[]; source: string; errors: string[] }> {
  const errors: string[] = [];

  // --- Try Binance first ---
  const binanceSymbol = getBinanceSymbol(coinId);
  if (binanceSymbol) {
    try {
      const data = await fetchBinanceKlines(binanceSymbol, interval, startMs, endMs);
      if (data.length > 0) {
        return { data, source: 'binance', errors };
      }
      errors.push('Binance returned 0 candles');
    } catch (err: any) {
      errors.push(`Binance error: ${err.message || String(err)}`);
    }
  } else {
    errors.push(`No Binance symbol mapping for "${coinId}"`);
  }

  // --- Fallback: CoinGecko ---
  try {
    const data = await fetchCoinGeckoOHLCV(coinId, interval, startMs, endMs);
    if (data.length > 0) {
      return { data, source: 'coingecko', errors };
    }
    errors.push('CoinGecko returned 0 candles');
  } catch (err: any) {
    errors.push(`CoinGecko error: ${err.message || String(err)}`);
  }

  return { data: [], source: 'none', errors };
}

/**
 * Fetch Binance klines in chunks of 1000.
 * Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
 */
async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<OHLCV[]> {
  const binanceInterval = getBinanceInterval(interval);
  const pair = `${symbol}USDT`;
  const allCandles: OHLCV[] = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const url = `${BINANCE_BASE}/klines?symbol=${pair}&interval=${binanceInterval}&startTime=${cursor}&endTime=${endMs}&limit=1000`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const resp = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));

    if (!resp.ok) {
      throw new Error(`Binance API returned ${resp.status}`);
    }

    const rows: any[] = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const row of rows) {
      const candle: OHLCV = {
        timestamp: Number(row[0]),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      };
      allCandles.push(candle);
      // Move cursor past this candle
      if (candle.timestamp >= cursor) {
        cursor = candle.timestamp + 1;
      }
    }

    // If we got fewer than 1000, we've reached the end
    if (rows.length < 1000) break;

    // Small delay to avoid Binance rate limits
    await sleep(100);
  }

  // Remove duplicates and sort
  const seen = new Set<number>();
  const unique = allCandles.filter(c => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return true;
  });
  unique.sort((a, b) => a.timestamp - b.timestamp);
  return unique;
}

/**
 * Fetch CoinGecko OHLCV data as fallback.
 * CoinGecko /coins/{id}/ohlc endpoint returns [timestamp, open, high, low, close] arrays.
 * Limited to ~1 year for daily, ~90 days for hourly.
 */
async function fetchCoinGeckoOHLCV(
  coinId: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<OHLCV[]> {
  const days = Math.min(Math.ceil((endMs - startMs) / 86_400_000), 365);
  let cgDays: number;

  switch (interval) {
    case '1m': case '3m': case '5m': case '15m': case '30m':
      // CoinGecko doesn't support sub-hourly well, use hourly as closest
      cgDays = Math.min(days, 90);
      break;
    case '1h': case '2h':
      cgDays = Math.min(days, 90);
      break;
    case '4h':
      cgDays = Math.min(days, 180);
      break;
    default:
      cgDays = Math.min(days, 365);
  }

  const url = `${COINGECKO_BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${cgDays}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const resp = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));

  if (!resp.ok) {
    throw new Error(`CoinGecko API returned ${resp.status}`);
  }

  const rows: number[][] = await resp.json();
  if (!Array.isArray(rows)) return [];

  // CoinGecko returns [timestamp_ms, open, high, low, close] — no volume
  return rows
    .filter((r) => r[0] >= startMs && r[0] <= endMs)
    .map((r) => ({
      timestamp: r[0],
      open: r[1],
      high: r[2],
      low: r[3],
      close: r[4],
      volume: 0, // CoinGecko OHLC doesn't include volume
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ============================================
// CORE BACKTEST ENGINE
// ============================================

/**
 * Run a full backtest over historical data.
 * Uses AbortSignal for a 2-minute overall timeout.
 */
export async function runBacktest(
  config: BacktestConfig,
  signal?: AbortSignal,
): Promise<BacktestResult> {
  const errors: string[] = [];
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let tradeCounter = 0;

  // Apply defaults
  const cfg: BacktestConfig = {
    coinId: config.coinId,
    interval: config.interval || '1h',
    startDate: config.startDate,
    endDate: config.endDate,
    initialBalance: config.initialBalance ?? 1000,
    riskPerTradePct: config.riskPerTradePct ?? 5,
    maxOpenPositions: config.maxOpenPositions ?? 3,
    leverage: config.leverage ?? 3,
    useTrailingStop: config.useTrailingStop ?? false,
    trailingStepPct: config.trailingStepPct ?? 1.0,
    stopOnMaxDrawdown: config.stopOnMaxDrawdown ?? 20,
  };

  // Convert dates to ms
  const startMs = new Date(cfg.startDate).getTime();
  const endMs = new Date(cfg.endDate).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    errors.push('Invalid date format. Use ISO 8601 strings.');
    return buildResult(cfg, [], [], errors);
  }

  if (startMs >= endMs) {
    errors.push('startDate must be before endDate.');
    return buildResult(cfg, [], [], errors);
  }

  // 1. Fetch historical data
  let ohlcv: OHLCV[];
  try {
    const fetchResult = await withAbort(
      fetchHistoricalOHLCV(cfg.coinId, cfg.interval, startMs, endMs),
      signal,
    );
    ohlcv = fetchResult.data;
    errors.push(...fetchResult.errors);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      errors.push('Backtest aborted (timeout or manual cancel).');
      return buildResult(cfg, [], [], errors);
    }
    errors.push(`Failed to fetch historical data: ${err.message || String(err)}`);
    return buildResult(cfg, [], [], errors);
  }

  if (ohlcv.length < 120) {
    errors.push(`Insufficient historical data: ${ohlcv.length} candles (need at least 120).`);
    return buildResult(cfg, [], [], errors);
  }

  // Calculate hours per candle
  const hoursPerCandle = intervalToHours(cfg.interval);

  // 2. Walk forward
  const MIN_LOOKBACK = 100; // need enough data for indicators
  let balance = cfg.initialBalance;
  let peakEquity = cfg.initialBalance;
  let maxDrawdownPct = 0;
  let maxDrawdownStart = 0;
  const openPositions: OpenPosition[] = [];
  let stoppedDueToDrawdown = false;
  let lastSignalDirection: 'LONG' | 'SHORT' | 'FLAT' = 'FLAT';

  for (let i = MIN_LOOKBACK; i < ohlcv.length; i++) {
    // Check abort
    if (signal?.aborted) {
      errors.push('Backtest aborted mid-run.');
      break;
    }

    const candle = ohlcv[i];
    const candleDate = new Date(candle.timestamp).toISOString();

    // --- Generate signal on current slice ---
    let sig: TradeSignal;
    try {
      sig = generateTradeSignal(ohlcv.slice(0, i + 1), cfg.interval);
    } catch (err: any) {
      // If signal generation fails, skip this candle
      continue;
    }

    // --- Manage open positions ---
    const closedIndices: number[] = [];

    for (let p = 0; p < openPositions.length; p++) {
      const pos = openPositions[p];
      const price = candle.close;
      const high = candle.high;
      const low = candle.low;

      // Track highest/lowest for trailing stop
      if (high > pos.highestPrice) pos.highestPrice = high;
      if (low < pos.lowestPrice) pos.lowestPrice = low;

      // --- Trailing stop update ---
      if (cfg.useTrailingStop) {
        const trailingResult = updateSimpleTrailingStop(
          pos,
          price,
          cfg.trailingStepPct,
        );
        if (trailingResult.newStop != null) {
          pos.currentStopLoss = trailingResult.newStop;
        }
        if (trailingResult.triggered) {
          // Close at current stop loss
          closedIndices.push(p);
          const exitPrice = pos.currentStopLoss;
          const pnlResult = calculateRealisticPnL({
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            exitPrice,
            quantity: pos.quantity,
            leverage: cfg.leverage,
          });
          const holdHours = (candle.timestamp - new Date(pos.entryDate).getTime()) / 3_600_000;
          const isWin = pnlResult.netPnl > 0;

          balance += pnlResult.netPnl;
          tradeCounter++;
          trades.push({
            id: `bt-${tradeCounter}`,
            coinId: cfg.coinId,
            direction: pos.direction,
            entryDate: pos.entryDate,
            exitDate: candleDate,
            entryPrice: pos.entryPrice,
            exitPrice,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
            quantity: pos.quantity,
            leverage: cfg.leverage,
            grossPnl: pnlResult.grossPnl,
            commission: pnlResult.commission,
            slippage: pnlResult.slippage,
            netPnl: pnlResult.netPnl,
            pnlPct: (pnlResult.netPnl / (pos.entryPrice * pos.quantity)) * 100,
            result: isWin ? 'WIN' : 'LOSS',
            exitReason: 'trailing_stop',
            holdDuration: Math.round(holdHours * 10) / 10,
            confidence: pos.confidence,
          });
          continue;
        }
      }

      // --- Check stop loss ---
      let stopHit = false;
      if (pos.direction === 'LONG' && low <= pos.currentStopLoss) {
        stopHit = true;
      } else if (pos.direction === 'SHORT' && high >= pos.currentStopLoss) {
        stopHit = true;
      }

      if (stopHit) {
        closedIndices.push(p);
        const pnlResult = calculateRealisticPnL({
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: pos.currentStopLoss,
          quantity: pos.quantity,
          leverage: cfg.leverage,
        });
        const holdHours = (candle.timestamp - new Date(pos.entryDate).getTime()) / 3_600_000;

        balance += pnlResult.netPnl;
        tradeCounter++;
        trades.push({
          id: `bt-${tradeCounter}`,
          coinId: cfg.coinId,
          direction: pos.direction,
          entryDate: pos.entryDate,
          exitDate: candleDate,
          entryPrice: pos.entryPrice,
          exitPrice: pos.currentStopLoss,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          quantity: pos.quantity,
          leverage: cfg.leverage,
          grossPnl: pnlResult.grossPnl,
          commission: pnlResult.commission,
          slippage: pnlResult.slippage,
          netPnl: pnlResult.netPnl,
          pnlPct: (pnlResult.netPnl / (pos.entryPrice * pos.quantity)) * 100,
          result: 'LOSS',
          exitReason: 'stop_loss',
          holdDuration: Math.round(holdHours * 10) / 10,
          confidence: pos.confidence,
        });
        continue;
      }

      // --- Check take profit ---
      let tpHit = false;
      if (pos.direction === 'LONG' && high >= pos.takeProfit) {
        tpHit = true;
      } else if (pos.direction === 'SHORT' && low <= pos.takeProfit) {
        tpHit = true;
      }

      if (tpHit) {
        closedIndices.push(p);
        const pnlResult = calculateRealisticPnL({
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: pos.takeProfit,
          quantity: pos.quantity,
          leverage: cfg.leverage,
        });
        const holdHours = (candle.timestamp - new Date(pos.entryDate).getTime()) / 3_600_000;

        balance += pnlResult.netPnl;
        tradeCounter++;
        trades.push({
          id: `bt-${tradeCounter}`,
          coinId: cfg.coinId,
          direction: pos.direction,
          entryDate: pos.entryDate,
          exitDate: candleDate,
          entryPrice: pos.entryPrice,
          exitPrice: pos.takeProfit,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          quantity: pos.quantity,
          leverage: cfg.leverage,
          grossPnl: pnlResult.grossPnl,
          commission: pnlResult.commission,
          slippage: pnlResult.slippage,
          netPnl: pnlResult.netPnl,
          pnlPct: (pnlResult.netPnl / (pos.entryPrice * pos.quantity)) * 100,
          result: 'WIN',
          exitReason: 'take_profit',
          holdDuration: Math.round(holdHours * 10) / 10,
          confidence: pos.confidence,
        });
        continue;
      }

      // --- Check signal expiry: close if signal is opposite direction ---
      const isOpposite =
        (pos.direction === 'LONG' && sig.direction === 'SHORT') ||
        (pos.direction === 'SHORT' && sig.direction === 'LONG') ||
        sig.direction === 'FLAT';

      if (isOpposite && lastSignalDirection !== sig.direction) {
        closedIndices.push(p);
        const pnlResult = calculateRealisticPnL({
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: candle.close,
          quantity: pos.quantity,
          leverage: cfg.leverage,
        });
        const holdHours = (candle.timestamp - new Date(pos.entryDate).getTime()) / 3_600_000;
        const isWin = pnlResult.netPnl > 0;

        balance += pnlResult.netPnl;
        tradeCounter++;
        trades.push({
          id: `bt-${tradeCounter}`,
          coinId: cfg.coinId,
          direction: pos.direction,
          entryDate: pos.entryDate,
          exitDate: candleDate,
          entryPrice: pos.entryPrice,
          exitPrice: candle.close,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          quantity: pos.quantity,
          leverage: cfg.leverage,
          grossPnl: pnlResult.grossPnl,
          commission: pnlResult.commission,
          slippage: pnlResult.slippage,
          netPnl: pnlResult.netPnl,
          pnlPct: (pnlResult.netPnl / (pos.entryPrice * pos.quantity)) * 100,
          result: isWin ? 'WIN' : 'EXPIRED',
          exitReason: `signal_${sig.direction.toLowerCase()}`,
          holdDuration: Math.round(holdHours * 10) / 10,
          confidence: pos.confidence,
        });
      }
    }

    // Remove closed positions (reverse order to preserve indices)
    for (let ci = closedIndices.length - 1; ci >= 0; ci--) {
      openPositions.splice(closedIndices[ci], 1);
    }

    // --- Check max drawdown stop ---
    if (balance < peakEquity) {
      const ddPct = ((peakEquity - balance) / peakEquity) * 100;
      if (ddPct > maxDrawdownPct) {
        maxDrawdownPct = ddPct;
        maxDrawdownStart = peakEquity;
      }
      if (ddPct >= cfg.stopOnMaxDrawdown) {
        // Close all open positions at market
        for (const pos of openPositions) {
          const pnlResult = calculateRealisticPnL({
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            exitPrice: candle.close,
            quantity: pos.quantity,
            leverage: cfg.leverage,
          });
          const holdHours = (candle.timestamp - new Date(pos.entryDate).getTime()) / 3_600_000;
          balance += pnlResult.netPnl;
          tradeCounter++;
          trades.push({
            id: `bt-${tradeCounter}`,
            coinId: cfg.coinId,
            direction: pos.direction,
            entryDate: pos.entryDate,
            exitDate: candleDate,
            entryPrice: pos.entryPrice,
            exitPrice: candle.close,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
            quantity: pos.quantity,
            leverage: cfg.leverage,
            grossPnl: pnlResult.grossPnl,
            commission: pnlResult.commission,
            slippage: pnlResult.slippage,
            netPnl: pnlResult.netPnl,
            pnlPct: (pnlResult.netPnl / (pos.entryPrice * pos.quantity)) * 100,
            result: pnlResult.netPnl > 0 ? 'WIN' : 'LOSS',
            exitReason: 'max_drawdown_stop',
            holdDuration: Math.round(holdHours * 10) / 10,
            confidence: pos.confidence,
          });
        }
        openPositions.length = 0;
        stoppedDueToDrawdown = true;
        errors.push(`Trading stopped at ${candleDate}: max drawdown ${ddPct.toFixed(1)}% exceeded ${cfg.stopOnMaxDrawdown}%`);
        break;
      }
    }

    if (balance > peakEquity) {
      peakEquity = balance;
    }

    // --- Record equity curve point ---
    const currentDrawdown = peakEquity > 0
      ? ((peakEquity - balance) / peakEquity) * 100
      : 0;
    equityCurve.push({
      date: candleDate,
      equity: Math.round(balance * 100) / 100,
      drawdown: Math.round(currentDrawdown * 100) / 100,
    });

    // --- Open new position if signal qualifies ---
    if (stoppedDueToDrawdown) break;

    const canOpen =
      sig.direction === 'LONG' || sig.direction === 'SHORT';
    const hasConfidence = sig.confidence >= 60;
    const isSignalNew = sig.direction !== lastSignalDirection;
    const withinMaxPositions = openPositions.length < cfg.maxOpenPositions;
    const hasBalance = balance > 0;

    if (canOpen && hasConfidence && isSignalNew && withinMaxPositions && hasBalance) {
      const riskAmount = balance * (cfg.riskPerTradePct / 100);
      const stopDistance = Math.abs(sig.entry - sig.stopLoss);
      const atr = sig.atr > 0 ? sig.atr : stopDistance;

      if (stopDistance <= 0 || atr <= 0) {
        lastSignalDirection = sig.direction;
        continue;
      }

      const quantity = riskAmount / (stopDistance * cfg.leverage);
      const positionCost = sig.entry * quantity;
      const maxPositionCost = balance * 0.95; // don't use more than 95% of balance

      if (positionCost > maxPositionCost) {
        // Reduce quantity to fit
        const adjustedQuantity = maxPositionCost / sig.entry;
        if (adjustedQuantity * stopDistance * cfg.leverage > 0 && sig.direction !== 'FLAT') {
          tradeCounter++;
          openPositions.push({
            id: `pos-${tradeCounter}`,
            entryIndex: i,
            entryDate: candleDate,
            entryPrice: sig.entry,
            stopLoss: sig.stopLoss,
            takeProfit: sig.takeProfit1,
            quantity: adjustedQuantity,
            direction: sig.direction,
            confidence: sig.confidence,
            currentStopLoss: sig.stopLoss,
            highestPrice: sig.entry,
            lowestPrice: sig.entry,
          });
        }
      } else {
        if (sig.direction !== 'FLAT') {
          tradeCounter++;
          openPositions.push({
            id: `pos-${tradeCounter}`,
            entryIndex: i,
            entryDate: candleDate,
            entryPrice: sig.entry,
            stopLoss: sig.stopLoss,
            takeProfit: sig.takeProfit1,
            quantity,
            direction: sig.direction,
            confidence: sig.confidence,
            currentStopLoss: sig.stopLoss,
            highestPrice: sig.entry,
            lowestPrice: sig.entry,
          });
        }
      }
    }

    lastSignalDirection = sig.direction;
  }

  // Close any remaining open positions at last known price
  if (openPositions.length > 0 && ohlcv.length > 0) {
    const lastCandle = ohlcv[ohlcv.length - 1];
    const lastDate = new Date(lastCandle.timestamp).toISOString();

    for (const pos of openPositions) {
      const pnlResult = calculateRealisticPnL({
        direction: pos.direction,
        entryPrice: pos.entryPrice,
        exitPrice: lastCandle.close,
        quantity: pos.quantity,
        leverage: cfg.leverage,
      });
      const holdHours = (lastCandle.timestamp - new Date(pos.entryDate).getTime()) / 3_600_000;
      balance += pnlResult.netPnl;
      tradeCounter++;
      trades.push({
        id: `bt-${tradeCounter}`,
        coinId: cfg.coinId,
        direction: pos.direction,
        entryDate: pos.entryDate,
        exitDate: lastDate,
        entryPrice: pos.entryPrice,
        exitPrice: lastCandle.close,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        quantity: pos.quantity,
        leverage: cfg.leverage,
        grossPnl: pnlResult.grossPnl,
        commission: pnlResult.commission,
        slippage: pnlResult.slippage,
        netPnl: pnlResult.netPnl,
        pnlPct: (pnlResult.netPnl / (pos.entryPrice * pos.quantity)) * 100,
        result: pnlResult.netPnl > 0 ? 'WIN' : 'LOSS',
        exitReason: 'end_of_data',
        holdDuration: Math.round(holdHours * 10) / 10,
        confidence: pos.confidence,
      });
    }
  }

  // 3. Calculate metrics
  const metrics = calculateMetrics(trades, equityCurve, cfg.initialBalance, hoursPerCandle);

  return buildResult(cfg, trades, equityCurve, errors, metrics);
}

// ============================================
// TRAILING STOP HELPER
// ============================================

function updateSimpleTrailingStop(
  pos: OpenPosition,
  currentPrice: number,
  stepPct: number,
): { newStop: number | null; triggered: boolean } {
  if (pos.direction === 'LONG') {
    const activationPrice = pos.entryPrice * (1 + stepPct / 100);
    if (currentPrice < activationPrice) {
      return { newStop: null, triggered: false };
    }
    // Move stop to breakeven first, then trail
    let newStop = pos.entryPrice; // breakeven
    // If price moved further, trail at stepPct below highest
    const trailPrice = pos.highestPrice * (1 - stepPct / 100);
    if (trailPrice > newStop) {
      newStop = trailPrice;
    }
    // Never move stop down
    if (newStop <= pos.currentStopLoss) {
      // Check if price hit current stop
      if (currentPrice <= pos.currentStopLoss) {
        return { newStop: null, triggered: true };
      }
      return { newStop: null, triggered: false };
    }
    // Check if price hit new stop
    if (currentPrice <= newStop) {
      return { newStop, triggered: true };
    }
    return { newStop, triggered: false };
  } else {
    // SHORT
    const activationPrice = pos.entryPrice * (1 - stepPct / 100);
    if (currentPrice > activationPrice) {
      return { newStop: null, triggered: false };
    }
    let newStop = pos.entryPrice; // breakeven
    const trailPrice = pos.lowestPrice * (1 + stepPct / 100);
    if (trailPrice < newStop) {
      newStop = trailPrice;
    }
    // Never move stop up (for shorts)
    if (newStop >= pos.currentStopLoss) {
      if (currentPrice >= pos.currentStopLoss) {
        return { newStop: null, triggered: true };
      }
      return { newStop: null, triggered: false };
    }
    if (currentPrice >= newStop) {
      return { newStop, triggered: true };
    }
    return { newStop, triggered: false };
  }
}

// ============================================
// METRICS CALCULATION
// ============================================

function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: EquityPoint[],
  initialBalance: number,
  hoursPerCandle: number,
): BacktestMetrics {
  const total = trades.length;
  const wins = trades.filter(t => t.result === 'WIN');
  const losses = trades.filter(t => t.result === 'LOSS');
  const expired = trades.filter(t => t.result === 'EXPIRED');

  const winRate = total > 0 ? (wins.length / total) * 100 : 0;

  const grossProfit = wins.reduce((s, t) => s + t.grossPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.grossPnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const netProfit = trades.reduce((s, t) => s + t.netPnl, 0);
  const netProfitPct = initialBalance > 0 ? (netProfit / initialBalance) * 100 : 0;

  // Max drawdown from equity curve
  let peak = initialBalance;
  let mdd = 0;
  let mddDurationHours = 0;
  let mddStartPeakTime = 0;
  let currentDdStart = 0;

  for (const pt of equityCurve) {
    if (pt.equity > peak) {
      peak = pt.equity;
      currentDdStart = 0;
    }
    const dd = peak > 0 ? ((peak - pt.equity) / peak) * 100 : 0;
    if (dd > mdd) {
      mdd = dd;
      // Track duration from peak to trough
    }
  }

  // Calculate max drawdown duration from equity curve
  let ddStartIdx = 0;
  let maxDdDurationHours = 0;
  let localPeak = initialBalance;
  let localPeakIdx = 0;

  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i].equity > localPeak) {
      localPeak = equityCurve[i].equity;
      localPeakIdx = i;
    }
    const dd = localPeak > 0 ? ((localPeak - equityCurve[i].equity) / localPeak) * 100 : 0;
    if (dd > 0.01) {
      const durationHours = (i - localPeakIdx) * hoursPerCandle;
      if (durationHours > maxDdDurationHours) {
        maxDdDurationHours = durationHours;
      }
    }
  }

  // Use mdd from equity curve if it's larger
  if (mdd === 0 && equityCurve.length > 0) {
    mdd = 0; // no drawdown
  }

  // Avg win/loss
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.netPnl, 0) / losses.length : 0;
  const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.netPnl)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.netPnl)) : 0;
  const avgHoldDuration = total > 0
    ? trades.reduce((s, t) => s + t.holdDuration, 0) / total
    : 0;

  // Sharpe, Sortino, Calmar ratios
  const pnls = trades.map(t => t.netPnl);
  const avgPnl = total > 0 ? pnls.reduce((s, p) => s + p, 0) / total : 0;
  const stdPnl = total > 1
    ? Math.sqrt(pnls.reduce((s, p) => s + (p - avgPnl) ** 2, 0) / (total - 1))
    : 0;

  // Annualization factor: how many "trades worth of time" in a year
  // If avg hold = 12 hours, and we trade ~250 24h-equivalent periods/year
  const avgHold = avgHoldDuration > 0 ? avgHoldDuration : hoursPerCandle;
  const tradesPerYear = (365 * 24) / avgHold;
  const annualizationFactor = Math.sqrt(tradesPerYear);

  const sharpeRatio = stdPnl > 0 ? (avgPnl / stdPnl) * annualizationFactor : 0;

  // Sortino: use only negative PnL for downside deviation
  const negativePnls = pnls.filter(p => p < 0);
  const downsideDev = negativePnls.length > 1
    ? Math.sqrt(negativePnls.reduce((s, p) => s + p ** 2, 0) / (negativePnls.length - 1))
    : 0;
  const sortinoRatio = downsideDev > 0 ? (avgPnl / downsideDev) * annualizationFactor : 0;

  // Calmar: annualized return / max drawdown
  const totalHours = equityCurve.length * hoursPerCandle;
  const years = totalHours / (365 * 24);
  const annualizedReturn = years > 0 ? (Math.pow(1 + netProfitPct / 100, 1 / years) - 1) * 100 : 0;
  const calmarRatio = mdd > 0 ? annualizedReturn / mdd : 0;

  // Expectancy: average $ per trade
  const expectancy = total > 0 ? netProfit / total : 0;

  // Recovery factor: net profit / max drawdown $
  const mddDollar = initialBalance * (mdd / 100);
  const recoveryFactor = mddDollar > 0 ? netProfit / mddDollar : netProfit > 0 ? Infinity : 0;

  return {
    totalTrades: total,
    wins: wins.length,
    losses: losses.length,
    expired: expired.length,
    winRate: Math.round(winRate * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    netProfitPct: Math.round(netProfitPct * 100) / 100,
    maxDrawdownPct: Math.round(mdd * 100) / 100,
    maxDrawdownDuration: Math.round(maxDdDurationHours),
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    avgWinPct: Math.round(avgWinPct * 100) / 100,
    avgLossPct: Math.round(avgLossPct * 100) / 100,
    largestWin: Math.round(largestWin * 100) / 100,
    largestLoss: Math.round(largestLoss * 100) / 100,
    avgHoldDuration: Math.round(avgHoldDuration * 10) / 10,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    recoveryFactor: Math.round(recoveryFactor * 100) / 100,
  };
}

// ============================================
// HELPERS
// ============================================

function buildResult(
  config: BacktestConfig,
  trades: BacktestTrade[],
  equityCurve: EquityPoint[],
  errors: string[],
  metrics?: BacktestMetrics,
): BacktestResult {
  const emptyMetrics: BacktestMetrics = {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    expired: 0,
    winRate: 0,
    profitFactor: 0,
    netProfit: 0,
    netProfitPct: 0,
    maxDrawdownPct: 0,
    maxDrawdownDuration: 0,
    avgWin: 0,
    avgLoss: 0,
    avgWinPct: 0,
    avgLossPct: 0,
    largestWin: 0,
    largestLoss: 0,
    avgHoldDuration: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    expectancy: 0,
    recoveryFactor: 0,
  };

  return {
    config,
    trades,
    equityCurve,
    metrics: metrics || emptyMetrics,
    errors,
  };
}

function intervalToHours(interval: string): number {
  const map: Record<string, number> = {
    '1m': 1 / 60,
    '3m': 3 / 60,
    '5m': 5 / 60,
    '15m': 15 / 60,
    '30m': 30 / 60,
    '1h': 1,
    '2h': 2,
    '4h': 4,
    '6h': 6,
    '12h': 12,
    '1d': 24,
    '1w': 168,
  };
  return map[interval] || 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise
      .then(val => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      })
      .catch(err => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });
  });
}