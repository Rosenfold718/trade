/**
 * cron-service — Standalone Bun service on port 3004
 *
 * Runs automatic market scans every 5 minutes.
 * For each opportunity with score > 40 and confidence > 65,
 * automatically opens a trade via the reputation API.
 */

const PORT = 3004;
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TRADE_DELAY_MS = 2000; // 2s between trades to respect rate limits
const MAIN_API = 'http://localhost:3000';

// ─── State ────────────────────────────────────────────────────────────────────

const startTime = Date.now();
let lastScanAt: number | null = null;
let nextScanAt: number = Date.now(); // First scan runs immediately
let tradesOpened = 0;
let errors: Array<{ time: number; message: string }> = [];

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[cron ${ts}] ${msg}`);
}

// ─── Scan + Auto-trade ────────────────────────────────────────────────────────

async function runScanAndTrade() {
  log('Starting automatic market scan...');

  try {
    // Step 1: Call scan API
    const scanRes = await fetch(`${MAIN_API}/api/crypto/scan`);
    if (!scanRes.ok) {
      const errText = await scanRes.text().catch(() => '');
      throw new Error(`Scan API returned ${scanRes.status}: ${errText}`);
    }

    const scanData = await scanRes.json();
    const opportunities = scanData.opportunities || [];
    lastScanAt = Date.now();
    log(`Scan complete: ${opportunities.length} opportunities found (scanned ${scanData.totalScanned} coins)`);

    // Step 2: Filter for high-quality opportunities
    const autoEligible = opportunities.filter(
      (o: { score: number; confidence: number }) => o.score > 40 && o.confidence > 65,
    );

    if (autoEligible.length === 0) {
      log('No auto-trade eligible opportunities (score > 40, confidence > 65)');
      return;
    }

    log(`Found ${autoEligible.length} auto-trade eligible opportunities`);

    // Step 3: Open trades for each eligible opportunity (with delay)
    for (const opp of autoEligible) {
      try {
        await openTrade(opp);
        tradesOpened++;
        log(`Auto-opened trade: ${opp.symbol} ${opp.direction} (score=${opp.score}, confidence=${opp.confidence}%)`);
      } catch (err: any) {
        const msg = `Failed to open trade for ${opp.symbol}: ${err.message || String(err)}`;
        log(msg);
        errors.push({ time: Date.now(), message: msg });
      }

      // Wait between trades
      if (autoEligible.indexOf(opp) < autoEligible.length - 1) {
        await sleep(TRADE_DELAY_MS);
      }
    }
  } catch (err: any) {
    const msg = `Scan failed: ${err.message || String(err)}`;
    log(msg);
    errors.push({ time: Date.now(), message: msg });
  }

  // Keep only last 100 errors
  if (errors.length > 100) {
    errors = errors.slice(-100);
  }

  // Schedule next scan
  nextScanAt = Date.now() + SCAN_INTERVAL_MS;
}

async function openTrade(opp: {
  coinId: string;
  symbol: string;
  direction: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  confidence: number;
  score: number;
  price: number;
  entryReason: string;
  reasons: string[];
  riskReward: number;
}) {
  const body = {
    coinId: opp.coinId,
    coinSymbol: opp.symbol,
    direction: opp.direction,
    entry: opp.entry,
    stopLoss: opp.stopLoss,
    takeProfit1: opp.takeProfit1,
    confidence: opp.confidence,
    currentPrice: opp.price,
    timeframe: '1h',
    entryReason: opp.entryReason,
    reasons: opp.reasons,
    autoTrade: true,
  };

  const res = await fetch(`${MAIN_API}/api/crypto/reputation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.reason || data.error || 'Unknown error');
  }

  return data;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── HTTP Status endpoint ─────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  fetch(req: Request) {
    const url = new URL(req.url);

    if (url.pathname === '/status' && req.method === 'GET') {
      return Response.json({
        status: 'running',
        port: PORT,
        lastScan: lastScanAt,
        nextScan: nextScanAt,
        tradesOpened,
        errors: errors.length,
        recentErrors: errors.slice(-5),
        uptime: Math.round((Date.now() - startTime) / 1000),
        scanIntervalSec: Math.round(SCAN_INTERVAL_MS / 1000),
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

log(`Cron service started on port ${PORT}`);
log(`First scan scheduled immediately, then every ${SCAN_INTERVAL_MS / 1000}s`);

// Run first scan immediately
setTimeout(() => {
  runScanAndTrade();
}, 2000); // Small delay for main app to start

// Then every 5 minutes
setInterval(() => {
  runScanAndTrade();
}, SCAN_INTERVAL_MS);