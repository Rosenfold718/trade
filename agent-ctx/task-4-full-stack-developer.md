# Task 4: Break Monolithic CryptoDashboard into Components

## Summary
Refactored the 2034-line `CryptoDashboard.tsx` into 12 focused components + 1 shared types/utilities file, while integrating the new TradingView (lightweight-charts) CandlestickChart and EquityChart components.

## Files Created (12 new component files)

### `/home/z/my-project/src/components/trading/types.ts` (246 lines)
- All 14 TypeScript interfaces extracted: CoinData, TradeSignal, IndicatorResult, MultiTimeframeResult, TimeframeVerdict, SignalResult, ChartDataPoint, PositionTool, SentimentData, Trade, DepositSnapshot, DebtEntry, Lesson, AdaptiveParams, ReputationData
- 4 utility functions: formatPrice, formatNumber, formatTimeAgo, pctChange

### `/home/z/my-project/src/components/trading/CoinList.tsx` (100 lines)
- Coin selector panel with search, scrollable list
- Integrated new `MiniSparkline` component for each coin card (replaces plain text)
- Props: coins, selectedCoin, onSelectCoin, searchQuery, onSearchChange, loading

### `/home/z/my-project/src/components/trading/SignalPanel.tsx` (201 lines)
- Trade signal banner (LONG/SHORT/FLAT)
- Entry type banners (LIMIT/MARKET), price levels, R:R, step-by-step trade plan
- Reasons, warnings display

### `/home/z/my-project/src/components/trading/TradeFilter.tsx` (46 lines)
- Filter buttons (ALL/OPEN/WIN/LOSS/EXPIRED) + coin filter dropdown
- Uses TradeList internally

### `/home/z/my-project/src/components/trading/TradeList.tsx` (145 lines)
- Individual trade cards with direction, levels, PnL, delete button

### `/home/z/my-project/src/components/trading/TradeTerminalModal.tsx` (337 lines)
- Full-screen trade terminal modal
- **Replaced inline SVG candlestick chart with TradingView CandlestickChart component**
- Trade info sidebar with position details, P&L, levels

### `/home/z/my-project/src/components/trading/ReputationPanel.tsx` (271 lines)
- Trader journal modal with stats, equity chart, adaptive learning
- Uses new `EquityChart` component instead of inline SVG
- Deposit/scan controls, trade filter list

### `/home/z/my-project/src/components/trading/ThinkingPanel.tsx` (144 lines)
- Trader's thinking log modal with emotion-coded thoughts, tags, timestamps

### `/home/z/my-project/src/components/trading/SentimentPanel.tsx` (78 lines)
- Fear & Greed gauge, bullish/bearish factors

### `/home/z/my-project/src/components/trading/PositionTool.tsx` (182 lines)
- Manual position calculator with direction toggle, leverage slider, R:R calculation

### `/home/z/my-project/src/components/trading/ScanPanel.tsx` (58 lines)
- Scan button with loading state, opportunities list

### `/home/z/my-project/src/components/trading/AdvisorPanel.tsx` (95 lines)
- AI advisor analysis display with markdown-like formatting

## Files Modified

### `/home/z/my-project/src/app/CryptoDashboard.tsx` — **2034 → 435 lines** (78.6% reduction)
- Clean orchestrator: imports all components, manages state, handles API calls
- Main chart now uses TradingView `CandlestickChart` instead of inline SVG
- Kept 2 small inline sub-charts (RSI/MACD) as local functions since they're tiny
- All Russian UI text preserved

### `/home/z/my-project/src/components/trading/index.ts` — Updated barrel export
- Exports all 12 new components + all types + existing chart components

## Key Improvements
- **CandlestickChart**: Replaced 70+ line inline SVG with interactive TradingView chart (lightweight-charts library) — zoom, pan, crosshair
- **MiniSparkline**: Coin list now shows 7d sparklines using lightweight-charts
- **EquityChart**: Deposit history uses lightweight-charts area chart
- **Maintainability**: Each component is focused, testable, under 340 lines
- **Zero API changes**: All existing endpoints work identically
- **Lint passes**: No TypeScript or ESLint errors
- **Dev server running**: All 200 responses, no new errors