'use client';

import React from 'react';
import { Cpu, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ScanPanelProps {
  scanResult: { opportunities: any[] } | null;
  scanLoading: boolean;
  onScan: () => void;
}

export function ScanPanel({ scanResult, scanLoading, onScan }: ScanPanelProps) {
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        onClick={onScan}
        disabled={scanLoading}
        className="h-7 text-[10px] gap-1 bg-purple-500 hover:bg-purple-600 text-white"
      >
        <Cpu className="w-3 h-3" />
        {scanLoading ? 'Скан...' : 'Скан монет'}
      </Button>

      {scanResult && scanResult.opportunities.length > 0 && (
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-500" />
              Возможности ({scanResult.opportunities.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {scanResult.opportunities.slice(0, 10).map((opp: any, i: number) => (
                <div key={i} className={`rounded-lg border p-2 text-[10px] ${
                  opp.direction === 'LONG' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${opp.direction === 'LONG' ? 'text-emerald-500' : 'text-red-500'}`}>
                        {opp.direction === 'LONG' ? '▲' : '▼'}
                      </span>
                      <span className="font-semibold">{opp.symbol}/USDT</span>
                      <span className="text-muted-foreground">{opp.confidence}%</span>
                    </div>
                    <span className="text-muted-foreground">R:R {opp.riskReward?.toFixed(1) || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}