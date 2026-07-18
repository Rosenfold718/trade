'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Activity } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ─── Types ───

interface ServiceStatus {
  name: string;
  status: 'ok' | 'degraded' | 'error';
  latencyMs?: number;
  detail?: string;
}

interface HealthData {
  status: 'ok' | 'degraded' | 'error';
  services: ServiceStatus[];
  uptime?: number;
}

// ─── Hook ───

function useHealthStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const json = await res.json();
        if (mountedRef.current) {
          setHealth(json);
          setLoading(false);
        }
      }
    } catch {
      if (mountedRef.current) {
        setHealth({ status: 'error', services: [{ name: 'API', status: 'error', detail: 'Недоступен' }] });
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const iv = setInterval(fetchHealth, 30000);
    // Initial fetch via timeout to avoid set-state-in-effect lint
    const t = setTimeout(fetchHealth, 0);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      clearTimeout(t);
    };
  }, [fetchHealth]);

  return { health, loading, refetch: fetchHealth };
}

// ─── Status Icon (declared outside render) ───

function StatusIcon({ status, loading }: { status: string; loading: boolean }) {
  if (loading) return <Activity className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />;
  if (status === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'degraded') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />;
  return <XCircle className="w-3.5 h-3.5 text-red-500" />;
}

// ─── Component ───

export function HealthStatusIndicator() {
  const { health, loading } = useHealthStatus();

  const overallStatus = health?.status || (loading ? 'degraded' : 'error');
  const statusLabel = overallStatus === 'ok' ? 'Все сервисы ОК' : overallStatus === 'degraded' ? 'Сервисы частично недоступны' : 'Ошибка сервисов';

  const icon = useMemo(() => (
    <StatusIcon status={overallStatus} loading={loading} />
  ), [overallStatus, loading]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-accent transition-colors cursor-pointer"
          title={statusLabel}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          Статус сервисов
        </h4>
        {health ? (
          <div className="space-y-1.5">
            {health.services?.map((svc, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{svc.name}</span>
                <div className="flex items-center gap-1.5">
                  {svc.latencyMs != null && (
                    <span className="text-[10px] font-mono text-muted-foreground">{svc.latencyMs}ms</span>
                  )}
                  {svc.status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  {svc.status === 'degraded' && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                  {svc.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                </div>
              </div>
            ))}
            {health.uptime != null && (
              <p className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border">
                Аптайм: {(health.uptime / 3600).toFixed(1)}ч
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Загрузка...</p>
        )}
      </PopoverContent>
    </Popover>
  );
}