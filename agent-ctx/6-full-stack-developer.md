# Task 6: Replace Custom SVG Charts with TradingView lightweight-charts

## Status: COMPLETED

## What was done

### 1. Installed `lightweight-charts` v5.2.0
```bash
bun add lightweight-charts
```

### 2. Created `/src/components/trading/CandlestickChart.tsx`
Professional candlestick chart component using lightweight-charts with:
- Full candlestick rendering with green/red candles
- Volume histogram at bottom 20% (transparent red/green bars)
- EMA9 (yellow, dashed) and EMA21 (purple, dashed) line overlays (togglable via `showIndicators`)
- Trade signal price lines: Entry (blue, dotted), Stop (red, dotted), TP1/TP2/TP3 (green, dashed)
- Dark theme (transparent background, muted grid, monospace font)
- Zoom, pan, crosshair support
- Responsive via ResizeObserver
- Legend overlay: current price + change + signal badge
- Signal info box (direction, entry, stop, TPs, R:R, hold duration, support/resistance, candle pattern)
- Exports: `CandlestickChart`, `CandlestickChartProps`, `ChartDataPoint`, `TradeSignal`

### 3. Created `/src/components/trading/MiniSparkline.tsx`
Lightweight area sparkline for coin list items:
- Uses area series with gradient fill
- Color parameter (green/red based on 24h change)
- No axes, no grid, no crosshair — minimal footprint
- Optional reference lines (e.g., RSI 50)
- Responsive
- Exports: `MiniSparkline`, `MiniSparklineProps`

### 4. Created `/src/components/trading/EquityChart.tsx`
Equity curve chart for P&L dashboard:
- Area chart showing equity over time
- Horizontal reference line at effective capital (initial deposit + debt)
- Green when above capital, red when below
- Overlay labels: % PnL and current equity value
- No scroll/scale (locked view)
- Exports: `EquityChart`, `EquityChartProps`, `EquityDataPoint`

### 5. Created `/src/components/trading/index.ts`
Barrel export for all chart components and their types.

## Lint Results
- **Zero lint errors** in all new trading components
- Pre-existing lint errors in `CryptoDashboard.tsx` (LevelLine component inside render) were NOT modified per task instructions

## Notes
- CryptoDashboard.tsx was NOT modified (per instructions)
- All components use `'use client'` directive
- Proper cleanup in useEffect return (chart.remove())
- ResizeObserver for responsive sizing
- Empty data handled gracefully with fallback UI
- Data types aligned with existing CryptoDashboard interfaces