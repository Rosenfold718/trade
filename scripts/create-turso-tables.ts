import { createClient } from '@libsql/client';

const dbUrl = process.env.DATABASE_URL || '';
const client = createClient({ url: dbUrl });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS "TraderState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "initialDeposit" REAL NOT NULL DEFAULT 100,
  "balance" REAL NOT NULL DEFAULT 100,
  "totalTrades" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "expired" INTEGER NOT NULL DEFAULT 0,
  "score" REAL NOT NULL DEFAULT 0,
  "winRate" REAL NOT NULL DEFAULT 0,
  "avgPnl" REAL NOT NULL DEFAULT 0,
  "streak" INTEGER NOT NULL DEFAULT 0,
  "bestTrade" REAL NOT NULL DEFAULT 0,
  "worstTrade" REAL NOT NULL DEFAULT 0,
  "totalPnl" REAL NOT NULL DEFAULT 0,
  "level" TEXT NOT NULL DEFAULT 'Новичок',
  "levelEmoji" TEXT NOT NULL DEFAULT '🌱',
  "riskPerTrade" REAL NOT NULL DEFAULT 5,
  "defaultLeverage" INTEGER NOT NULL DEFAULT 3,
  "totalDebt" REAL NOT NULL DEFAULT 0,
  "totalRepaid" REAL NOT NULL DEFAULT 0,
  "lockedInPositions" REAL NOT NULL DEFAULT 0,
  "freeBalance" REAL NOT NULL DEFAULT 100,
  "lastUpdated" INTEGER NOT NULL DEFAULT 0,
  "adaptiveMinSlDistancePct" REAL NOT NULL DEFAULT 1,
  "adaptiveMinConfidence" INTEGER NOT NULL DEFAULT 60,
  "adaptiveAvoidCoins" TEXT NOT NULL DEFAULT '[]',
  "adaptiveMinRr" REAL NOT NULL DEFAULT 1.5,
  "adaptiveCounterTrendPenalty" REAL NOT NULL DEFAULT 0.1,
  "adaptiveLimitExpiryHours" INTEGER NOT NULL DEFAULT 2,
  "adaptiveMarketEntryConditions" TEXT NOT NULL DEFAULT '[]',
  "adaptiveLessonsVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "Trade" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coinId" TEXT NOT NULL,
  "coinSymbol" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "entry" REAL NOT NULL,
  "currentPrice" REAL NOT NULL,
  "stopLoss" REAL NOT NULL,
  "takeProfit1" REAL,
  "takeProfit2" REAL,
  "takeProfit3" REAL,
  "confidence" INTEGER NOT NULL,
  "timeframe" TEXT NOT NULL,
  "entryReason" TEXT NOT NULL,
  "reasons" TEXT NOT NULL DEFAULT '[]',
  "leverage" INTEGER NOT NULL,
  "positionSize" REAL NOT NULL,
  "quantity" REAL NOT NULL,
  "timestamp" INTEGER NOT NULL,
  "entryReached" BOOLEAN NOT NULL DEFAULT 0,
  "enteredAt" INTEGER,
  "resolved" BOOLEAN NOT NULL DEFAULT 0,
  "result" TEXT,
  "exitPrice" REAL,
  "exitReason" TEXT,
  "closedAt" INTEGER,
  "pnlUSDT" REAL,
  "pnlPct" REAL,
  "pointsChange" REAL,
  "trailingStop" BOOLEAN NOT NULL DEFAULT 0,
  "trailingStopPrice" REAL,
  "trailingStepPct" REAL,
  "partialExits" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "Trade_coinId_idx" ON "Trade"("coinId");
CREATE INDEX IF NOT EXISTS "Trade_direction_idx" ON "Trade"("direction");
CREATE INDEX IF NOT EXISTS "Trade_resolved_idx" ON "Trade"("resolved");
CREATE INDEX IF NOT EXISTS "Trade_result_idx" ON "Trade"("result");
CREATE INDEX IF NOT EXISTS "Trade_timestamp_idx" ON "Trade"("timestamp");

CREATE TABLE IF NOT EXISTS "DepositSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "timestamp" INTEGER NOT NULL,
  "balance" REAL NOT NULL,
  "equity" REAL NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "DepositSnapshot_timestamp_idx" ON "DepositSnapshot"("timestamp");

CREATE TABLE IF NOT EXISTS "DebtEntry" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "timestamp" INTEGER NOT NULL,
  "amount" REAL NOT NULL,
  "remainingOwed" REAL NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "DebtEntry_timestamp_idx" ON "DebtEntry"("timestamp");

CREATE TABLE IF NOT EXISTS "Lesson" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "coinId" TEXT,
  "direction" TEXT,
  "value" REAL,
  "timestamp" INTEGER NOT NULL,
  "tradeId" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "Lesson_coinId_idx" ON "Lesson"("coinId");
CREATE INDEX IF NOT EXISTS "Lesson_type_idx" ON "Lesson"("type");
CREATE INDEX IF NOT EXISTS "Lesson_timestamp_idx" ON "Lesson"("timestamp");
CREATE INDEX IF NOT EXISTS "Lesson_tradeId_idx" ON "Lesson"("tradeId");

CREATE TABLE IF NOT EXISTS "Thought" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "timestamp" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "coinSymbol" TEXT,
  "coinId" TEXT,
  "direction" TEXT,
  "confidence" INTEGER,
  "score" REAL,
  "tradeId" TEXT,
  "pnl" REAL,
  "entryType" TEXT,
  "emotion" TEXT NOT NULL DEFAULT 'neutral',
  "tags" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "Thought_type_idx" ON "Thought"("type");
CREATE INDEX IF NOT EXISTS "Thought_timestamp_idx" ON "Thought"("timestamp");
CREATE INDEX IF NOT EXISTS "Thought_coinId_idx" ON "Thought"("coinId");
CREATE INDEX IF NOT EXISTS "Thought_tradeId_idx" ON "Thought"("tradeId");

CREATE TABLE IF NOT EXISTS "TradeAuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "timestamp" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '{}',
  "coinId" TEXT,
  "tradeId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "TradeAuditLog_action_idx" ON "TradeAuditLog"("action");
CREATE INDEX IF NOT EXISTS "TradeAuditLog_timestamp_idx" ON "TradeAuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "TradeAuditLog_coinId_idx" ON "TradeAuditLog"("coinId");
CREATE INDEX IF NOT EXISTS "TradeAuditLog_tradeId_idx" ON "TradeAuditLog"("tradeId");
`;

async function main() {
  console.log('Connecting to Turso...');
  // Test connection
  await client.execute('SELECT 1');
  console.log('Connected! Creating tables...');

  for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
    try {
      await client.execute(stmt);
      console.log(`OK: ${stmt.slice(0, 60)}...`);
    } catch (e: any) {
      console.error(`ERR: ${e.message.slice(0, 100)}`);
    }
  }

  // Insert default TraderState if not exists
  try {
    await client.execute({
      sql: `INSERT OR IGNORE INTO TraderState (id) VALUES ('singleton')`
    });
    console.log('Default TraderState ensured.');
  } catch (e: any) {
    console.error('Failed to insert default state:', e.message);
  }

  console.log('Done!');
  client.close();
}

main().catch(console.error);