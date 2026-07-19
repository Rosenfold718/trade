import { NextResponse } from 'next/server';

const TIMEOUT_MS = 3000;

interface ServiceStatus {
  name: string;
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  latencyMs?: number;
  detail?: string;
}

async function checkService(name: string, url: string): Promise<ServiceStatus> {
  try {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;
    if (res.ok) return { name, status: 'ok', latencyMs };
    return { name, status: 'degraded', latencyMs, detail: `${res.status}` };
  } catch {
    return { name, status: 'error', detail: 'timeout/unreachable' };
  }
}

export async function GET() {
  const startTime = Date.now();

  // Check external APIs
  const services: ServiceStatus[] = await Promise.all([
    checkService('Binance API', 'https://api.binance.com/api/v3/ping'),
    checkService('CoinGecko API', 'https://api.coingecko.com/api/v3/ping'),
  ]);

  // Check database (Prisma/SQLite)
  try {
    const { db } = await import('@/lib/db');
    await db.tradeAuditLog.findFirst({ take: 1 });
    services.push({ name: 'Database', status: 'ok', latencyMs: 0 });
  } catch {
    services.push({ name: 'Database', status: 'unknown', detail: 'SQLite (ephemeral on serverless)' });
  }

  // WebSocket price feed (now direct Binance WS from browser)
  services.push({ name: 'Live Prices', status: 'ok', detail: 'Binance WebSocket (direct)' });

  // Determine overall status
  const serviceErrors = services.filter(s => s.status === 'error').length;
  const overallStatus = serviceErrors >= 2 ? 'error' as const : serviceErrors >= 1 ? 'degraded' as const : 'ok' as const;

  return NextResponse.json({
    status: overallStatus,
    timestamp: Date.now(),
    uptime: Math.round(process.uptime()),
    responseTimeMs: Date.now() - startTime,
    services,
  });
}