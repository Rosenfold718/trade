'use client';

import {
  createChart,
  IChartApi,
  AreaData,
  Time,
  ColorType,
  LineStyle,
  AreaSeries,
} from 'lightweight-charts';
import { useRef, useEffect, useMemo } from 'react';

export interface EquityDataPoint {
  timestamp: number;
  equity: number;
  balance: number;
}

export interface EquityChartProps {
  data: EquityDataPoint[];
  initialDeposit: number;
  totalDebt?: number;
  height?: number;
}

function formatEquity(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Equity curve area chart with initial-deposit reference line.
 * Green when equity is above effective capital, red when below.
 */
export function EquityChart({
  data,
  initialDeposit,
  totalDebt = 0,
  height = 120,
}: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const effectiveCapital = initialDeposit + totalDebt;

  const isProfit = useMemo(() => {
    if (data.length === 0) return true;
    return data[data.length - 1].equity >= effectiveCapital;
  }, [data, effectiveCapital]);

  const pnlPct = useMemo(() => {
    if (data.length === 0 || initialDeposit === 0) return '0.0';
    const ownEquity = data[data.length - 1].equity - totalDebt;
    const pct = ((ownEquity / initialDeposit) - 1) * 100;
    return pct.toFixed(1);
  }, [data, initialDeposit, totalDebt]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (data.length < 2) return;

    const positive = isProfit;
    const lineColor = positive ? '#10b981' : '#ef4444';
    const topGradient = positive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        horzLine: { visible: false },
        vertLine: {
          color: 'rgba(255,255,255,0.1)',
          labelBackgroundColor: '#334155',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    // ---- Area series ----
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: topGradient,
      bottomColor: 'transparent',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const areaData: AreaData<Time>[] = data.map((d) => ({
      time: Math.floor(d.timestamp / 1000) as Time,
      value: d.equity,
    }));

    areaSeries.setData(areaData);

    // ---- Reference line at effective capital ----
    if (effectiveCapital > 0) {
      try {
        areaSeries.createPriceLine({
          price: effectiveCapital,
          color: 'rgba(156,163,175,0.4)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Капитал',
        });
      } catch {}
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, effectiveCapital, isProfit]);

  // ---- Responsive resize ----
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w } = entry.contentRect;
        if (w > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: w });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ---- Legend info ----
  const lastEquity = data.length > 0 ? data[data.length - 1].equity : 0;

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Overlay labels */}
      {data.length >= 2 && (
        <div className="absolute top-1 left-2 z-10 pointer-events-none select-none flex items-center gap-2">
          <span
            className={`text-[9px] font-bold font-mono ${
              isProfit ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {parseFloat(pnlPct) >= 0 ? '+' : ''}
            {pnlPct}% PnL
          </span>
        </div>
      )}
      {data.length >= 2 && (
        <div className="absolute top-1 right-2 z-10 pointer-events-none select-none">
          <span
            className={`text-[10px] font-mono font-bold ${
              isProfit ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {formatEquity(lastEquity)}
          </span>
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Empty / insufficient state */}
      {data.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          —
        </div>
      )}
    </div>
  );
}