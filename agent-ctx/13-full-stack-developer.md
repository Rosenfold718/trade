# Task 13 — Backtesting Engine & API Route

## Agent: full-stack-developer

## Files Created

### 1. `/src/lib/backtester.ts`
Comprehensive backtesting engine with:

- **`BacktestConfig`** interface — all configurable parameters (coin, interval, dates, balance, risk%, max positions, leverage, trailing stop, max drawdown stop)
- **`BacktestTrade`** interface — full trade record with entry/exit, PnL breakdown, result classification
- **`BacktestResult`** interface — config + trades + equity curve + metrics + errors
- **`fetchHistoricalOHLCV()`** — fetches from Binance klines API with 1000-candle pagination, falls back to CoinGecko OHLC endpoint
- **`runBacktest()`** — main walk-forward engine:
  - Starts at index 100 (enough lookback for all indicators)
  - Calls `generateTradeSignal()` on each candle slice
  - Opens positions when signal is LONG/SHORT with confidence >= 60, respects max positions and balance
  - Closes positions on: stop loss hit, take profit hit, trailing stop triggered, signal reversal/FLAT, max drawdown stop, or end of data
  - Uses `calculateRealisticPnL()` for commission + slippage on every close
  - Supports trailing stop with configurable step %
  - Tracks equity curve and drawdown throughout
  - Closes remaining open positions at last price
- **`calculateMetrics()`** — computes all 20 metrics:
  - Win rate, profit factor, net profit/pct, max drawdown % & duration
  - Avg win/loss (dollar & pct), largest win/loss
  - Sharpe, Sortino, Calmar ratios (annualized)
  - Expectancy (avg $ per trade), recovery factor
- **`withAbort()`** — wraps promises with AbortSignal support

### 2. `/src/app/api/crypto/backtest/route.ts`
GET API endpoint with:
- Query params: `coin` (required), `interval`, `days`, `balance`, `leverage`, `risk`, `trailingStop`, `maxPositions`
- Strict input validation for all parameters
- Rate limiting: 2 requests per 60 seconds (via existing `rateLimit` + `RATE_LIMITS`)
- 2-minute timeout via `AbortSignal.timeout(120000)`
- Proper error responses (400, 429, 500, 504)

### 3. `/src/lib/api-rate-limits.ts` (modified)
Added `backtest: { windowMs: 60000, maxRequests: 2 }` entry.

## Integration Points
- Uses `generateTradeSignal()` from `technical-analysis.ts` (synchronous, no multi-TF for backtest speed)
- Uses `calculateRealisticPnL()`, `COMMISSION_RATE`, `DEFAULT_SLIPPAGE` from `trading-engine.ts`
- Uses `getBinanceSymbol()`, `getBinanceInterval()`, `BINANCE_BASE`, `COINGECKO_BASE` from `api-sources.ts`
- Uses `rateLimit()` from `rate-limit.ts` and `RATE_LIMITS` from `api-rate-limits.ts`

## Lint
`bun run lint` passes with zero errors.

## Notes
- No database used — backtest is fully computed on-the-fly
- No frontend changes required for this task
- The engine skips multi-timeframe analysis during backtesting for performance (thousands of candles × signal generation would be too slow)