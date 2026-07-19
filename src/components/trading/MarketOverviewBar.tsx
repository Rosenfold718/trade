'use client';

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Flame, Droplets, Wind } from 'lucide-react';

interface MarketOverviewBarProps {
  coins: CoinData[];
  sentiment?: SentimentData | null;
  tradeSignal?: TradeSignal | null;
  selectedCoinData?: CoinData;
}

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  image?: string;
}

interface SentimentData {
  fearGreed: { value: number; classification: string };
  topGainers?: { coin: string; change: number }[];
  topLosers?: { coin: string; change: number }[];
}

interface TradeSignal {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  trend: string;
  momentum: string;
  multiTimeframe: {
    consensus: string;
    alignment: number;
    regime?: string;
  };
}

function formatPrice(price: number): string {
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function formatCompact(num: number): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  return `$${num.toLocaleString()}`;
}

export function MarketOverviewBar({ coins, sentiment, tradeSignal, selectedCoinData }: MarketOverviewBarProps) {
  const btc = coins.find(c => c.symbol === 'btc');
  const eth = coins.find(c => c.symbol === 'eth');
  const sol = coins.find(c => c.symbol === 'sol');
  const totalMcap = coins.reduce((sum, c) => sum + (c.market_cap || 0), 0);

  const fg = sentiment?.fearGreed;
  const fgColor = useMemo(() => {
    if (!fg) return 'text-muted-foreground';
    if (fg.value <= 25) return 'text-red-500';
    if (fg.value <= 45) return 'text-orange-500';
    if (fg.value <= 55) return 'text-yellow-500';
    if (fg.value <= 75) return 'text-lime-500';
    return 'text-emerald-500';
  }, [fg]);

  const fgBg = useMemo(() => {
    if (!fg) return 'bg-muted';
    if (fg.value <= 25) return 'from-red-600 to-red-500';
    if (fg.value <= 45) return 'from-orange-500 to-amber-500';
    if (fg.value <= 55) return 'from-yellow-500 to-yellow-400';
    if (fg.value <= 75) return 'from-lime-500 to-green-500';
    return 'from-emerald-500 to-teal-500';
  }, [fg]);

  const regime = tradeSignal?.multiTimeframe?.regime || '—';
  const regimeColor = regime === 'trending' ? 'text-emerald-400' : regime === 'volatile' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="bg-card/60 backdrop-blur-sm border-b border-border/50">
      <div className="max-w-[1700px] mx-auto px-4 py-2">
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none text-xs">
          {/* BTC */}
          {btc && (
            <div className="flex items-center gap-2 shrink-0">
              {btc.image && <img src={btc.image} alt="" className="w-4 h-4 rounded-full" />}
              <span className="font-semibold text-muted-foreground">BTC</span>
              <span className="font-mono font-bold">${formatPrice(btc.current_price)}</span>
              <span className={`font-semibold flex items-center gap-0.5 ${(btc.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {(btc.price_change_percentage_24h || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(btc.price_change_percentage_24h || 0).toFixed(2)}%
              </span>
            </div>
          )}

          {/* ETH */}
          {eth && (
            <div className="flex items-center gap-2 shrink-0">
              {eth.image && <img src={eth.image} alt="" className="w-4 h-4 rounded-full" />}
              <span className="font-semibold text-muted-foreground">ETH</span>
              <span className="font-mono font-bold">${formatPrice(eth.current_price)}</span>
              <span className={`font-semibold flex items-center gap-0.5 ${(eth.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {(eth.price_change_percentage_24h || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(eth.price_change_percentage_24h || 0).toFixed(2)}%
              </span>
            </div>
          )}

          {/* SOL */}
          {sol && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {sol.image && <img src={sol.image} alt="" className="w-4 h-4 rounded-full" />}
              <span className="font-semibold text-muted-foreground">SOL</span>
              <span className="font-mono font-bold">${formatPrice(sol.current_price)}</span>
              <span className={`font-semibold ${(sol.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {Math.abs(sol.price_change_percentage_24h || 0).toFixed(2)}%
              </span>
            </div>
          )}

          {/* Divider */}
          <div className="w-px h-5 bg-border shrink-0" />

          {/* Total Market Cap */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <span className="text-muted-foreground">Кап. рынка:</span>
            <span className="font-mono font-bold">{formatCompact(totalMcap)}</span>
          </div>

          {/* Fear & Greed */}
          {fg && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-muted-foreground flex items-center gap-1">
                <Flame className="w-3 h-3" />
                Fear & Greed:
              </span>
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r ${fgBg} text-white`}>
                <span className="text-[11px] font-bold">{fg.value}</span>
                <span className="text-[9px] font-medium opacity-90">{fg.classification}</span>
              </div>
              {/* Mini bar */}
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${fgBg} transition-all duration-500`}
                  style={{ width: `${fg.value}%` }}
                />
              </div>
            </div>
          )}

          {/* Market Regime */}
          {tradeSignal && (
            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
              <Wind className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Режим:</span>
              <span className={`font-semibold text-[11px] ${regimeColor}`}>{regime === 'trending' ? 'Трендовый' : regime === 'volatile' ? 'Волатильный' : regime === 'ranging' ? 'Флэт' : regime}</span>
            </div>
          )}

          {/* Trend */}
          {tradeSignal?.trend && tradeSignal.direction !== 'FLAT' && (
            <div className="hidden xl:flex items-center gap-1.5 shrink-0">
              <Droplets className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Тренд:</span>
              <span className={`font-semibold ${tradeSignal.trend === 'BULLISH' ? 'text-emerald-500' : tradeSignal.trend === 'BEARISH' ? 'text-red-500' : 'text-yellow-500'}`}>
                {tradeSignal.trend === 'BULLISH' ? 'Бычий' : tradeSignal.trend === 'BEARISH' ? 'Медвежий' : 'Боковой'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}