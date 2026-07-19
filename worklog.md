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
