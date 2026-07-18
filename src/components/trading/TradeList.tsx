'use client';

import React, { useState } from 'react';
import { Gauge, ExternalLink, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Trade, formatPrice } from '@/components/trading/types';

interface TradeListProps {
  trades: Trade[];
  onTradeClick: (trade: Trade) => void;
  onDeleteTrade: (tradeId: string) => void;
}

export function TradeList({ trades, onTradeClick, onDeleteTrade }: TradeListProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Gauge className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>Сделок ещё не было. Когда система выдаст сигнал, трейдер автоматически откроет позицию.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trades.slice(0, 30).map(trade => (
        <div
          key={trade.id}
          onClick={() => onTradeClick(trade)}
          className={`rounded-xl border p-3 text-[11px] cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all ${
            trade.resolved ? (
              trade.result === 'WIN' ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50' :
              trade.result === 'LOSS' ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50' :
              'border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50'
            ) : 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50'
          }`}
        >
          {/* Row 1: Direction, Coin, Status, Time */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
              trade.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
            }`}>
              {trade.direction === 'LONG' ? '▲' : '▼'}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-bold ${trade.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {trade.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'}
                </span>
                <span className="font-semibold text-foreground">{trade.coinSymbol}/USDT</span>
                <Badge variant="outline" className="text-[8px]">{trade.timeframe}</Badge>
                <span className="text-muted-foreground">{trade.confidence}%</span>
              </div>
              <div className="text-[9px] text-muted-foreground">
                {new Date(trade.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {trade.enteredAt && trade.enteredAt !== trade.timestamp && (
                  <> → Вход: {new Date(trade.enteredAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</>
                )}
                {trade.closedAt && (
                  <> → Закрыт: {new Date(trade.closedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</>
                )}
              </div>
            </div>
            {!trade.resolved && <Badge className="text-[9px] bg-blue-500 text-white">АКТИВЕН</Badge>}
            {trade.resolved && trade.result === 'WIN' && <Badge className="text-[9px] bg-emerald-500 text-white">+ПРИБЫЛЬ</Badge>}
            {trade.resolved && trade.result === 'LOSS' && <Badge className="text-[9px] bg-red-500 text-white">-УБЫТОК</Badge>}
            {trade.resolved && trade.result === 'EXPIRED' && <Badge className="text-[9px] bg-yellow-500 text-white">ИСТЁК</Badge>}
          </div>

          {/* Row 2: Position details */}
          <div className="grid grid-cols-4 gap-2 mb-1.5">
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">ВХОД</div>
              <div className="font-mono font-bold text-blue-500">${formatPrice(trade.entry)}</div>
              <div className="text-[8px] text-muted-foreground">{trade.entryType} {trade.entryType === 'LIMIT' && !trade.entryReached ? '(ждёт)' : ''}</div>
            </div>
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">СТОП-ЛОСС</div>
              <div className="font-mono font-bold text-red-500">${formatPrice(trade.stopLoss)}</div>
            </div>
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">ТЕЙК-ПРОФИТ</div>
              <div className="font-mono font-bold text-emerald-500">${formatPrice(trade.takeProfit1)}</div>
            </div>
            <div className="bg-card/50 rounded-md px-2 py-1">
              <div className="text-[8px] text-muted-foreground">ПОЗИЦИЯ</div>
              <div className="font-mono font-bold text-foreground">${trade.positionSize.toFixed(2)}</div>
              <div className="text-[8px] text-muted-foreground">{trade.leverage}x плечо</div>
            </div>
          </div>

          {/* Row 3: Entry reason */}
          {trade.entryReason && (
            <div className="text-[10px] text-muted-foreground mb-1">
              <span className="font-semibold">Причина:</span> {trade.entryReason}
            </div>
          )}

          {/* Row 4: Result & PnL */}
          {trade.resolved && (
            <div className={`flex items-center justify-between mt-1.5 pt-1.5 border-t ${
              trade.result === 'WIN' ? 'border-emerald-500/20' : trade.result === 'LOSS' ? 'border-red-500/20' : 'border-border/30'
            }`}>
              <div className="text-[10px] text-muted-foreground">{trade.exitReason}</div>
              {trade.pnlUSDT != null && (
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold text-sm ${trade.pnlUSDT >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {trade.pnlUSDT >= 0 ? '+' : ''}{trade.pnlUSDT.toFixed(2)} USDT
                  </span>
                  {trade.pnlPct != null && (
                    <span className={`font-mono text-[10px] ${trade.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Click hint + Delete button for open trades */}
          <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-border/20">
            <span className="text-[9px] text-muted-foreground/50 flex items-center gap-1">
              <ExternalLink className="w-2.5 h-2.5" />
              Открыть в терминале
            </span>
            {!trade.resolved && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Отменить сделку ${trade.coinSymbol}/USDT ${trade.direction}? Средства ($${trade.positionSize.toFixed(2)}) вернутся на депозит.`)) {
                    onDeleteTrade(trade.id);
                  }
                }}
                className="text-[9px] text-red-400 hover:text-red-500 flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-red-500/10 transition-colors"
                title="Отменить сделку"
              >
                <Trash2 className="w-3 h-3" />
                Отменить
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}