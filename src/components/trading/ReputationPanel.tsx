'use client';

import React from 'react';
import { X, DollarSign, Brain, Cpu, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EquityChart } from '@/components/trading/EquityChart';
import { TradeFilter } from '@/components/trading/TradeFilter';
import type { ReputationData, Trade } from '@/components/trading/types';

interface ReputationPanelProps {
  reputation: ReputationData;
  onClose: () => void;
  onDeleteTrade: (tradeId: string) => void;
  onTradeClick: (trade: Trade) => void;
  depositAmount: string;
  onDepositChange: (val: string) => void;
  onDepositSubmit: () => void;
  depositLoading: boolean;
  onScan: () => void;
  scanLoading: boolean;
  depositSuccess: boolean;
}

export function ReputationPanel({
  reputation,
  onClose,
  onDeleteTrade,
  onTradeClick,
  depositAmount,
  onDepositChange,
  onDepositSubmit,
  depositLoading,
  onScan,
  scanLoading,
  depositSuccess,
}: ReputationPanelProps) {
  const totalCapital = reputation.freeBalance + (reputation.lockedInPositions || 0);
  const pnlPct = ((totalCapital / reputation.initialDeposit) - 1) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-card border-2 border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header — flex-shrink-0 */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <span className="text-2xl">{reputation.levelEmoji}</span>
              </div>
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  Журнал трейдера
                  <Badge className="bg-purple-500 text-white text-[9px]">{reputation.level}</Badge>
                </h2>
                <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                  <span className="text-muted-foreground">Капитал:</span>
                  <span className="font-mono font-bold text-foreground">${totalCapital.toFixed(2)}</span>
                  <span className={`font-mono font-bold ${reputation.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {reputation.totalPnl >= 0 ? '+' : ''}{reputation.totalPnl.toFixed(2)} USDT
                  </span>
                  <span className={`text-[9px] ${reputation.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mt-3">
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-[8px] text-muted-foreground uppercase">Капитал</div>
              <div className={`text-xs font-mono font-bold ${totalCapital >= reputation.initialDeposit ? 'text-emerald-500' : 'text-red-500'}`}>
                ${totalCapital.toFixed(2)}
              </div>
            </div>
            <div className={`rounded-lg border p-2 text-center ${reputation.freeBalance > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
              <div className={`text-[8px] uppercase ${reputation.freeBalance > 0 ? 'text-emerald-500' : 'text-red-500'}`}>Свободно</div>
              <div className={`text-xs font-mono font-bold ${reputation.freeBalance > 0 ? 'text-emerald-500' : 'text-red-500'}`}>${(reputation.freeBalance || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2 text-center">
              <div className="text-[8px] text-blue-500 uppercase">В сделках</div>
              <div className="text-xs font-mono font-bold text-blue-500">${(reputation.lockedInPositions || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-[8px] text-muted-foreground uppercase">Депозит</div>
              <div className="text-xs font-mono font-bold">${reputation.initialDeposit}</div>
            </div>
          </div>

          {/* Second stats row */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
              <div className="text-[8px] text-emerald-500 uppercase">Прибыль</div>
              <div className="text-xs font-mono font-bold text-emerald-500">{reputation.wins}</div>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-center">
              <div className="text-[8px] text-red-500 uppercase">Убыток</div>
              <div className="text-xs font-mono font-bold text-red-500">{reputation.losses}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-[8px] text-muted-foreground uppercase">Винрейт</div>
              <div className={`text-xs font-mono font-bold ${reputation.winRate >= 50 ? 'text-emerald-500' : 'text-red-500'}`}>{reputation.winRate}%</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-[8px] text-muted-foreground uppercase">Очки</div>
              <div className={`text-xs font-mono font-bold ${reputation.score >= 0 ? 'text-purple-500' : 'text-red-500'}`}>{reputation.score}</div>
            </div>
          </div>

          {/* Debt / Credit row — always visible */}
          <div className="flex items-center gap-2 mt-2">
            {reputation.totalDebt > 0 && (
              <div className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                <div className="text-[8px] text-amber-500 uppercase">Долг</div>
                <div className="text-xs font-mono font-bold text-amber-500">${reputation.totalDebt.toFixed(2)}</div>
              </div>
            )}
            {reputation.totalRepaid > 0 && (
              <div className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                <div className="text-[8px] text-emerald-500 uppercase">Возвращено</div>
                <div className="text-xs font-mono font-bold text-emerald-500">${reputation.totalRepaid.toFixed(2)}</div>
              </div>
            )}
            <div className="flex-1 rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-[8px] text-muted-foreground uppercase">Собственные</div>
              <div className={`text-xs font-mono font-bold ${(totalCapital - reputation.totalDebt) >= reputation.initialDeposit ? 'text-emerald-500' : 'text-red-500'}`}>
                ${(totalCapital - reputation.totalDebt).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Deposit funds + Scan button */}
          <div className={`relative flex items-center gap-2 mt-2 rounded-lg p-2 -m-2 transition-all duration-500 ${depositSuccess ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : ''}`}>
            {depositSuccess && (
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow-lg animate-in fade-in slide-in-from-top-1">
                <CheckCircle2 className="w-3 h-3" />
                Кредит сохранён
              </div>
            )}
            <div className="flex-1 flex items-center gap-1">
              <Input
                type="number"
                placeholder="Сумма USDT"
                value={depositAmount}
                onChange={e => onDepositChange(e.target.value)}
                className="h-7 text-[11px] font-mono"
                min={1}
                step={1}
              />
              <Button
                size="sm"
                onClick={onDepositSubmit}
                disabled={depositLoading || !depositAmount}
                className={`h-7 text-[10px] gap-1 text-white transition-all ${depositSuccess ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                <DollarSign className="w-3 h-3" />
                {depositLoading ? '...' : depositSuccess ? 'Готово' : 'Дать в кредит'}
              </Button>
            </div>
            <Button
              size="sm"
              onClick={onScan}
              disabled={scanLoading}
              className="h-7 text-[10px] gap-1 bg-purple-500 hover:bg-purple-600 text-white"
            >
              <Cpu className="w-3 h-3" />
              {scanLoading ? 'Скан...' : 'Скан монет'}
            </Button>
          </div>
          {depositAmount && parseFloat(depositAmount) > 0 && (
            <div className="text-[9px] text-amber-500/80 mt-1">
              Средства будут добавлены как кредит — трейдер должен будет их вернуть из прибыли
            </div>
          )}
        </div>

        {/* Content — scrollable, takes remaining space */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Deposit chart */}
          {reputation.depositHistory && reputation.depositHistory.length > 1 && (
            <div>
              <div className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Динамика депозита</div>
              <EquityChart
                data={reputation.depositHistory.map(d => ({
                  timestamp: d.timestamp,
                  equity: d.equity,
                  balance: d.balance,
                }))}
                initialDeposit={reputation.initialDeposit}
                totalDebt={reputation.totalDebt}
                height={100}
              />
            </div>
          )}

          {/* Adaptive learning */}
          {reputation.adaptive && (reputation.adaptive.lessons.length > 0 || reputation.adaptive.avoidCoins.length > 0) && (
            <div>
              <div className="text-[10px] font-bold text-amber-500 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="w-3 h-3" />
                Обучение на ошибках
                <span className="text-[8px] text-muted-foreground font-normal">({reputation.adaptive.lessons.length} уроков)</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                  <div className="text-[8px] text-amber-500 uppercase">Мин. SL</div>
                  <div className="text-xs font-mono font-bold text-amber-500">{reputation.adaptive.minSlDistancePct.toFixed(1)}%</div>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                  <div className="text-[8px] text-amber-500 uppercase">Мин. увер.</div>
                  <div className="text-xs font-mono font-bold text-amber-500">{reputation.adaptive.minConfidence}%</div>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                  <div className="text-[8px] text-amber-500 uppercase">Мин. R:R</div>
                  <div className="text-xs font-mono font-bold text-amber-500">{reputation.adaptive.minRr.toFixed(1)}</div>
                </div>
              </div>
              {reputation.adaptive.avoidCoins.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="text-[9px] text-red-400">Избегать:</span>
                  {reputation.adaptive.avoidCoins.map(c => (
                    <span key={c} className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">{c}</span>
                  ))}
                </div>
              )}
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {reputation.adaptive.lessons.slice(-8).reverse().map((lesson, i) => (
                  <div key={`${lesson.type}-${lesson.timestamp}-${i}`} className={`rounded-lg border p-2 text-[10px] ${
                    lesson.severity === 'high' ? 'border-red-500/30 bg-red-500/5' :
                    lesson.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' :
                    'border-zinc-500/20 bg-zinc-500/5'
                  }`}>
                    <div className="flex items-start gap-1.5">
                      <span className={`mt-0.5 flex-shrink-0 ${
                        lesson.severity === 'high' ? 'text-red-500' :
                        lesson.severity === 'medium' ? 'text-amber-500' : 'text-zinc-400'
                      }`}>
                        {lesson.severity === 'high' ? '🔴' : lesson.severity === 'medium' ? '🟡' : '⚪'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-foreground leading-tight">{lesson.description}</div>
                        <div className="text-muted-foreground text-[8px] mt-0.5">
                          {new Date(lesson.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trade filter + list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Сделки ({reputation.trades.length})
              </div>
            </div>
            <TradeFilter
              trades={reputation.trades}
              onTradeClick={onTradeClick}
              onDeleteTrade={onDeleteTrade}
            />
          </div>
        </div>
      </div>
    </div>
  );
}