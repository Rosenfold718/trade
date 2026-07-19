/**
 * audit.ts — Structured audit trail integration.
 *
 * Wraps addAuditLog from trading-db with typed actions and convenience helpers.
 * All calls are fire-and-forget (errors logged to console, never thrown).
 */

import { addAuditLog } from './trading-db';

// ─── Action types ──────────────────────────────────────────────────────────────

export type AuditAction =
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'TRADE_CANCELLED'
  | 'SCAN_STARTED'
  | 'SCAN_COMPLETED'
  | 'SCAN_FAILED'
  | 'SIGNAL_GENERATED'
  | 'BACKTEST_STARTED'
  | 'BACKTEST_COMPLETED'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'RISK_ALERT'
  | 'DRAWDOWN_WARNING'
  | 'MAX_DRAWDOWN_STOPPED'
  | 'ADAPTIVE_RULE_CHANGE'
  | 'LESSON_LEARNED'
  | 'SYSTEM_START'
  | 'SYSTEM_ERROR';

// ─── Core helper ───────────────────────────────────────────────────────────────

export async function audit(
  action: AuditAction,
  details: Record<string, unknown>,
  coinId?: string,
  tradeId?: string,
): Promise<void> {
  try {
    await addAuditLog(action, details, coinId, tradeId);
  } catch (e) {
    console.error('Audit log failed:', e);
  }
}

// ─── Convenience functions ────────────────────────────────────────────────────

export function auditTradeOpened(trade: {
  id: string;
  coinId: string;
  coinSymbol: string;
  direction: string;
  entryType: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  confidence: number;
  leverage: number;
  positionSize: number;
  quantity: number;
  autoTrade?: boolean;
}) {
  return audit('TRADE_OPENED', {
    coinSymbol: trade.coinSymbol,
    direction: trade.direction,
    entryType: trade.entryType,
    entry: trade.entry,
    stopLoss: trade.stopLoss,
    takeProfit1: trade.takeProfit1,
    confidence: trade.confidence,
    leverage: trade.leverage,
    positionSize: trade.positionSize,
    quantity: trade.quantity,
    autoTrade: trade.autoTrade ?? false,
  }, trade.coinId, trade.id);
}

export function auditTradeClosed(
  trade: {
    id: string;
    coinId: string;
    coinSymbol: string;
    direction: string;
    result: string | null;
    exitReason: string | null;
    entry: number;
    exitPrice: number | null;
    pnlUSDT: number | null;
  },
  pnl: number,
) {
  return audit('TRADE_CLOSED', {
    coinSymbol: trade.coinSymbol,
    direction: trade.direction,
    result: trade.result,
    exitReason: trade.exitReason,
    entry: trade.entry,
    exitPrice: trade.exitPrice,
    pnlUSDT: pnl,
  }, trade.coinId, trade.id);
}

export function auditTradeCancelled(
  trade: {
    id: string;
    coinId: string;
    coinSymbol: string;
    direction: string;
    positionSize: number;
  },
  refund: number,
) {
  return audit('TRADE_CANCELLED', {
    coinSymbol: trade.coinSymbol,
    direction: trade.direction,
    positionSize: trade.positionSize,
    refund,
  }, trade.coinId, trade.id);
}

export function auditScanCompleted(opportunities: number, tradesOpened: number, scannedCoins: number) {
  return audit('SCAN_COMPLETED', {
    opportunities,
    tradesOpened,
    scannedCoins,
  });
}

export function auditScanFailed(error: string) {
  return audit('SCAN_FAILED', { error });
}

export function auditRiskAlert(message: string, data: Record<string, unknown>) {
  return audit('RISK_ALERT', { message, ...data });
}

export function auditDrawdownWarning(currentPct: number, maxPct: number) {
  return audit('DRAWDOWN_WARNING', { currentDrawdownPct: currentPct, maxDrawdownPct: maxPct });
}

export function auditLessonLearned(lessonType: string, description: string, coinId?: string, tradeId?: string) {
  return audit('LESSON_LEARNED', { lessonType, description }, coinId, tradeId);
}