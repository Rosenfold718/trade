'use client';

import React from 'react';
import {
  Zap, Target,
  MoveUp, MoveDown, Pause, Flame, Snowflake, Volume2,
  Timer, Shield, CheckCircle2, AlertCircle, Copy, Check,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { TradeSignal, SignalResult } from '@/components/trading/types';

// Import types and utils separately to avoid unused import confusion
import { formatPrice as fp, pctChange as pc } from '@/components/trading/types';

interface SignalPanelProps {
  signal: SignalResult | null;
  tradeSignal: TradeSignal | null;
  showIndicators: boolean;
  onToggleIndicators: () => void;
  coinSymbol: string;
  copied: boolean;
  onCopy: () => void;
}

export function SignalPanel({ signal, tradeSignal, showIndicators, onToggleIndicators, coinSymbol, copied, onCopy }: SignalPanelProps) {
  const ts = tradeSignal;

  if (!ts) return null;

  // Active signal banner
  if (ts.direction !== 'FLAT') {
    return (
      <>
        <Card className={`border-2 overflow-hidden ${ts.direction === 'LONG' ? 'border-emerald-500/70 bg-gradient-to-r from-emerald-500/5 to-transparent' : 'border-red-500/70 bg-gradient-to-r from-red-500/5 to-transparent'}`}>
          <CardContent className="p-0">
            {/* Top: Signal Header */}
            <div className={`px-4 py-3 ${ts.direction === 'LONG' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${ts.direction === 'LONG' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                    {ts.direction === 'LONG' ? <MoveUp className="w-8 h-8 text-emerald-500" /> : <MoveDown className="w-8 h-8 text-red-500" />}
                  </div>
                  <div>
                    <div className={`text-3xl font-black tracking-tight ${ts.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>
                      {ts.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]"><Zap className="w-2.5 h-2.5 mr-0.5" />{ts.confidence}%</Badge>
                      <Badge variant="outline" className={`text-[10px] ${ts.trend === 'BULLISH' ? 'text-emerald-500' : ts.trend === 'BEARISH' ? 'text-red-500' : 'text-yellow-500'}`}>
                        {ts.trend === 'BULLISH' ? '▲' : ts.trend === 'BEARISH' ? '▼' : '→'} {ts.trend}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {ts.momentum === 'STRONG' ? <Flame className="w-2.5 h-2.5 mr-0.5 text-orange-500" /> : <Snowflake className="w-2.5 h-2.5 mr-0.5 text-blue-400" />}
                        {ts.momentum}
                      </Badge>
                      {ts.candlePattern && <Badge className="text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/30">🕯 {ts.candlePattern}</Badge>}
                    </div>
                    <Progress value={ts.confidence} className={`h-1.5 mt-1.5 w-40 ${ts.direction === 'LONG' ? '[&>div]:bg-emerald-500' : '[&>div]:bg-red-500'}`} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Button variant="outline" size="sm" onClick={onCopy} className="gap-1.5 h-7 text-xs">
                    {copied ? <><Check className="w-3 h-3" /> Скопировано!</> : <><Copy className="w-3 h-3" /> Скопировать</>}
                  </Button>
                  <span className="text-[9px] text-muted-foreground">{coinSymbol.toUpperCase()}/USDT</span>
                </div>
              </div>
            </div>

            {/* Middle: Price Levels */}
            <div className="px-4 py-3 border-t border-border/50">
              {/* Entry type banner */}
              {ts.entryType === 'LIMIT' && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                  <Target className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] text-blue-500 font-semibold">ЛИМИТНЫЙ ОРДЕР</span>
                  <span className="text-[10px] text-muted-foreground">— ждите отката до уровня входа</span>
                  {ts.entryReason && <span className="text-[10px] text-muted-foreground ml-auto">{ts.entryReason}</span>}
                </div>
              )}
              {ts.entryType === 'MARKET' && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <Zap className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-500 font-semibold">РЫНОЧНЫЙ ОРДЕР</span>
                  <span className="text-[10px] text-muted-foreground">— цена уже у уровня входа</span>
                </div>
              )}
              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2 text-center">
                  <div className="text-muted-foreground text-[9px] font-semibold">ВХОД {ts.entryType === 'LIMIT' ? '(ЛИМИТ)' : '(РЫНОК)'}</div>
                  <div className="font-mono font-bold text-blue-500 text-sm">${fp(ts.entry)}</div>
                  {ts.entryType === 'LIMIT' && ts.currentPrice !== ts.entry && (
                    <div className="text-[9px] text-blue-400">{pc(ts.currentPrice, ts.entry)} от текущей</div>
                  )}
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-center">
                  <div className="text-muted-foreground text-[9px] font-semibold">СТОП-ЛОСС</div>
                  <div className="font-mono font-bold text-red-500 text-sm">${fp(ts.stopLoss)}</div>
                  <div className="text-[9px] text-red-400">{pc(ts.entry, ts.stopLoss)}</div>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                  <div className="text-muted-foreground text-[9px] font-semibold">TP1 (30%)</div>
                  <div className="font-mono font-bold text-emerald-500 text-sm">${fp(ts.takeProfit1)}</div>
                  <div className="text-[9px] text-emerald-400">{pc(ts.entry, ts.takeProfit1)}</div>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                  <div className="text-muted-foreground text-[9px] font-semibold">TP2 (50%)</div>
                  <div className="font-mono font-bold text-emerald-600 text-sm">${fp(ts.takeProfit2)}</div>
                  <div className="text-[9px] text-emerald-500">{pc(ts.entry, ts.takeProfit2)}</div>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                  <div className="text-muted-foreground text-[9px] font-semibold">TP3 (20%)</div>
                  <div className="font-mono font-bold text-emerald-700 text-sm">${fp(ts.takeProfit3)}</div>
                  <div className="text-[9px] text-emerald-600">{pc(ts.entry, ts.takeProfit3)}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                <span><Target className="w-3 h-3 text-muted-foreground inline mr-1" />R:R: <span className={`font-mono font-bold ${ts.riskReward >= 2 ? 'text-emerald-500' : 'text-yellow-500'}`}>{ts.riskReward.toFixed(2)}</span></span>
                <span><Timer className="w-3 h-3 text-muted-foreground inline mr-1" />Удержание: <span className="font-semibold">{ts.holdDuration}</span></span>
                <span><Shield className="w-3 h-3 text-muted-foreground inline mr-1" />Подд: <span className="text-emerald-500 font-mono">${fp(ts.support)}</span></span>
                <span><Shield className="w-3 h-3 text-muted-foreground inline mr-1" />Сопр: <span className="text-red-500 font-mono">${fp(ts.resistance)}</span></span>
                {ts.volumeSignal && <span><Volume2 className="w-3 h-3 text-muted-foreground inline mr-1" />{ts.volumeSignal}</span>}
              </div>
            </div>

            {/* Bottom: Step-by-step trade plan */}
            <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Пошаговый план сделки:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                    {getTradeSteps(ts, fp).map((step, i) => (
                      <div key={i} className="text-[11px] flex items-start gap-1.5">
                        <CheckCircle2 className={`w-3 h-3 mt-0.5 flex-shrink-0 ${i === 0 ? (ts.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500') : i === 1 ? 'text-red-500' : 'text-blue-500'}`} />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="min-w-[160px] max-w-[200px] space-y-1.5">
                  {ts.reasons.length > 0 && (
                    <div>
                      <div className="text-[9px] text-emerald-500 font-semibold mb-0.5">Причины входа:</div>
                      {ts.reasons.slice(0, 3).map((r, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px]">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          {r}
                        </div>
                      ))}
                    </div>
                  )}
                  {ts.warnings.length > 0 && (
                    <div>
                      <div className="text-[9px] text-yellow-500 font-semibold mb-0.5">Риски:</div>
                      {ts.warnings.slice(0, 2).map((w, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px]">
                          <AlertCircle className="w-2.5 h-2.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // FLAT — no signal
  return (
    <Card className="border-2 border-yellow-500/30 bg-yellow-500/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Pause className="w-10 h-10 text-yellow-500" />
          <div>
            <div className="text-xl font-bold text-yellow-500">НЕТ СИГНАЛА — ЖДИТЕ</div>
            <div className="text-xs text-muted-foreground mt-0.5">Рынок в боковике. Дождитесь сигнала LONG или SHORT для входа.</div>
            {ts.reasons[0] && <div className="text-xs text-muted-foreground mt-1">{ts.reasons[0]}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getTradeSteps(ts: TradeSignal, fp: (n: number) => string): string[] {
  const steps: string[] = [];
  steps.push(`Открыть ${ts.direction === 'LONG' ? 'ЛОНГ' : 'ШОРТ'} по рынку @ $${fp(ts.entry)}`);
  steps.push(`Установить стоп-лосс: $${fp(ts.stopLoss)}`);
  steps.push(`Цель TP1 (фиксация 30%): $${fp(ts.takeProfit1)}`);
  steps.push(`Цель TP2 (фиксация 50%): $${fp(ts.takeProfit2)}`);
  steps.push(`Цель TP3 (остаток): $${fp(ts.takeProfit3)}`);
  steps.push(`Удержание: ${ts.holdDuration}`);
  steps.push(`Если пробит стоп $${fp(ts.stopLoss)} — закрыть позицию без раздумий`);
  return steps;
}