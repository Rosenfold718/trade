import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ log: ['error'] });

async function migrate() {
  console.log('=== Migration: JSON → SQLite ===\n');

  const fs = await import('fs');
  const path = await import('path');
  const traderDataPath = path.join(process.cwd(), 'trader-data.json');

  if (!fs.existsSync(traderDataPath)) {
    console.log('trader-data.json not found, skipping.');
    return;
  }

  const traderData = JSON.parse(fs.readFileSync(traderDataPath, 'utf-8'));
  const a = traderData.adaptive || {};

  // Check if already migrated
  const existing = await db.traderState.findUnique({ where: { id: 'singleton' } });
  if (existing && existing.totalTrades > 0) {
    console.log('Already migrated, skipping.');
    return;
  }

  // Use a transaction for speed
  await db.$transaction(async (tx) => {
    // Upsert TraderState
    await tx.traderState.upsert({
      where: { id: 'singleton' },
      update: {
        initialDeposit: traderData.initialDeposit ?? 100,
        balance: traderData.balance ?? 100,
        totalTrades: traderData.totalTrades ?? 0,
        wins: traderData.wins ?? 0, losses: traderData.losses ?? 0, expired: traderData.expired ?? 0,
        score: traderData.score ?? 0, winRate: traderData.winRate ?? 0, avgPnl: traderData.avgPnl ?? 0,
        streak: traderData.streak ?? 0, bestTrade: traderData.bestTrade ?? 0, worstTrade: traderData.worstTrade ?? 0,
        totalPnl: traderData.totalPnl ?? 0,
        level: traderData.level || 'Новичок', levelEmoji: traderData.levelEmoji || '🌱',
        riskPerTrade: traderData.riskPerTrade ?? 5, defaultLeverage: traderData.defaultLeverage ?? 3,
        totalDebt: traderData.totalDebt ?? 0, totalRepaid: traderData.totalRepaid ?? 0,
        lastUpdated: BigInt(traderData.lastUpdated || 0),
        adaptiveMinSlDistancePct: a.minSlDistancePct ?? 1, adaptiveMinConfidence: a.minConfidence ?? 60,
        adaptiveAvoidCoins: JSON.stringify(a.avoidCoins ?? []),
        adaptiveMinRr: a.minRr ?? 1.5, adaptiveCounterTrendPenalty: a.counterTrendPenalty ?? 0.1,
        adaptiveLimitExpiryHours: a.limitExpiryHours ?? 2,
        adaptiveMarketEntryConditions: JSON.stringify(a.marketEntryConditions ?? []),
        adaptiveLessonsVersion: a.lessonsVersion ?? 0,
      },
      create: {
        id: 'singleton', initialDeposit: traderData.initialDeposit ?? 100, balance: traderData.balance ?? 100,
        totalTrades: traderData.totalTrades ?? 0, wins: traderData.wins ?? 0, losses: traderData.losses ?? 0,
        expired: traderData.expired ?? 0, score: traderData.score ?? 0,
        winRate: traderData.winRate ?? 0, avgPnl: traderData.avgPnl ?? 0,
        streak: traderData.streak ?? 0, bestTrade: traderData.bestTrade ?? 0, worstTrade: traderData.worstTrade ?? 0,
        totalPnl: traderData.totalPnl ?? 0,
        level: traderData.level || 'Новичок', levelEmoji: traderData.levelEmoji || '🌱',
        riskPerTrade: traderData.riskPerTrade ?? 5, defaultLeverage: traderData.defaultLeverage ?? 3,
        totalDebt: traderData.totalDebt ?? 0, totalRepaid: traderData.totalRepaid ?? 0,
        lastUpdated: BigInt(traderData.lastUpdated || 0),
        adaptiveMinSlDistancePct: a.minSlDistancePct ?? 1, adaptiveMinConfidence: a.minConfidence ?? 60,
        adaptiveAvoidCoins: JSON.stringify(a.avoidCoins ?? []),
        adaptiveMinRr: a.minRr ?? 1.5, adaptiveCounterTrendPenalty: a.counterTrendPenalty ?? 0.1,
        adaptiveLimitExpiryHours: a.limitExpiryHours ?? 2,
        adaptiveMarketEntryConditions: JSON.stringify(a.marketEntryConditions ?? []),
        adaptiveLessonsVersion: a.lessonsVersion ?? 0,
      },
    });
    console.log('  TraderState: OK');

    // Migrate 1 trade
    if (traderData.trades && Array.isArray(traderData.trades)) {
      for (const t of traderData.trades) {
        try {
          await tx.trade.create({
            data: {
              id: t.id, coinId: t.coinId, coinSymbol: t.coinSymbol, direction: t.direction,
              entryType: t.entryType, entry: t.entry, currentPrice: t.currentPrice,
              stopLoss: t.stopLoss, takeProfit1: t.takeProfit1 ?? null,
              takeProfit2: t.takeProfit2 ?? null, takeProfit3: t.takeProfit3 ?? null,
              confidence: t.confidence, timeframe: t.timeframe, entryReason: t.entryReason,
              reasons: JSON.stringify(t.reasons || []), leverage: t.leverage,
              positionSize: t.positionSize, quantity: t.quantity,
              timestamp: BigInt(t.timestamp), entryReached: t.entryReached ?? false,
              enteredAt: t.enteredAt ? BigInt(t.enteredAt) : null,
              resolved: t.resolved ?? false, result: t.result ?? null,
              exitPrice: t.exitPrice ?? null, exitReason: t.exitReason ?? null,
              closedAt: t.closedAt ? BigInt(t.closedAt) : null,
              pnlUSDT: t.pnlUSDT ?? null, pnlPct: t.pnlPct ?? null,
              pointsChange: t.pointsChange ?? null,
              trailingStop: t.trailingStop ?? false, trailingStopPrice: t.trailingStopPrice ?? null,
              trailingStepPct: t.trailingStepPct ?? null, partialExits: t.partialExits || '[]',
            },
          });
          console.log(`  Trade ${t.id}: OK`);
        } catch (e: any) {
          console.error(`  Trade ${t.id}: SKIP (${e.code})`);
        }
      }
    }

    // Migrate Snapshots
    if (traderData.depositHistory && Array.isArray(traderData.depositHistory)) {
      for (const snap of traderData.depositHistory) {
        await tx.depositSnapshot.create({
          data: { timestamp: BigInt(snap.timestamp), balance: snap.balance, equity: snap.equity },
        });
      }
      console.log('  Snapshots: OK');
    }

    // Migrate Debts
    if (traderData.debtHistory && Array.isArray(traderData.debtHistory)) {
      for (const d of traderData.debtHistory) {
        await tx.debtEntry.create({
          data: { timestamp: BigInt(d.timestamp), amount: d.amount, remainingOwed: d.remainingOwed ?? d.amount, label: d.label ?? '' },
        });
      }
      console.log('  Debts: OK');
    }

    // Migrate Thoughts
    const thoughtPath = path.join(process.cwd(), 'trader-thinking.json');
    if (fs.existsSync(thoughtPath)) {
      const thoughtData = JSON.parse(fs.readFileSync(thoughtPath, 'utf-8'));
      if (thoughtData.thoughts && Array.isArray(thoughtData.thoughts)) {
        for (const t of thoughtData.thoughts) {
          try {
            await tx.thought.create({
              data: {
                id: t.id, timestamp: BigInt(t.timestamp), type: t.type,
                title: t.title, detail: t.detail,
                coinSymbol: t.coinSymbol ?? null, coinId: t.coinId ?? null,
                direction: t.direction ?? null, confidence: t.confidence ?? null,
                score: t.score ?? null, tradeId: t.tradeId ?? null,
                pnl: t.pnl ?? null, entryType: t.entryType ?? null,
                emotion: t.emotion || 'neutral', tags: JSON.stringify(t.tags || []),
              },
            });
          } catch (e: any) {
            console.error(`  Thought ${t.id}: SKIP (${e.code})`);
          }
        }
        console.log('  Thoughts: OK');
      }
    }
  });

  console.log('\n=== Migration complete ===');
}

migrate().catch(console.error);