import { NextResponse } from 'next/server';
import { createRateLimitMiddleware } from '@/lib/rate-limit';
import {
  getTradingStats,
  getTraderState,
  getDepositSnapshots,
  getResolvedTrades,
} from '@/lib/trading-db';

// Rate limit: 30 req / 30s
const rateLimiter = createRateLimitMiddleware({
  windowMs: 30000,
  maxRequests: 30,
});

interface MonthlyBreakdown {
  month: string;       // 'YYYY-MM'
  label: string;       // 'Янв 2025'
  trades: number;
  wins: number;
  losses: number;
  expired: number;
  pnl: number;
  winRate: number;
}

interface DirectionStats {
  direction: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

interface CoinStats {
  coinId: string;
  coinSymbol: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

interface RecentTrend {
  tradeId: string;
  coinSymbol: string;
  direction: string;
  pnl: number;
  timestamp: number;
}

export async function GET(request: Request) {
  // Rate limit check
  const rateLimitResponse = rateLimiter(request, 'performance');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const [stats, state, snapshots, allResolvedTrades] = await Promise.all([
      getTradingStats(),
      getTraderState(),
      getDepositSnapshots(),
      getResolvedTrades(500, 0), // Get up to 500 for analytics
    ]);

    // ── Monthly breakdown ──
    const monthlyMap = new Map<string, {
      trades: number; wins: number; losses: number; expired: number; pnl: number;
    }>();

    for (const trade of allResolvedTrades) {
      if (!trade.closedAt) continue;
      const closedAt = typeof trade.closedAt === 'bigint'
        ? Number(trade.closedAt)
        : trade.closedAt;
      const d = new Date(closedAt);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const existing = monthlyMap.get(monthKey) ?? {
        trades: 0, wins: 0, losses: 0, expired: 0, pnl: 0,
      };
      existing.trades++;
      if (trade.result === 'WIN') existing.wins++;
      else if (trade.result === 'LOSS') existing.losses++;
      else existing.expired++;
      existing.pnl += trade.pnlUSDT ?? 0;

      monthlyMap.set(monthKey, existing);
    }

    const MONTH_NAMES = [
      'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
      'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
    ];

    const monthlyBreakdown: MonthlyBreakdown[] = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6)
      .reverse()
      .map(([key, data]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          month: key,
          label: `${MONTH_NAMES[month - 1]} ${year}`,
          trades: data.trades,
          wins: data.wins,
          losses: data.losses,
          expired: data.expired,
          pnl: Math.round(data.pnl * 100) / 100,
          winRate: data.trades > 0
            ? Math.round((data.wins / data.trades) * 1000) / 10
            : 0,
        };
      });

    // ── Direction breakdown ──
    const dirMap = new Map<string, { total: number; wins: number; losses: number; pnl: number; }>();

    for (const trade of allResolvedTrades) {
      const dir = trade.direction;
      const existing = dirMap.get(dir) ?? { total: 0, wins: 0, losses: 0, pnl: 0 };
      existing.total++;
      if (trade.result === 'WIN') existing.wins++;
      else if (trade.result === 'LOSS') existing.losses++;
      existing.pnl += trade.pnlUSDT ?? 0;
      dirMap.set(dir, existing);
    }

    const directionBreakdown: DirectionStats[] = Array.from(dirMap.entries()).map(
      ([direction, data]) => ({
        direction,
        total: data.total,
        wins: data.wins,
        losses: data.losses,
        winRate: data.total > 0 ? Math.round((data.wins / data.total) * 1000) / 10 : 0,
        totalPnl: Math.round(data.pnl * 100) / 100,
        avgPnl: data.total > 0 ? Math.round((data.pnl / data.total) * 100) / 100 : 0,
      }),
    );

    // ── Coin breakdown (top 5 most traded) ──
    const coinMap = new Map<string, { coinSymbol: string; total: number; wins: number; losses: number; pnl: number; }>();

