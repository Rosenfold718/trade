/**
 * turso-cache.ts — Candle data cache using Turso (libSQL) cloud database.
 *
 * Stores fetched OHLCV candles in Turso for fast retrieval.
 * This eliminates repeated API calls for the same coin/interval/date range,
 * solving the "loading data for each coin" problem and providing more data
 * for backtesting by accumulating candles over time.
 */

import { createClient, type Client } from '@libsql/client';

const TURSO_URL = process.env.TURSO_URL || 'libsql://trade-rosenfold718.aws-ap-northeast-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJleHAiOjE4MTU5ODM4MTQsImlhdCI6MTc4NDQ0NzgxNCwiaWQiOiIwMTlmNzk2MC02ZjAxLTdjMGItYjMwOS1kZTAxYzA3MDYzYTAiLCJraWQiOiJxYXJ0VlRNdGJpazJHbTUxUkZkWURUVkg5TXMwQnZObkx3THBiRkFuRFZBIiwicmlkIjoiNzE5MzdkMjUtNmYyYi00MzZmLTgyMDctOGRhZjQ3YzhmNDE5In0.fhSQ5C5OpQmXizpNPZc9DFRNICHBNNmmT5DySujkpXW1xsupvhpsy-yTU84dmNz62Rd1Ur4gsL_itAVebTArDA';

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: TURSO_URL,
      authToken: TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

export interface CachedCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Initialize the candle cache table in Turso.
 * Called once on first use (or server startup).
 */
export async function initCache(): Promise<void> {
  try {
    const client = getClient();
    await client.execute(`
      CREATE TABLE IF NOT EXISTS candle_cache (
        coin_id TEXT NOT NULL,
        interval TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
        source TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (coin_id, interval, timestamp)
      )
    `);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_cache_coin_interval ON candle_cache (coin_id, interval, timestamp)`);
  } catch (err) {
    console.error('[turso-cache] Failed to initialize cache table:', err);
  }
}

/**
 * Store candles in the cache. Uses UPSERT to handle duplicates.
 */
export async function storeCandles(
  coinId: string,
  interval: string,
  candles: CachedCandle[],
  source: string,
): Promise<void> {
  if (candles.length === 0) return;

  try {
    const client = getClient();
    // Use a transaction for batch insert
    // Build batch with parameterized queries
    const stmts = candles.map(c => ({
      sql: `INSERT INTO candle_cache (coin_id, interval, timestamp, open, high, low, close, volume, source, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
            ON CONFLICT(coin_id, interval, timestamp) DO UPDATE SET
              open = excluded.open, high = excluded.high, low = excluded.low,
              close = excluded.close, volume = excluded.volume, source = excluded.source,
              fetched_at = unixepoch()`,
      args: [coinId, interval, c.timestamp, c.open, c.high, c.low, c.close, c.volume, source],
    }));

    // Execute in batches of 50 to stay within SQLite limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
      const batch = stmts.slice(i, i + BATCH_SIZE);
      await client.batch(batch as any);
    }
  } catch (err) {
    console.error('[turso-cache] Failed to store candles:', err);
  }
}

/**
 * Retrieve cached candles for a coin/interval/time range.
 * Returns candles sorted by timestamp ascending.
 */
export async function getCachedCandles(
  coinId: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<{ candles: CachedCandle[]; cachedCount: number }> {
  try {
    const client = getClient();
    const result = await client.execute({
      sql: `SELECT timestamp, open, high, low, close, volume
            FROM candle_cache
            WHERE coin_id = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp ASC`,
      args: [coinId, interval, startTime, endTime],
    });

    const candles: CachedCandle[] = result.rows.map(row => ({
      timestamp: Number(row.timestamp),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));

    return { candles, cachedCount: candles.length };
  } catch (err) {
    console.error('[turso-cache] Failed to get cached candles:', err);
    return { candles: [], cachedCount: 0 };
  }
}

/**
 * Get the time range of cached candles for a coin/interval.
 * Useful for determining what additional data needs to be fetched.
 */
export async function getCacheTimeRange(
  coinId: string,
  interval: string,
): Promise<{ minTimestamp: number; maxTimestamp: number; count: number }> {
  try {
    const client = getClient();
    const result = await client.execute({
      sql: `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts, COUNT(*) as cnt
            FROM candle_cache
            WHERE coin_id = ? AND interval = ?`,
      args: [coinId, interval],
    });

    if (result.rows.length === 0 || !result.rows[0].min_ts) {
      return { minTimestamp: 0, maxTimestamp: 0, count: 0 };
    }

    return {
      minTimestamp: Number(result.rows[0].min_ts),
      maxTimestamp: Number(result.rows[0].max_ts),
      count: Number(result.rows[0].cnt),
    };
  } catch (err) {
    console.error('[turso-cache] Failed to get cache time range:', err);
    return { minTimestamp: 0, maxTimestamp: 0, count: 0 };
  }
}

/**
 * Get cached candle count per coin/interval (for debugging/dashboard).
 */
export async function getCacheStats(): Promise<{ coinId: string; interval: string; count: number; oldest: number; newest: number }[]> {
  try {
    const client = getClient();
    const result = await client.execute(`
      SELECT coin_id, interval, COUNT(*) as cnt, MIN(timestamp) as oldest, MAX(timestamp) as newest
      FROM candle_cache
      GROUP BY coin_id, interval
      ORDER BY cnt DESC
      LIMIT 50
    `);

    return result.rows.map(row => ({
      coinId: String(row.coin_id),
      interval: String(row.interval),
      count: Number(row.cnt),
      oldest: Number(row.oldest),
      newest: Number(row.newest),
    }));
  } catch {
    return [];
  }
}