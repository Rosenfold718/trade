'use client';

import React from 'react';
import { Crosshair, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import type { PositionTool as PositionToolType } from '@/components/trading/types';
import { formatPrice } from '@/components/trading/types';

interface PositionToolPanelProps {
  tool: PositionToolType;
  onChange: (tool: PositionToolType) => void;
  displayPrice: number;
}

export function PositionToolPanel({ tool, onChange, displayPrice }: PositionToolPanelProps) {
  const update = (partial: Partial<PositionToolType>) => onChange({ ...tool, ...partial });

  const tp = tool.entryPrice > 0
    ? (tool.direction === 'LONG'
        ? ((tool.targetPrice - tool.entryPrice) / tool.entryPrice)
        : ((tool.entryPrice - tool.targetPrice) / tool.entryPrice)) * tool.amount * tool.leverage
    : 0;
  const sp = tool.entryPrice > 0
    ? (tool.direction === 'LONG'
        ? ((tool.stopLoss - tool.entryPrice) / tool.entryPrice)
        : ((tool.entryPrice - tool.stopLoss) / tool.entryPrice)) * tool.amount * tool.leverage
    : 0;
  const r = sp !== 0 ? Math.abs(tp / sp) : 0;
  const liq = tool.leverage > 1
    ? (tool.direction === 'LONG'
        ? tool.entryPrice * (1 - 1 / tool.leverage)
        : tool.entryPrice * (1 + 1 / tool.leverage))
    : 0;

  const step = displayPrice >= 1 ? 0.01 : 0.0000001;

  return (
    <Card className={`border-2 ${tool.direction === 'LONG' ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-blue-500" />
          Калькулятор позиции
          <Button variant="ghost" size="sm" className="ml-auto h-5 w-5 p-0" onClick={() => update({ enabled: false })}>
            <X className="w-3 h-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-3">
        <div className="flex gap-1">
          <button
            onClick={() => update({ direction: 'LONG' })}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
              tool.direction === 'LONG' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
            }`}
          >
            ▲ LONG
          </button>
          <button
            onClick={() => update({ direction: 'SHORT' })}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
              tool.direction === 'SHORT' ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500 border border-red-500/30'
            }`}
          >
            ▼ SHORT
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[9px] text-muted-foreground block mb-0.5">Вход</label>
            <Input
              type="number"
              value={tool.entryPrice || ''}
              onChange={e => update({ entryPrice: Number(e.target.value) || 0 })}
              className="h-7 text-[11px] font-mono"
              step={step}
            />
          </div>
          <div>
            <label className="text-[9px] text-muted-foreground block mb-0.5">Цель</label>
            <Input
              type="number"
              value={tool.targetPrice || ''}
              onChange={e => update({ targetPrice: Number(e.target.value) || 0 })}
              className="h-7 text-[11px] font-mono"
              step={step}
            />
          </div>
          <div>
            <label className="text-[9px] text-muted-foreground block mb-0.5">Стоп</label>
            <Input
              type="number"
              value={tool.stopLoss || ''}
              onChange={e => update({ stopLoss: Number(e.target.value) || 0 })}
              className="h-7 text-[11px] font-mono"
              step={step}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-muted-foreground block mb-0.5">Сумма: ${tool.amount}</label>
            <Slider
              value={[tool.amount]}
              onValueChange={v => update({ amount: v[0] })}
              min={1}
              max={10000}
              step={1}
            />
            <div className="flex gap-1 mt-1">
              {[10, 50, 100, 500, 1000].map(a => (
                <button
                  key={a}
                  onClick={() => update({ amount: a })}
                  className={`px-1.5 py-0.5 text-[8px] rounded ${tool.amount === a ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
                >
                  ${a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[9px] text-muted-foreground block mb-0.5">Плечо: {tool.leverage}x</label>
            <Slider
              value={[tool.leverage]}
              onValueChange={v => update({ leverage: v[0] })}
              min={1}
              max={10}
              step={1}
            />
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 5, 10].map(l => (
                <button
                  key={l}
                  onClick={() => update({ leverage: l })}
                  className={`px-1.5 py-0.5 text-[8px] rounded ${tool.leverage === l ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
                >
                  {l}x
                </button>
              ))}
            </div>
          </div>
        </div>
        {tool.entryPrice > 0 && (
          <div className="rounded-lg border border-border p-2 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Профит:</span>
              <span className={`font-mono font-bold ${tp >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {tp >= 0 ? '+' : ''}{formatPrice(tp)}$
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Стоп:</span>
              <span className="font-mono font-bold text-red-500">{formatPrice(sp)}$</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">R:R:</span>
              <span className={`font-mono font-bold ${r >= 2 ? 'text-emerald-500' : 'text-yellow-500'}`}>
                1 : {r.toFixed(2)}
              </span>
            </div>
            {tool.leverage > 1 && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Ликвидация:</span>
                <span className="font-mono text-red-400">${formatPrice(liq)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Итого:</span>
              <span className={`font-mono font-bold ${tp >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                ${formatPrice(tool.amount + tp)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}