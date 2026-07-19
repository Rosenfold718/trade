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
import { useRef, useEffect } from 'react';

export interface MiniSparklineProps {
  /** Array of price values over time (e.g., sparkline_in_7d) */
  data: number[];
  /** Line/area color — typically green or red based on 24h change */
  color?: string;
  /** Container width in pixels (uses 100% if omitted) */
  width?: number;
  /** Container height in pixels */
  height?: number;
  /** Optional horizontal reference lines (e.g., RSI 50) */
  refLines?: number[];
}

/**
 * A minimal area sparkline using lightweight-charts.
 * Designed to be embedded in compact list items / cards.
 */
export function MiniSparkline({
  data,
  color = '#10b981',
  width,
  height = 48,
  refLines,
}: MiniSparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (data.length < 2) return;

    const chart = createChart(containerRef.current, {
      width: width ?? containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 0,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        horzLine: { visible: false },
        vertLine: { visible: false },
      },
      rightPriceScale: { visible: false },
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
      lineColor: color,
      topColor: color,
      bottomColor: 'transparent',
      lineWidth: 2 as const,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Generate evenly spaced timestamps (every 4 hours over 7 days)
    const now = Math.floor(Date.now() / 1000);
    const spanSeconds = 7 * 24 * 3600;
    const step = data.length > 1 ? spanSeconds / (data.length - 1) : 0;

    const areaData: AreaData<Time>[] = data.map((v, i) => ({
      time: (now - spanSeconds + step * i) as Time,
      value: v,
    }));

    areaSeries.setData(areaData);

    // ---- Reference lines ----
    if (refLines && refLines.length > 0) {
      refLines.forEach((refVal) => {
        try {
          areaSeries.createPriceLine({
            price: refVal,
            color: refVal > 50 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: '',
          });
        } catch {}
      });
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, color, width, height, refLines]);

  // ---- Responsive resize ----
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w } = entry.contentRect;
        if (w > 0 && chartRef.current && !width) {
          chartRef.current.applyOptions({ width: w });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width]);

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-xs"
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  return <div ref={containerRef} style={{ width, height }} className="w-full" />;
}