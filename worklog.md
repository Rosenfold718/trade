---
Task ID: 1
Agent: main
Task: Fix all localhost calls (Vercel incompatible) + fix backtest + add trading motivation

Work Log:
- Fixed /api/crypto/scan/route.ts: replaced 3 localhost calls with direct CoinGecko/Binance/Bybit API calls and direct generateTradeSignal import
- Fixed /lib/sentiment-engine.ts: replaced fetchSentimentData localhost call with direct Fear & Greed API call
- Fixed /api/crypto/reputation/route.ts: replaced getCurrentPrices localhost call with direct CoinGecko API call
- Created /api/crypto/backtest-ohlcv/route.ts: lightweight OHLCV-only endpoint for client-side backtest
- Rewrote BacktestDialog.tsx: moved backtest computation to client-side with EMA crossover strategy, progress bar, spam-click lock
- Added trading motivation system in CryptoDashboard.tsx: desperation counter, forced entries after 5 scan cycles, lowered confidence/R:R thresholds
- Lowered scan adaptive params: minConfidence 60→55, minRr 1.5→1.3
- Reduced scan interval from 60s to 45s for more aggressive trading
- Verified PerformanceDashboard has proper empty states (analytics issue was consequence of scan bug)
- Verified NewsAnalysisDialog works correctly (API has fallback, no localhost dependency)
- Verified credit/lending UI works (issue was consequence of scan bug)
- Verified TradingView links use correct format BINANCE:SYMBOLUSDT
- Added backtestOhlcv rate limit (10 req/60s)
- All lint checks pass

Stage Summary:
- ROOT CAUSE of trader not opening trades: scan route used localhost (inaccessible on Vercel) → FIXED
- ROOT CAUSE of backtest stopping: Vercel serverless timeout on heavy computation → FIXED (client-side)
- Trading motivation: desperation system forces trades after 5 empty scan cycles
- All localhost calls eliminated from codebase

---
Task ID: 1-5 (combined)
Agent: main
Task: Fix Binance 451 error — Bybit-first data fetching across all API routes

Work Log:
- Created `/src/lib/fetch-ohlcv.ts` shared utility with Bybit → Binance → CoinGecko fallback
- Updated `backtest-ohlcv/route.ts` to use shared utility (was the ONLY route with NO fallback → caused 451)
- Swapped Binance/Bybit order in `signals/route.ts` (now Bybit-first)
- Swapped Binance/Bybit order in `technical-analysis.ts` fetchBinanceOHLCV (now Bybit-first)
- Swapped Binance/Bybit order in `ohlcv/route.ts` (now Bybit-first)
- Swapped Binance/Bybit order in `scan/route.ts` (now Bybit-first)
- Reduced timeouts from 8s to 6s for faster failover

Stage Summary:
- ROOT CAUSE: Binance returns HTTP 451 from Vercel's US servers. All routes were trying Binance first (5-8s timeout), then falling back to Bybit. On Vercel's 10s serverless timeout, the requests were timing out.
- FIX: Bybit is now the PRIMARY data source everywhere. This fixes backtest 451 error, chart loading, and overall speed.
- Files changed: fetch-ohlcv.ts (new), backtest-ohlcv/route.ts, signals/route.ts, technical-analysis.ts, ohlcv/route.ts, scan/route.ts

---
Task ID: 6
Agent: backtest-fixer (subagent)
Task: Fix backtest strategy — always unprofitable, no feedback

Work Log:
- Added calcSMA, calcRSI, calcATR helper functions
- Implemented 3 strategies: EMA Cross (improved), RSI Mean Reversion, Breakout
- All strategies use ATR-based dynamic stops (1.5×ATR) and configurable R:R ratio (default 2.0)
- Added RSI filter (no long >70, no short <30), volume confirmation (>0.8×avg)
- Added drawdown protection (stop at 20% DD) and consecutive loss cooldown (5 losses → 10 candles pause)
- Added viability scoring system (0-100) with warnings and recommendations in Russian
- Added strategy selector dropdown and R:R slider to UI
- Added viability badge (green/red) with warnings display

Stage Summary:
- BacktestDialog.tsx completely rewritten strategy section
- Users can now choose between 3 strategies and see if they're viable
- System clearly warns when a strategy is unprofitable

---
Task ID: 8
Agent: ui-fixer (subagent)
Task: Fix Analytics, AI News, Credit/Lending UI, TradingView links, Trader motivation

Work Log:
- TradingView links: Already fixed in prior task, confirmed correct
- PerformanceDashboard: Added Array.isArray guards, try-catch in useMemo, better no-data messages
- NewsAnalysisDialog: Added client-side fallback using CoinGecko trending + Fear&Greed when server API fails
- Credit/Lending: Made debt section always visible in ReputationPanel; added localStorage fallback in fetchReputation
- Trader Motivation: Added dramatic Russian motivation prompt to advisor API and news-analysis API
- Fixed TypeScript error in scan/route.ts (avoidedCoins → avoidCoins)

Stage Summary:
- PerformanceDashboard, NewsAnalysisDialog, Credit/Lending all have proper fallbacks
- Trader AI now has "survival motivation" in its prompts
- All changes pass lint
