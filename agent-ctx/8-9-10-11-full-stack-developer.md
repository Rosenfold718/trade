# Task 8-9-10-11: Trading Engine Improvements

## Agent: full-stack-developer

## Summary
Implemented 6 critical trading engine modules and integrated them into the reputation API route.

## Files Created
- `/home/z/my-project/src/lib/trading-engine.ts` — New file with all 6 trading engine modules

## Files Modified
- `/home/z/my-project/src/app/api/crypto/reputation/route.ts` — Integrated trading engine into trade resolution and creation

## Changes Detail

### 1. trading-engine.ts (NEW — 6 modules)
1. **Commission & Slippage Model** — `calculateRealisticPnL()` calculates net PnL after 0.1% per-side commission and 0.05% slippage
2. **Trailing Stop Logic** — `updateTrailingStop()` tracks high/low prices, moves stop to breakeven after activation step, supports ATR-based trailing, never moves stop against direction
3. **Partial Take Profit** — `checkPartialExits()` implements 50/30/20 exit schedule across TP1/TP2/TP3, moves SL to breakeven after TP1, handles all-closed state
4. **Kelly Criterion** — `kellyCriterion()` calculates optimal position fraction from win rate and avg win/loss, caps at 25%, reduces by drawdown
5. **Portfolio Risk Manager** — `checkPortfolioRisk()` checks max positions, correlation, portfolio risk %, adjusts leverage for correlated positions
6. **Market Regime Detector** — `detectMarketRegime()` uses ADX + ATR% + EMA slope to classify TRENDING_UP/DOWN, RANGING, or VOLATILE

### 2. reputation/route.ts (MODIFIED)
- **Trade interface**: Added optional fields `trailingStop`, `trailingStepPct`, `highestPrice`, `lowestPrice`, `partialExits`, `remainingQuantity`
- **calculatePnL()**: Now uses `calculateRealisticPnL()` with commission/slippage deduction
- **resolveTrades()**: Added high/low price tracking, partial exit checks (before TP/SL), trailing stop checks (before TP/SL), full partial exit resolution as WIN
- **POST handler**: Added `checkPortfolioRisk()` gate before trade opening, `kellyCriterion()` position sizing (with fallback to fixed 5% when <10 trades), adjusted leverage from risk manager, drawdown halt at 20%, `engineDecisions` in response with Kelly/risk info, optional `trailingStop`/`trailingStepPct` on new trades

## Lint Status
- All 7 lint errors are pre-existing in `CryptoDashboard.tsx` (LevelLine component defined inside render)
- Zero lint issues in `trading-engine.ts` and `reputation/route.ts`

## Dev Server
- All routes responding correctly (200s in dev log)
- No TypeScript compilation errors