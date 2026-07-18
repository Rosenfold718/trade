# Task 2 — Prisma Schema & Database Layer

## Summary
Created a comprehensive Prisma schema and database access layer to migrate the crypto trading system from JSON file storage to SQLite via Prisma.

## Files Created/Modified

### 1. `prisma/schema.prisma` — Full rewrite
- **TraderState** — Singleton model with all trader fields + flattened adaptive parameters (9 fields). Uses `@id @default("singleton")`.
- **Trade** — 35 fields including new trailing stop (trailingStop, trailingStopPrice, trailingStepPct) and partial exits (JSON string). Indexes on coinId, direction, resolved, result, timestamp.
- **DepositSnapshot** — timestamp, balance, equity. Indexed on timestamp.
- **DebtEntry** — timestamp, amount, remainingOwed, label. Indexed on timestamp.
- **Lesson** — Adaptive learning entries with type, description, coinId, direction, value, tradeId, severity. Indexes on coinId, type, timestamp, tradeId.
- **Thought** — Trader thinking log with 15 fields. Indexes on type, timestamp, coinId, tradeId.
- **TradeAuditLog** — Structured audit logging with action, details (JSON), coinId, tradeId. Indexes on action, timestamp, coinId, tradeId.

**Key decisions:**
- All timestamps use `BigInt` (not `Int`) to handle Unix millisecond values that exceed 32-bit INT range (~1.78 trillion).
- JSON arrays (reasons, avoidCoins, tags, marketEntryConditions, partialExits) stored as `String` with `JSON.parse`/`JSON.stringify` in the access layer.
- Removed old `User` and `Post` models from the default template.

### 2. `src/lib/db.ts` — No changes needed
Existing Prisma client singleton with globalThis caching was already correct.

### 3. `src/lib/trading-db.ts` — New file (~480 lines)
Complete database access layer with:

| Function | Purpose |
|---|---|
| `getTraderState()` | Get or create default singleton trader state |
| `updateTraderState(updates)` | Partial update of trader state |
| `createTrade(trade)` | Create trade with full field support |
| `getTrades(filters?)` | Query trades with coinId/direction/resolved/result/entryType filters |
| `getOpenTrades()` | Get all unresolved trades |
| `getResolvedTrades(limit, offset)` | Paginated resolved trades |
| `updateTrade(id, updates)` | Partial trade update with auto BigInt conversion |
| `deleteTrade(id)` | Delete trade by ID |
| `addLesson(lesson)` | Create adaptive learning lesson |
| `getLessons(limit?)` | Get recent lessons |
| `addThought(thought)` | Create thinking log entry |
| `getThoughts(limit, offset)` | Paginated thoughts |
| `addAuditLog(action, details, coinId?, tradeId?)` | Create structured audit log |
| `getAuditLogs(limit, offset)` | Paginated audit logs |
| `addDepositSnapshot(snapshot)` | Record balance/equity snapshot |
| `getDepositSnapshots()` | All snapshots ordered by timestamp |
| `addDebtEntry(entry)` | Record debt entry |
| `getDebtEntries()` | All debt entries |
| `updateAdaptiveParams(updates)` | Partial adaptive param update |
| `getAdaptiveParams()` | Get adaptive params with parsed JSON arrays |
| `getTradingStats()` | Compute winRate, avgPnl, Sharpe, Sortino, maxDrawdown, profitFactor, Calmar, expectancy, streaks |
| `migrateFromJson()` | One-time migration from trader-data.json + trader-thinking.json |

**Stats computation includes:**
- Sharpe ratio (annualized, ~6 trades/day * 365 = 2190 periods/year)
- Sortino ratio (downside deviation only)
- Calmar ratio (annualized return / max drawdown)
- Profit factor (gross profits / gross losses)
- Expectancy per trade
- Max consecutive win/loss streaks

**Migration verified:** Successfully migrated 3 trades, 46 thoughts, 2 deposit snapshots, 7 avoidCoins from existing JSON files.

## Verification
- `bun run db:push` — ✅ Schema applied successfully
- All 14 functions tested with comprehensive integration test — ✅ ALL TESTS PASSED
- `eslint src/lib/trading-db.ts src/lib/db.ts` — ✅ No errors