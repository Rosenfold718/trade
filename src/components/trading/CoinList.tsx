'use client';

import React from 'react';
import { Search, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MiniSparkline } from '@/components/trading/MiniSparkline';
import { CoinData, formatPrice } from '@/components/trading/types';

interface CoinListProps {
  coins: CoinData[];
  selectedCoin: string;
  onSelectCoin: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  loading: boolean;
}

export function CoinList({ coins, selectedCoin, onSelectCoin, searchQuery, onSearchChange, loading }: CoinListProps) {
  const filteredCoins = coins.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Поиск монеты..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 h-8 text-sm"
        />
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-140px)]">
            {loading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 animate-pulse">
                    <div className="w-7 h-7 bg-muted rounded-full" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-16 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredCoins.map(coin => {
                  const isPositive = (coin.price_change_percentage_24h || 0) >= 0;
                  return (
                    <button
                      key={coin.id}
                      onClick={() => onSelectCoin(coin.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 hover:bg-accent/50 transition-colors text-left ${
                        selectedCoin === coin.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {coin.image ? (
                          <img src={coin.image} alt="" className="w-5 h-5" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <span className="text-[9px] font-bold">{coin.symbol.slice(0, 2)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-xs truncate">{coin.symbol}</span>
                        </div>
                        <div className="text-[11px] font-mono">${formatPrice(coin.current_price)}</div>
                      </div>
                      <div className="flex-shrink-0 w-16 h-6">
                        {coin.sparkline_in_7d && coin.sparkline_in_7d.length > 1 && (
                          <MiniSparkline
                            data={coin.sparkline_in_7d}
                            color={isPositive ? '#10b981' : '#ef4444'}
                            height={24}
                          />
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-[10px] font-semibold flex items-center gap-0.5 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                          {isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                          {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}{'%'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}