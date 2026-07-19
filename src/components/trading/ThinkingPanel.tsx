'use client';

import React from 'react';
import { X, Brain } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ThinkingPanelProps {
  thinking: any;
  onClose: () => void;
}

export function ThinkingPanel({ thinking, onClose }: ThinkingPanelProps) {
  const emotionColors: Record<string, string> = {
    confident: 'border-emerald-500/40 bg-emerald-500/5',
    cautious: 'border-yellow-500/30 bg-yellow-500/5',
    worried: 'border-red-500/30 bg-red-500/5',
    frustrated: 'border-red-500/40 bg-red-500/10',
    satisfied: 'border-emerald-500/30 bg-emerald-500/5',
    analytical: 'border-blue-500/30 bg-blue-500/5',
    neutral: 'border-border bg-card',
  };
  const emotionIcons: Record<string, string> = {
    confident: '💪', cautious: '⚡', worried: '😰',
    frustrated: '😤', satisfied: '✅', analytical: '🔍', neutral: '📌',
  };
  const typeLabels: Record<string, string> = {
    scan: 'СКАН', decision: 'РЕШЕНИЕ', close: 'ЗАКРЫТИЕ',
    adjustment: 'КОРРЕКТИРОВКА', lesson: 'УРОК', observation: 'НАБЛЮДЕНИЕ',
  };
  const typeColors: Record<string, string> = {
    scan: 'text-blue-400', decision: 'text-amber-400', close: 'text-purple-400',
    adjustment: 'text-orange-400', lesson: 'text-red-400', observation: 'text-zinc-400',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-card border-2 border-amber-500/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-gradient-to-r from-amber-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Brain className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  Мышление трейдера
                  <Badge className="bg-amber-500 text-white text-[9px]">LIVE</Badge>
                </h2>
                <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                  <span className="text-amber-500 font-semibold">{thinking?.currentMood || 'Анализ рынка'}</span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">Рынок: <span className={thinking?.marketView === 'Бычий' ? 'text-emerald-500' : thinking?.marketView === 'Медвежий' ? 'text-red-500' : 'text-yellow-500'}>{thinking?.marketView || 'Нейтральный'}</span></span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">Позиции: <span className="text-foreground font-mono">{thinking?.openPositionsCount || 0}/5</span></span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">Свободно: <span className="font-mono text-foreground">${(thinking?.freeBalance || 0).toFixed(2)}</span></span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {thinking?.lastScanAt && (
                <span className="text-[9px] text-muted-foreground">
                  Последний скан: {new Date(thinking.lastScanAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {/* Strategy & quick stats */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-center">
              <div className="text-[8px] text-amber-500 uppercase">Стратегия</div>
              <div className="text-[10px] font-bold text-foreground">{thinking?.activeStrategy || 'Внутридневная'}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-[8px] text-muted-foreground uppercase">Эквити</div>
              <div className="text-xs font-mono font-bold text-foreground">${(thinking?.totalEquity || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-[8px] text-muted-foreground uppercase">Мыслей</div>
              <div className="text-xs font-mono font-bold text-amber-500">{thinking?.thoughts?.length || 0}</div>
            </div>
          </div>
        </div>

        {/* Thoughts feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {!thinking?.thoughts || thinking.thoughts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <div className="text-sm">Трейдер ещё не начал думать</div>
              <div className="text-[10px] mt-1">Запустите скан или дождитесь автоматического цикла</div>
            </div>
          ) : (
            thinking.thoughts.map((thought: any, i: number) => (
              <div key={thought.id || i} className={`rounded-xl border p-3 ${emotionColors[thought.emotion] || emotionColors.neutral}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base flex-shrink-0 mt-0.5">{emotionIcons[thought.emotion] || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[8px] font-bold uppercase ${typeColors[thought.type] || 'text-zinc-400'}`}>
                        {typeLabels[thought.type] || thought.type}
                      </span>
                      {thought.coinSymbol && (
                        <Badge variant="outline" className="text-[8px] h-4 px-1">
                          {thought.coinSymbol} {thought.direction || ''}
                        </Badge>
                      )}
                      {thought.entryType && (
                        <Badge variant="outline" className={`text-[8px] h-4 px-1 ${thought.entryType === 'MARKET' ? 'border-emerald-500/30 text-emerald-500' : 'border-blue-500/30 text-blue-400'}`}>
                          {thought.entryType === 'MARKET' ? 'РЫНОК' : 'ЛИМИТ'}
                        </Badge>
                      )}
                      {thought.confidence !== undefined && (
                        <span className="text-[8px] text-muted-foreground">conf: {thought.confidence}%</span>
                      )}
                      <span className="text-[8px] text-muted-foreground ml-auto">
                        {new Date(thought.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-foreground leading-tight">{thought.title}</div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{thought.detail}</div>
                    {thought.tags && thought.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {thought.tags.map((tag: string, j: number) => (
                          <span key={j} className="text-[7px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}