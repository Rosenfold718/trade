'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gauge, TrendingUp, TrendingDown } from 'lucide-react';
import type { SentimentData } from '@/components/trading/types';

interface SentimentPanelProps {
  sentiment: SentimentData;
}

export function SentimentPanel({ sentiment }: SentimentPanelProps) {
  const fg = sentiment.fearGreed;
  const fgColor = fg.value <= 25 ? 'text-red-500' : fg.value <= 45 ? 'text-orange-500' : fg.value <= 55 ? 'text-yellow-500' : fg.value <= 75 ? 'text-emerald-400' : 'text-emerald-500';

  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-orange-500" />
          Настроения рынка
          <Badge variant="outline" className="text-[8px] ml-auto">{fg.classification}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-3">
        {/* Fear & Greed gauge */}
        <div className="flex items-center gap-3">
          <div className="text-3xl font-black font-mono text-orange-500">{fg.value}</div>
          <div className="flex-1 h-3 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 relative">
            <div
              className="absolute top-0 h-full w-1 bg-white rounded-full shadow-md transition-all duration-500"
              style={{ left: `${fg.value}%` }}
            />
          </div>
          <div className={`text-xs font-bold ${fgColor}`}>{fg.classification}</div>
        </div>

        {sentiment.overallSentiment && (
          <div className="text-[10px] text-muted-foreground">
            <span className="font-semibold">Общее:</span> {sentiment.overallSentiment}
          </div>
        )}

        {/* Bullish / Bearish factors */}
        {(sentiment.newsAnalysis?.bullish_factors?.length > 0 || sentiment.newsAnalysis?.bearish_factors?.length > 0) && (
          <div className="space-y-2">
            {sentiment.newsAnalysis.bullish_factors.length > 0 && (
              <div>
                <div className="text-[9px] text-emerald-500 font-semibold mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Бычьи факторы
                </div>
                {sentiment.newsAnalysis.bullish_factors.slice(0, 4).map((f, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className="text-emerald-500">•</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            )}
            {sentiment.newsAnalysis.bearish_factors.length > 0 && (
              <div>
                <div className="text-[9px] text-red-500 font-semibold mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Медвежьи факторы
                </div>
                {sentiment.newsAnalysis.bearish_factors.slice(0, 4).map((f, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className="text-red-500">•</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}