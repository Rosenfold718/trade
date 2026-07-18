import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';

const TIMEOUT_MS = 3000;

async function checkService(url: string): Promise<'ok' | 'error' | 'degraded'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) return 'ok';
    return 'degraded';
  } catch {
    return 'error';
  }
}

export async function GET() {
  const startTime = Date.now();

  // Check database
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    await db.tradeAuditLog.findFirst({ take: 1 });
  } catch {
    dbStatus = 'error';
  }

  // Check external APIs
  const [binanceStatus, coinGeckoStatus] = await Promise.all([
    checkService('https://api.binance.com/api/v3/ping'),
    checkService('https://api.coingecko.com/api/v3/ping'),
  ]);

  // Check internal mini-services
  const [priceServiceStatus, cronServiceStatus] = await Promise.all([
    checkService('http://localhost:3003/'),
    checkService('http://localhost:3004/status'),
  ]);

  // Trading stats — read from trader-data.json
  let openPositions = 0;
  let balance = 0;
  let drawdownPct = 0;
  let lastScanAt: number | null = null;

  try {
    const dataPath = join(process.cwd(), 'trader-data.json');
    if (existsSync(dataPath)) {
      const raw = await readFile(dataPath, 'utf-8');
      const data = JSON.parse(raw);
      openPositions = (data.trades || []).filter((t: { resolved: boolean }) => !t.resolved).length;
      balance = data.balance ?? 0;
      const initialDeposit = data.initialDeposit || 100;
      drawdownPct = balance < initialDeposit
        ? Math.round(((initialDeposit - balance) / initialDeposit) * 10000) / 100
        : 0;
      lastScanAt = data.lastScanAt ?? null;
    }
  } catch {
    // trader-data.json not available
  }

  const memoryUsage = process.memoryUsage();

  // Determine overall status
  const serviceErrors = [dbStatus, binanceStatus, coinGeckoStatus].filter(s => s === 'error').length;
  const overallStatus = serviceErrors >= 2 ? 'error' : serviceErrors >= 1 ? 'degraded' : 'ok';

  return NextResponse.json({
    status: overallStatus,
    timestamp: Date.now(),
    uptime: Math.round(process.uptime()),
    responseTimeMs: Date.now() - startTime,
    services: {
      database: dbStatus,
      binanceApi: binanceStatus,
      coinGeckoApi: coinGeckoStatus,
      priceService: priceServiceStatus === 'ok' ? 'ok' as const : 'unknown' as const,
      cronService: cronServiceStatus === 'ok' ? 'ok' as const : 'unknown' as const,
    },
    trading: {
      openPositions,
      balance,
      drawdownPct,
      lastScanAt,
    },
    memoryUsage: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    },
  });
}