    for (const trade of allResolvedTrades) {
      const existing = coinMap.get(trade.coinId) ?? {
        coinSymbol: trade.coinSymbol,
        total: 0, wins: 0, losses: 0, pnl: 0,
      };
      existing.total++;
      if (trade.result === 'WIN') existing.wins++;
      else if (trade.result === 'LOSS') existing.losses++;
      existing.pnl += trade.pnlUSDT ?? 0;
      coinMap.set(trade.coinId, existing);
    }

    const coinBreakdown: CoinStats[] = Array.from(coinMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([coinId, data]) => ({
        coinId,
        coinSymbol: data.coinSymbol,
        total: data.total,
        wins: data.wins,
        losses: data.losses,
        winRate: data.total > 0 ? Math.round((data.wins / data.total) * 1000) / 10 : 0,
        totalPnl: Math.round(data.pnl * 100) / 100,
      }));

    // ── Average hold time ──
    let totalHoldMs = 0;
    let holdCount = 0;
    for (const trade of allResolvedTrades) {
      if (trade.enteredAt && trade.closedAt) {
        const enteredAt = typeof trade.enteredAt === 'bigint' ? Number(trade.enteredAt) : trade.enteredAt;
        const closedAt = typeof trade.closedAt === 'bigint' ? Number(trade.closedAt) : trade.closedAt;
        totalHoldMs += closedAt - enteredAt;
        holdCount++;
      }
    }
    const avgHoldHours = holdCount > 0 ? totalHoldMs / holdCount / 3600000 : 0;

    // ── Average P&L per trade ──
    const avgPnlPerTrade = stats.totalTrades > 0
      ? Math.round((stats.totalPnl / stats.totalTrades) * 100) / 100
      : 0;

    // ── Recent trend (last 10 trades) ──
    const recentTrend: RecentTrend[] = allResolvedTrades.slice(0, 10).map(t => ({
      tradeId: t.id,
      coinSymbol: t.coinSymbol,
      direction: t.direction,
      pnl: t.pnlUSDT ?? 0,
      timestamp: typeof t.closedAt === 'bigint' ? Number(t.closedAt) : (t.closedAt ?? 0),
    })).reverse();

    // ── Equity curve data ──
    const equityCurve = snapshots.map(s => ({
      timestamp: typeof s.timestamp === 'bigint' ? Number(s.timestamp) : s.timestamp,
      equity: s.equity,
      balance: s.balance,
    }));

    // ── Total P&L percentage ──
    const totalPnlPct = state.initialDeposit > 0
      ? (stats.totalPnl / state.initialDeposit) * 100
      : 0;

    return NextResponse.json({
      // Key metrics
      totalPnl: stats.totalPnl,
      totalPnlPct: Math.round(totalPnlPct * 100) / 100,
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      sharpeRatio: stats.sharpeRatio,
      maxDrawdown: stats.maxDrawdown,
      totalTrades: stats.totalTrades,

      // Additional stats
      avgWin: stats.avgWin,
      avgLoss: stats.avgLoss,
      expectancy: stats.expectancy,
      calmarRatio: stats.calmarRatio,
      sortinoRatio: stats.sortinoRatio,
      consecutiveWins: stats.consecutiveWins,
      consecutiveLosses: stats.consecutiveLosses,
      bestTrade: stats.bestTrade,
      worstTrade: stats.worstTrade,

      // Initial deposit for reference
      initialDeposit: state.initialDeposit,

      // Sections
      equityCurve,
      monthlyBreakdown,
      directionBreakdown,
      coinBreakdown,
      avgHoldHours: Math.round(avgHoldHours * 100) / 100,
      avgPnlPerTrade,
      recentTrend,
    });
  } catch (error) {
    console.error('[performance] Error:', error);
    return NextResponse.json(
      { error: 'Ошибка загрузки аналитики' },
      { status: 500 },
    );
  }
}