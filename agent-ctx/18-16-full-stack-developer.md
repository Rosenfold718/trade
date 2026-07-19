# Task 18-16: P&L Dashboard + Enhanced Adaptive Learning

## Completed: 2025-01-01

### Part 1: Performance API Endpoint
- **File**: `/src/app/api/crypto/performance/route.ts`
- **Route**: `GET /api/crypto/performance`
- **Rate Limit**: 30 req / 30s
- **Data Sources**: `getTradingStats()`, `getTraderState()`, `getDepositSnapshots()`, `getResolvedTrades()`
- **Returns**:
  - Key metrics: totalPnl, totalPnlPct, winRate, profitFactor, sharpeRatio, maxDrawdown, totalTrades
  - Additional: avgWin, avgLoss, expectancy, calmarRatio, sortinoRatio, consecutiveWins/Losses
  - Monthly breakdown (last 6 months): trades, wins, losses, pnl, winRate
  - Direction breakdown (LONG/SHORT): total, wins, winRate, totalPnl, avgPnl
  - Coin breakdown (top 5 most traded): total, wins, winRate, totalPnl
  - Average hold hours, avg P&L per trade
  - Recent trend (last 10 trades)
  - Equity curve data for charting

### Part 2: PerformanceDashboard Component
- **File**: `/src/components/trading/PerformanceDashboard.tsx`
- **Props**: `{ visible: boolean; onClose: () => void }`
- **Section 1**: Key Metrics Grid (6 cards) — Total P&L, Win Rate, Profit Factor, Sharpe Ratio, Max Drawdown, Total Trades
- **Section 2**: Equity Curve Chart using `EquityChart` component from existing codebase
- **Section 3**: Monthly Breakdown — recharts BarChart + Table with green/red coloring
- **Section 4**: Performance by Metric — Direction stats, Coin stats, Average hold time, Avg P&L, Recent trades trend
- All text in Russian, uses shadcn/ui components (Card, Table, Badge, Button, Skeleton)
- Color-coded: green for profit, red for loss, amber for warnings

### Part 3: Enhanced Adaptive Learning System
- **File**: `/src/lib/adaptive-learning.ts`
- **Exports**:
  - `EnhancedAdaptiveParams` — extends legacy params with regime-aware and win pattern data
  - `analyzeTradePatterns(trades)` — finds best timeframe, direction bias, confidence range, time-of-day patterns
  - `getRegimeParams(params, regime)` — returns adjusted minConfidence/minRr/leverageMultiplier per regime
  - `shouldPauseTrading(params)` — consecutive loss protection (3 losses → 30 min pause)
  - `updateAdaptiveFromTrade(params, trade)` — learns from both wins AND losses
  - `migrateToEnhanced(legacy)` — backward compatibility from legacy AdaptiveParams
  - `getTimeOfDayMultiplier(params)` — 0.5-1.1 multiplier based on UTC hour
  - `assessTrade(params, trade)` — comprehensive pre-trade assessment with scoring

### Part 4: Barrel Export
- Added `PerformanceDashboard` to `/src/components/trading/index.ts`

### Lint: Clean (0 errors)