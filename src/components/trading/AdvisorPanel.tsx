'use client';

import React from 'react';
import { Brain, Loader2, RefreshCw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AdvisorPanelProps {
  analysis: string | null;
  loading: boolean;
  visible: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  coinSymbol: string;
  direction: string | null;
  confidence: number | null;
}

export function AdvisorPanel({
  analysis,
  loading,
  visible,
  onToggle,
  onRefresh,
  coinSymbol,
  direction,
  confidence,
}: AdvisorPanelProps) {
  if (!visible) return null;

  return (
    <Card className="border border-purple-500/30">
      <CardHeader className="px-3 py-2 flex flex-row items-center gap-2 space-y-0">
        <Brain className="w-4 h-4 text-purple-500" />
        <span className="text-xs font-semibold">AI Советчик</span>
        <Badge variant="outline" className="text-[8px] text-purple-500 border-purple-500/30">
          {coinSymbol.toUpperCase()}
        </Badge>
        {direction && direction !== 'FLAT' && (
          <Badge className={`text-[8px] ${direction === 'LONG' ? 'bg-emerald-500' : 'bg-red-500'} text-white`}>
            {direction === 'LONG' ? '▲' : '▼'} {confidence}%
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!loading && analysis && (
            <Button variant="ghost" size="sm" onClick={onRefresh} className="h-5 w-5 p-0">
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onToggle}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {loading ? (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
            <span className="text-xs text-muted-foreground">AI анализирует...</span>
          </div>
        ) : analysis ? (
          <div className="space-y-1.5">
            {analysis.split('\n').map((line, i) => {
              if (line.trim() === '') return null;
              if (line.startsWith('**ИТОГ') || line.startsWith('**Итог')) {
                const clean = line.replace(/\*\*/g, '');
                return (
                  <div key={i} className="mt-2 rounded-md bg-purple-500/10 border border-purple-500/30 px-3 py-2">
                    <span className="text-xs font-bold text-purple-500">{clean}</span>
                  </div>
                );
              }
              if (line.startsWith('**') && line.endsWith('**')) {
                return <div key={i} className="text-xs font-bold text-foreground mt-1">{line.replace(/\*\*/g, '')}</div>;
              }
              if (line.startsWith('**')) {
                const parts = line.split('**');
                return (
                  <div key={i} className="text-xs text-muted-foreground">
                    {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-foreground">{part}</strong> : part)}
                  </div>
                );
              }
              return <div key={i} className="text-xs text-muted-foreground">{line}</div>;
            })}
          </div>
        ) : (
          <div className="text-center py-3 text-muted-foreground text-[10px]">
            Нажмите «AI Советчик» для краткого анализа
          </div>
        )}
      </CardContent>
    </Card>
  );
}