'use client';

import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  HistogramData,
  Time,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import { useRef, useEffect, useMemo } from 'react';

// ---- Data types (aligned with CryptoDashboard) ----

export interface ChartDataPoint {
  timestamp: number;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9?: number;
  ema21?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
}

export interface TradeSignal {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  confidence: number;
  trend: string;
  momentum: string;
  entryType?: 'LIMIT' | 'MARKET';
  riskReward?: number;
  holdDuration?: string;
  support?: number;
  resistance?: number;
  candlePattern?: string | null;
}

export interface CandlestickChartProps {
  data: ChartDataPoint[];
  tradeSignal: TradeSignal | null;
  height?: number;
  showIndicators?: boolean;
  onCrosshairMove?: (price: number | null) => void;
}

// ---- Helpers ----

function formatPrice(price: number): string {
  if (!price || !isFinite(price)) return '0.00';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}

function toTime(timestamp: number): Time {
  // lightweight-charts expects seconds as number
  return Math.floor(timestamp / 1000) as Time;
}

// ---- Component ----

export function CandlestickChart({
  data,
  tradeSignal,
  height = 480,
  showIndicators = true,
  onCrosshairMove,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<string[]>([]);

  const currentPrice = useMemo(() => {
    if (data.length === 0) return null;
    return data[data.length - 1].close;
  }, [data]);

  // Build or rebuild the chart
  useEffect(() => {
    if (!containerRef.current) return;
    if (data.length === 0) return;

    // ---- Create chart ----
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255,255,255,0.15)',
          labelBackgroundColor: '#334155',
        },
        horzLine: {
          color: 'rgba(255,255,255,0.15)',
          labelBackgroundColor: '#334155',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // ---- Candlestick series ----
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = candleSeries;

    // ---- Volume series (bottom 20%) ----
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // ---- EMA overlay lines ----
    const ema9Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema9SeriesRef.current = ema9Series;

    const ema21Series = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema21SeriesRef.current = ema21Series;

    // ---- Populate data ----
    const candles: CandlestickData<Time>[] = data.map((d) => ({
      time: toTime(d.timestamp),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumes: HistogramData<Time>[] = data.map((d) => ({
      time: toTime(d.timestamp),
      value: d.volume,
      color: d.close >= d.open ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
    }));

    candleSeries.setData(candles);
    volumeSeries.setData(volumes);

    // ---- EMA data ----
    if (showIndicators) {
      const ema9: LineData<Time>[] = [];
      const ema21: LineData<Time>[] = [];

      for (const d of data) {
        if (d.ema9 != null) ema9.push({ time: toTime(d.timestamp), value: d.ema9 });
        if (d.ema21 != null) ema21.push({ time: toTime(d.timestamp), value: d.ema21 });
      }

      if (ema9.length > 1) ema9Series.setData(ema9);
      if (ema21.length > 1) ema21Series.setData(ema21);
    } else {
      ema9Series.setData([]);
      ema21Series.setData([]);
    }

    // ---- Trade signal price lines ----
    if (tradeSignal && tradeSignal.direction !== 'FLAT') {
      // Clear old price lines
      priceLinesRef.current.forEach((id) => {
        try {
          candleSeries.removePriceLine(id as any);
        } catch {}
      });
      priceLinesRef.current = [];

      const addLine = (price: number, color: string, label: string, lineWidth: 1 | 2 | 3 | 4 = 1, lineStyle = LineStyle.Dashed) => {
        if (price <= 0) return;
        try {
          const pl = candleSeries.createPriceLine({
            price,
            color,
            lineWidth,
            lineStyle,
            axisLabelVisible: true,
            title: label,
          });
          priceLinesRef.current.push(pl as unknown as string);
        } catch {}
      };

      addLine(tradeSignal.entry, '#3b82f6', tradeSignal.entryType === 'LIMIT' ? 'LIMIT' : 'ENTRY', 2, LineStyle.Dotted);
      addLine(tradeSignal.stopLoss, '#ef4444', 'STOP', 2, LineStyle.Dotted);
      addLine(tradeSignal.takeProfit1, '#22c55e', 'TP1', 1);
      addLine(tradeSignal.takeProfit2, '#10b981', 'TP2', 1);
      if (tradeSignal.takeProfit3 > 0) {
        addLine(tradeSignal.takeProfit3, '#059669', 'TP3', 1);
      }
    } else {
      priceLinesRef.current.forEach((id) => {
        try {
          candleSeries.removePriceLine(id as any);
        } catch {}
      });
      priceLinesRef.current = [];
    }

    // Current price is derived from data prop via useMemo above

    // ---- Crosshair callback ----
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        onCrosshairMove?.(null);
        return;
      }
      const candle = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      onCrosshairMove?.(candle?.close ?? null);
    });

    // ---- Fit content ----
    chart.timeScale().fitContent();

    // ---- Cleanup ----
    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema9SeriesRef.current = null;
      ema21SeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [data, tradeSignal, height, showIndicators, onCrosshairMove]);

  // autoSize: true handles resize automatically — no manual ResizeObserver needed

  // ---- Legend formatting ----
  const lastDataPoint = data.length > 0 ? data[data.length - 1] : null;
  const prevDataPoint = data.length > 1 ? data[data.length - 2] : null;
  const priceChange = lastDataPoint && prevDataPoint ? lastDataPoint.close - prevDataPoint.close : 0;
  const pctChange = prevDataPoint && prevDataPoint.close > 0 ? (priceChange / prevDataPoint.close) * 100 : 0;
  const isUp = priceChange >= 0;

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Legend overlay */}
      {lastDataPoint && currentPrice !== null && (
        <div className="absolute top-2 left-3 z-10 flex items-center gap-3 pointer-events-none select-none">
          <span
            className={`text-sm font-bold font-mono ${isUp ? 'text-emerald-400' : 'text-red-400'}`}
          >
            ${formatPrice(currentPrice)}
          </span>
          <span
            className={`text-xs font-mono ${isUp ? 'text-emerald-400/80' : 'text-red-400/80'}`}
          >
            {isUp ? '+' : ''}
            {formatPrice(Math.abs(priceChange))} ({isUp ? '+' : ''}
            {pctChange.toFixed(2)}%)
          </span>
          {tradeSignal && tradeSignal.direction !== 'FLAT' && (
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                tradeSignal.direction === 'LONG'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {tradeSignal.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'} — {tradeSignal.confidence}%
            </span>
          )}
        </div>
      )}

      {/* Signal info box */}
      {tradeSignal && tradeSignal.direction !== 'FLAT' && (
        <div className="absolute top-10 left-3 z-10 bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 pointer-events-none text-[10px] space-y-1 max-w-[280px]">
          <div className="flex items-center gap-2">
            <span className={`font-bold text-xs ${tradeSignal.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
              {tradeSignal.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'} — {tradeSignal.confidence}%
            </span>
          </div>
          <div className="text-muted-foreground">
            Вход: <span className="text-blue-400 font-bold">${formatPrice(tradeSignal.entry)}</span> | Стоп:{' '}
            <span className="text-red-400 font-bold">${formatPrice(tradeSignal.stopLoss)}</span>
          </div>
          <div className="text-muted-foreground">
            TP1: <span className="text-green-400 font-bold">${formatPrice(tradeSignal.takeProfit1)}</span> | TP2:{' '}
            <span className="text-emerald-400 font-bold">${formatPrice(tradeSignal.takeProfit2)}</span>
            {tradeSignal.riskReward != null && (
              <>
                {' '}| R:R{' '}
                <span className={tradeSignal.riskReward >= 2 ? 'text-emerald-400' : 'text-yellow-400'}>
                  {tradeSignal.riskReward.toFixed(2)}
                </span>
              </>
            )}
          </div>
          {(tradeSignal.holdDuration || tradeSignal.momentum || tradeSignal.trend) && (
            <div className="text-muted-foreground">
              {tradeSignal.holdDuration && `${tradeSignal.holdDuration} `}
              {tradeSignal.momentum && `${tradeSignal.momentum} `}
              {tradeSignal.trend && `${tradeSignal.trend}`}
            </div>
          )}
          {tradeSignal.support != null && tradeSignal.resistance != null && (
            <div className="text-muted-foreground">
              Подд: <span className="text-emerald-400">${formatPrice(tradeSignal.support)}</span> | Сопр:{' '}
              <span className="text-red-400">${formatPrice(tradeSignal.resistance)}</span>
            </div>
          )}
          {tradeSignal.candlePattern && (
            <div className="text-yellow-400">Паттерн: {tradeSignal.candlePattern}</div>
          )}
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Empty state */}
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          No chart data available
        </div>
      )}
    </div>
  );
}