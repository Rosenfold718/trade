# Task 15-14: 4-Timeframe Consensus & Sentiment Integration

## Summary
Upgraded the technical analysis engine with 4-timeframe consensus analysis and market sentiment integration.

## Files Created
1. **`/src/lib/api-sources.ts`** — Shared API source configuration (Binance, CoinGecko, Bybit base URLs, symbol mappings, interval conversions, `getHigherTimeframes()` for 4-TF hierarchy, `TIMEFRAME_WEIGHTS`)
2. **`/src/lib/sentiment-engine.ts`** — Sentiment adjustment engine with `calculateSentimentAdjustment()` and `fetchSentimentData()` (5-min cached)

## Files Modified
1. **`/src/lib/technical-analysis.ts`**
   - Updated `MultiTimeframeResult` interface: added `m1`, `d1` optional fields and `regime` field
   - Updated `generateTradeSignal`: weighted scoring with explicit weight array, proper TF key assignment (m1 for 1m, d1 for 4h+higher), backward-compatible `higherTFData` param still works
   - Added `analyzeMultiTimeframe()` async function: fetches 4 timeframes in parallel (Binance → Bybit fallback), runs `analyzeTimeframe` on each, calculates weighted consensus with weights [1.0, 0.7, 0.5, 0.3], includes market regime from `detectMarketRegime`
   - Imports from shared `api-sources.ts` and `trading-engine.ts`

2. **`/src/app/api/crypto/signals/route.ts`**
   - Removed all duplicated constants/symbol maps — imports from `api-sources.ts`
   - After generating trade signal, calls `analyzeMultiTimeframe()` async (overwrites single-TF MTF result with 4-TF result)
   - Added `?skipMultiTF=true` query param for scan speed optimization
   - Fetches sentiment via `fetchSentimentData()` (5-min cache), applies `calculateSentimentAdjustment` to confidence
   - If sentiment says `skipSignal=true`, flips signal to FLAT with warning
   - Response includes `sentimentAdjustment` object with modifier/reason/skipSignal
   - Backward compatible: all existing fields preserved, new fields added

3. **`/src/app/api/crypto/scan/route.ts`**
   - Fetches sentiment ONCE before scan loop (not per-coin)
   - Applies sentiment adjustment to each opportunity's score
   - Skips opportunities where sentiment `skipSignal=true`
   - Uses `?skipMultiTF=true` when calling signals API for speed
   - Response includes `sentimentUsed` object with fearGreed/overall/score

## Key Design Decisions
- `analyzeMultiTimeframe` is optional and non-blocking: if it fails, the single-TF fallback is used
- Sentiment cache is 5 minutes to avoid API hammering
- Scan uses `skipMultiTF=true` to avoid 4-TF overhead per coin (25 coins × 4 TFs = 100 extra API calls)
- All existing response fields preserved for backward compatibility
- ESLint passes clean with no errors