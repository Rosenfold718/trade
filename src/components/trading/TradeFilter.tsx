'use client';

import React, { useState } from 'react';
import { TradeList } from './TradeList';
import { Trade } from '@/components/trading/types';

interface TradeFilterProps {
  trades: Trade[];
  onTradeClick: (trade: Trade) => void;
  onDeleteTrade: (tradeId: string) => void;
}

export function TradeFilter({ trades, onTradeClick, onDeleteTrade }: TradeFilterProps) {
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'WIN' | 'LOSS' | 'EXPIRED'>('ALL');
  const [coinFilter, setCoinFilter] = useState<string>('ALL');
  const uniqueCoins = [...new Set(trades.map(t => t.coinSymbol))].sort();

  const filtered = trades.filter(t => {
    if (filter === 'OPEN' && t.resolved) return false;
    if (filter === 'WIN' && t.result !== 'WIN') return false;
    if (filter === 'LOSS' && t.result !== 'LOSS') return false;
    if (filter === 'EXPIRED' && t.result !== 'EXPIRED') return false;
    if (coinFilter !== 'ALL' && t.coinSymbol !== coinFilter) return false;
    return true;
  }).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {(['ALL', 'OPEN', 'WIN', 'LOSS', 'EXPIRED'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2 py-0.5 text-[9px] rounded-md transition-colors ${
            filter === f ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent text-muted-foreground'
          }`}>
            {f === 'ALL' ? 'Все' : f === 'OPEN' ? 'Открытые' : f === 'WIN' ? 'Прибыль' : f === 'LOSS' ? 'Убыток' : 'Истёкшие'}
          </button>
        ))}
        {uniqueCoins.length > 1 && (
          <select value={coinFilter} onChange={e => setCoinFilter(e.target.value)} className="ml-2 px-2 py-0.5 text-[9px] rounded-md border border-border bg-card text-foreground">
            <option value="ALL">Все монеты</option>
            {uniqueCoins.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <TradeList trades={filtered} onTradeClick={onTradeClick} onDeleteTrade={onDeleteTrade} />
    </div>
  );
}