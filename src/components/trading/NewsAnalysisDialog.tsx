'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Brain, TrendingUp, TrendingDown, AlertTriangle,
  Zap, ShieldAlert, ArrowRight,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

// ─── Types ───

interface NewsAnalysisResult {
  outlook: string;
  summary: string;
  insights: string[];
  opportunities: string[];
  risks: string[];
  recommendedAction: string;
  confidence: number;
  timestamp: string;
}

interface NewsAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ───

export function NewsAnalysisDialog({ open, onOpenChange }: NewsAnalysisDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NewsAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<{ data: NewsAnalysisResult; timestamp: number } | null>(null);
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  const fetchAnalysis = useCallback(async () => {
    // Check cache first
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setData(cacheRef.current.data);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/crypto/news-analysis');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // API returns { analysis: {...}, rawContent, source, cachedAt }
      // Component expects flat { outlook, summary, insights, ... }
      const a = json.analysis || json;
      const mapped: NewsAnalysisResult = {
        outlook: a.marketOutlook === 'BULLISH' ? 'Бычий (Bullish)' : a.marketOutlook === 'BEARISH' ? 'Медвежий (Bearish)' : 'Нейтральный',
        summary: Array.isArray(a.keyInsights) ? a.keyInsights.slice(0, 2).join('. ') + '.' : (a.summary || 'Анализ недоступен'),
        insights: Array.isArray(a.keyInsights) ? a.keyInsights : [],
        opportunities: Array.isArray(a.opportunities) ? a.opportunities.map((o: any) => typeof o === 'string' ? o : `${o.coin}: ${o.reason}`) : [],
        risks: Array.isArray(a.risks) ? a.risks : [],
        recommendedAction: a.recommendedAction || 'Данных недостаточно',
        confidence: a.confidence || 0,
        timestamp: json.cachedAt ? new Date(json.cachedAt).toLocaleString('ru-RU') : new Date().toLocaleString('ru-RU'),
      };

      cacheRef.current = { data: mapped, timestamp: Date.now() };
      setData(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchAnalysis();
  }, [open, fetchAnalysis]);

  const outlookColor = data?.outlook?.includes('Бычий') || data?.outlook?.includes('Bullish')
    ? 'text-emerald-500' : data?.outlook?.includes('Медвежий') || data?.outlook?.includes('Bearish')
    ? 'text-red-500' : 'text-yellow-500';

  const actionColor = data?.recommendedAction?.includes('ПОКУПК') || data?.recommendedAction?.includes('BUY')
    ? 'bg-emerald-500' : data?.recommendedAction?.includes('ПРОДАЖ') || data?.recommendedAction?.includes('SELL')
    ? 'bg-red-500' : 'bg-yellow-500';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            AI Анализ Новостей
          </DialogTitle>
          <DialogDescription>Сводка рынка на основе последних новостей</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <p className="text-sm text-muted-foreground">Анализирую новости и рыночные данные...</p>
          </div>
        )}

        {error && !loading && (
          <Card className="border-red-500/30">
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={fetchAnalysis} className="mt-2 text-xs text-purple-500 hover:underline">
                Попробовать снова
              </button>
            </CardContent>
          </Card>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Outlook */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">Рыночный прогноз</span>
                  <Badge className={`${outlookColor} border-0`}>
                    {data.outlook}
                  </Badge>
                </div>
                <p className="text-sm">{data.summary}</p>
                {data.confidence > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Уверенность:</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all"
                        style={{ width: `${data.confidence}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold">{data.confidence}%</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Key Insights */}
            {data.insights?.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />Ключевые инсайты
                  </h3>
                  <ul className="space-y-1.5">
                    {data.insights.map((insight, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Opportunities & Risks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.opportunities?.length > 0 && (
                <Card className="border-emerald-500/20">
                  <CardContent className="p-4">
                    <h3 className="text-xs font-semibold text-emerald-500 mb-2 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />Возможности
                    </h3>
                    <ul className="space-y-1.5">
                      {data.opportunities.map((opp, i) => (
                        <li key={i} className="text-sm text-emerald-500/90">• {opp}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {data.risks?.length > 0 && (
                <Card className="border-red-500/20">
                  <CardContent className="p-4">
                    <h3 className="text-xs font-semibold text-red-500 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" />Риски
                    </h3>
                    <ul className="space-y-1.5">
                      {data.risks.map((risk, i) => (
                        <li key={i} className="text-sm text-red-500/90">• {risk}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Recommended Action */}
            {data.recommendedAction && (
              <Card>
                <CardContent className="p-4">
                  <span className="text-xs font-semibold text-muted-foreground">Рекомендуемое действие</span>
                  <div className="mt-2">
                    <Badge className={`${actionColor} text-white text-sm px-3 py-1`}>
                      {data.recommendedAction}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {data.timestamp && (
              <p className="text-[10px] text-muted-foreground text-center">
                Обновлено: {new Date(data.timestamp).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}