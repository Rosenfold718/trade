'use client';

import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, Time, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import { useRef, useEffect, useCallback, useState } from 'react';

// CoinGecko ID → Binance symbol
const COIN_TO_BINANCE: Record<string, string> = {
  bitcoin: 'BTCUSDT', ethereum: 'ETHUSDT', solana: 'SOLUSDT',
  ripple: 'XRPUSDT', binancecoin: 'BNBUSDT', cardano: 'ADAUSDT',
  dogecoin: 'DOGEUSDT', 'avalanche-2': 'AVAXUSDT', polkadot: 'DOTUSDT',
  chainlink: 'LINKUSDT', litecoin: 'LTCUSDT', uniswap: 'UNIUSDT',
  cosmos: 'ATOMUSDT', near: 'NEARUSDT', aave: 'AAVEUSDT',
  filecoin: 'FILUSDT', aptos: 'APTUSDT', arbitrum: 'ARBUSDT',
  optimism: 'OPUSDT', sui: 'SUIUSDT', 'injective-protocol': 'INJUSDT',
  pepe: 'PEPEUSDT', 'shiba-inu': 'SHIBUSDT', tron: 'TRXUSDT',
  toncoin: 'TONUSDT', stellar: 'XLMUSDT', 'fetch-ai': 'FETUSDT',
  thorchain: 'RUNEUSDT', maker: 'MKRUSDT', 'the-graph': 'GRTUSDT',
  vechain: 'VETUSDT', algorand: 'ALGOUSDT', 'hedera-hashgraph': 'HBARUSDT',
  dogwifcoin: 'WIFUSDT', 'polygon-ecosystem-token': 'POLUSDT',
  bonk: 'BONKUSDT', celestia: 'TIAUSDT', starknet: 'STRKUSDT',
  'worldcoin-wld': 'WLDUSDT', pendle: 'PENDLEUSDT',
  'ondo-finance': 'ONDOUSDT', 'render-token': 'RENDERUSDT',
  fantom: 'FTMUSDT',
};

function getBinanceSymbol(coinId: string): string {
  if (COIN_TO_BINANCE[coinId]) return COIN_TO_BINANCE[coinId];
  return coinId.toUpperCase().replace(/-/g, '') + 'USDT';
}

// Interface matching CryptoDashboard chart data
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
  coinId: string;
  interval: string;
  tradeSignal: TradeSignal | null;
  height?: number;
  showIndicators?: boolean;
  onCrosshairMove?: (price: number | null) => void;
  // Keep legacy data prop for backward compat but prefer coinId+interval
  data?: ChartDataPoint[];
}

function formatPrice(price: number): string {
  if (!price || !isFinite(price)) return '0.00';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}

// ---- Component ----

export function CandlestickChart({
  coinId,
  interval,
  tradeSignal,
  height = 480,
  showIndicators = true,
  onCrosshairMove,
  data: legacyData,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCandle, setLastCandle] = useState<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);
  const [candleCount, setCandleCount] = useState(0);

  const binanceSymbol = getBinanceSymbol(coinId);

  // Map dashboard interval to Binance interval
  const binanceInterval = interval || '1h';

  // Load chart data from our proxy
  const loadChart = useCallback(async () => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    try {
      const res = await fetch(`/api/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=500`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();

      if (!json.candles || json.candles.length === 0) {
        setError('Нет данных');
        return;
      }

      const candles: CandlestickData<Time>[] = json.candles.map((d: any) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      const volumes: HistogramData<Time>[] = json.candles.map((d: any) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
      }));

      candleSeriesRef.current.setData(candles);
      volumeSeriesRef.current.setData(volumes);
      setCandleCount(candles.length);
      setError(null);
      setLoading(false);

      // Store last candle for real-time updates
      if (json.candles.length > 0) {
        setLastCandle(json.candles[json.candles.length - 1]);
      }

      // If we have legacy data with indicators, plot EMA lines
      if (showIndicators && legacyData && legacyData.length > 0) {
        // Create a time→data map from legacy data
        const legacyMap = new Map<number, ChartDataPoint>();
        for (const d of legacyData) {
          legacyMap.set(Math.floor(d.timestamp / 1000), d);
        }

        const ema9: { time: Time; value: number }[] = [];
        const ema21: { time: Time; value: number }[] = [];

        for (const candle of json.candles) {
          const ld = legacyMap.get(candle.time);
          if (ld) {
            if (ld.ema9 != null) ema9.push({ time: candle.time as Time, value: ld.ema9 });
            if (ld.ema21 != null) ema21.push({ time: candle.time as Time, value: ld.ema21 });
          }
        }

        if (ema9SeriesRef.current) ema9SeriesRef.current.setData(ema9);
        if (ema21SeriesRef.current) ema21SeriesRef.current.setData(ema21);
      }

      chartRef.current?.timeScale().fitContent();
    } catch (err) {
      console.error('[CandlestickChart] loadChart error:', err);
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      setLoading(false);
    }
  }, [binanceSymbol, binanceInterval, showIndicators, legacyData]);

  // Real-time update: poll every 5 seconds
  const updateLastCandle = useCallback(async () => {
    if (!candleSeriesRef.current) return;

    try {
      const res = await fetch(`/api/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=2`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.candles || json.candles.length < 2) return;

      const latest = json.candles[json.candles.length - 1];
      candleSeriesRef.current.update({
        time: latest.time as Time,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
      });

      // Update volume
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: latest.time as Time,
          value: latest.volume,
          color: latest.close >= latest.open ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
        });
      }
    } catch {}
  }, [binanceSymbol, binanceInterval]);

  // ---- Create chart (v4 API) ----
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
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

    // v4 API: addCandlestickSeries (not addSeries)
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = candleSeries;

    // Volume histogram on separate price scale
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // EMA lines
    const ema9Series = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema9SeriesRef.current = ema9Series;

    const ema21Series = chart.addLineSeries({
      color: '#a855f7',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema21SeriesRef.current = ema21Series;

    // Crosshair callback
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        onCrosshairMove?.(null);
        return;
      }
      const candle = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      onCrosshairMove?.(candle?.close ?? null);
    });

    // Load data
    loadChart();

    // Poll every 5s for updates
    pollRef.current = setInterval(updateLastCandle, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema9SeriesRef.current = null;
      ema21SeriesRef.current = null;
      priceLinesRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binanceSymbol, binanceInterval]);

  // ---- Trade signal price lines ----
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear old price lines
    priceLinesRef.current.forEach((id) => {
      try { series.removePriceLine(id as any); } catch {}
    });
    priceLinesRef.current = [];

    if (!tradeSignal || tradeSignal.direction === 'FLAT') return;

    const addLine = (price: number, color: string, label: string, lineWidth: 1 | 2 | 3 | 4 = 1, lineStyle = LineStyle.Dashed) => {
      if (price <= 0) return;
      try {
        const pl = series.createPriceLine({ price, color, lineWidth, lineStyle, axisLabelVisible: true, title: label });
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
  }, [tradeSignal]);

  // ---- Derived price info for legend ----
  const priceChange = lastCandle ? 0 : 0; // Will be populated from data
  const isUp = (priceChange) >= 0;
  const displayPrice = lastCandle?.close || 0;

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Legend overlay */}
      {displayPrice > 0 && (
        <div className="absolute top-2 left-3 z-10 flex items-center gap-3 pointer-events-none select-none">
          <span className="text-sm font-bold font-mono text-foreground">
            ${formatPrice(displayPrice)}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">
            {binanceSymbol} · {candleCount} свечей · {binanceInterval}
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
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', minHeight: 0 }}
      />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span className="text-sm text-muted-foreground">Загрузка {binanceSymbol}...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-center text-red-400">
            <p className="text-sm">{error}</p>
            <button onClick={loadChart} className="mt-2 text-xs text-emerald-400 hover:underline">
              Повторить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}