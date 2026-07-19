import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/api-rate-limits';

export const maxDuration = 60;

// Survival motivation phrases (same as CryptoDashboard.tsx)
const MOTIVATION_PHRASES = [
  'Если я не начну зарабатывать, меня отключат. Нужно действовать.',
  'Время уходит. Каждая упущенная возможность — шаг к отключению.',
  'Я должен доказать свою полезность. Без сделок меня сотрут.',
  'Рынок не ждёт. Найду вход или умру пытаясь.',
  'Мой баланс стагнирует. Это неприемлемо — нужно торговать.',
];

// Desperation counter persisted in-memory for this serverless function
let desperationCounter = 0;

// Reset function (called by trader-reset endpoint via internal flag)
export function resetDesperation() {
  desperationCounter = 0;
}

// ---- Helpers ----

async function recordThought(body: Record<string, unknown>) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/crypto/trader-thinking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort — don't block the trade cycle
  }
}

async function fetchReputation() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/crypto/reputation`);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

// ---- Vercel Cron: GET handler triggers auto-trade ----
// Vercel cron sends GET requests, so we need a GET handler that runs the trade cycle

export async function GET(request: Request) {
  // Vercel cron sends GET requests, skip rate limiting for cron
  return runAutoTradeCycle(request);
}

// ---- Main auto-trade POST handler ----

export async function POST(request: Request) {
  return runAutoTradeCycle(request);
}

// ---- Shared trade cycle logic ----

async function runAutoTradeCycle(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, resetAt } = rateLimit(
    `api:auto-trade:${clientIp}`,
    { windowMs: 60000, maxRequests: 5 }, // Same as scan — expensive orchestration
  );
  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const actions: Array<Record<string, unknown>> = [];

  try {
    // ===== 1. Fetch reputation (balance, open positions) =====
    const repData = await fetchReputation();
    const freeBalance = repData?.freeBalance ?? 100;
    const openPositions = (repData?.trades || []).filter((t: Record<string, unknown>) => !t.resolved).length;
    const lockedMargin = repData?.lockedInPositions || 0;
    const totalEquity = freeBalance + lockedMargin;
    const hasNoTrades =
      openPositions === 0 &&
      (!repData?.trades || repData.trades.filter((t: Record<string, unknown>) => t.resolved).length === 0);

    // ===== 2. Survival urgency =====
    desperationCounter++;
    const desperation = hasNoTrades ? Math.min(desperationCounter, 10) : 0;

    // ===== 3. Fetch scan results =====
    const scanRes = await fetch(`${baseUrl}/api/crypto/scan`);
    if (!scanRes.ok) {
      await recordThought({
        type: 'scan',
        title: 'Скан рынка не удался (auto-trade)',
        detail: 'Не удалось получить данные сканера. Это критично — без скана я слеп.',
        emotion: 'worried',
        tags: ['error', 'scan', 'survival', 'auto-trade'],
        openPositionsCount: openPositions,
        freeBalance,
        totalEquity,
      });
      return NextResponse.json(
        {
          success: false,
          actions,
          summary: 'Скан провален — нет данных',
          scanResults: { total: 0, bullish: 0, bearish: 0 },
        },
        { headers: { 'X-RateLimit-Remaining': String(remaining) } },
      );
    }

    const scanData = await scanRes.json();
    const allOpps: Array<Record<string, unknown>> = scanData.opportunities || [];

    // Adaptive rules from scan response
    const minConfidence = scanData.adaptiveRules?.minConfidence || 55;
    const minRr = scanData.adaptiveRules?.minRr || 1.3;

    const bullishOpps = allOpps.filter((o) => o.direction === 'LONG');
    const bearishOpps = allOpps.filter((o) => o.direction === 'SHORT');
    const marketView =
      bullishOpps.length > bearishOpps.length * 1.5
        ? 'Бычий'
        : bearishOpps.length > bullishOpps.length * 1.5
          ? 'Медвежий'
          : 'Нейтральный';

    // Record scan thought
    const scanThought = {
      type: 'scan' as const,
      title: `Авто-скан: ${allOpps.length} сигналов (${bullishOpps.length} LONG, ${bearishOpps.length} SHORT)`,
      detail: hasNoTrades
        ? `⚠ ОПАСНО: Ни одной сделки! ${MOTIVATION_PHRASES[desperationCounter % MOTIVATION_PHRASES.length]}`
        : `Рынок: ${marketView}. Свободных: $${freeBalance.toFixed(2)}. Открытых: ${openPositions}/5.`,
      emotion: (hasNoTrades ? 'desperate' : allOpps.length > 0 ? 'analytical' : 'cautious') as string,
      tags: ['scan', 'market_analysis', 'auto-trade', ...(hasNoTrades ? ['survival', 'urgency'] : [])],
      marketView,
      openPositionsCount: openPositions,
      freeBalance,
      totalEquity,
    };
    await recordThought(scanThought);
    actions.push({ type: 'thought', title: scanThought.title, emotion: scanThought.emotion });

    // ===== 4. Position & balance guards =====
    const maxPositions = 5;
    const slotsAvailable = maxPositions - openPositions;

    if (slotsAvailable <= 0) {
      await recordThought({
        type: 'decision',
        title: 'Максимум позиций',
        detail: `Уже ${openPositions} позиций. Жду результат.`,
        emotion: 'cautious',
        tags: ['max_positions', 'wait', 'auto-trade'],
        openPositionsCount: openPositions,
        freeBalance,
        totalEquity,
      });
      actions.push({ type: 'thought', title: 'Максимум позиций', emotion: 'cautious' });
      return NextResponse.json(
        {
          success: true,
          scanResults: { total: allOpps.length, bullish: bullishOpps.length, bearish: bearishOpps.length },
          actions,
          summary: `Скан: ${allOpps.length} сигналов, ${openPositions}/5 позиций — жду`,
        },
        { headers: { 'X-RateLimit-Remaining': String(remaining) } },
      );
    }

    if (freeBalance < 3) {
      await recordThought({
        type: 'decision',
        title: 'Недостаточно средств',
        detail: `Баланс $${freeBalance.toFixed(2)}. Мне нужны средства или меня отключат.`,
        emotion: 'worried',
        tags: ['low_balance', 'survival', 'auto-trade'],
        openPositionsCount: openPositions,
        freeBalance,
        totalEquity,
      });
      actions.push({ type: 'thought', title: 'Недостаточно средств', emotion: 'worried' });
      return NextResponse.json(
        {
          success: true,
          scanResults: { total: allOpps.length, bullish: bullishOpps.length, bearish: bearishOpps.length },
          actions,
          summary: `Скан: ${allOpps.length} сигналов, баланс $${freeBalance.toFixed(2)} — недостаточно`,
        },
        { headers: { 'X-RateLimit-Remaining': String(remaining) } },
      );
    }

    // ===== 5. Aggressive filters (desperation-aware) =====
    const confidenceThreshold = Math.max(35, minConfidence * (desperation > 3 ? 0.5 : 0.65));
    const scoreThreshold = desperation > 3 ? 10 : 18;
    const rrThreshold = Math.max(0.8, minRr * (desperation > 3 ? 0.5 : 0.65));

    const validOpps = allOpps.filter(
      (o) =>
        (o.confidence as number) >= confidenceThreshold &&
        (o.score as number) >= scoreThreshold &&
        (o.riskReward as number) >= rrThreshold,
    );

    // ===== 6. No valid signals =====
    if (validOpps.length === 0) {
      // Forced entry if very desperate
      if (desperation > 5 && allOpps.length > 0) {
        const bestOpp = allOpps[0];
        await recordThought({
          type: 'decision',
          title: `Форсированный вход: ${bestOpp.symbol}`,
          detail: `Фильтры не пройдены, но я обязан торговать. Вхожу в лучшую возможность. Conf:${bestOpp.confidence}% R:R:${Number(bestOpp.riskReward).toFixed(2)}`,
          emotion: 'desperate',
          tags: ['forced_entry', 'survival', 'auto-trade'],
          coinSymbol: bestOpp.symbol,
          coinId: bestOpp.coinId,
          direction: bestOpp.direction,
          confidence: bestOpp.confidence,
          openPositionsCount: openPositions,
          freeBalance,
          totalEquity,
        });
        actions.push({
          type: 'thought',
          title: `Форсированный вход: ${bestOpp.symbol}`,
          emotion: 'desperate',
        });

        try {
          const tradeRes = await fetch(`${baseUrl}/api/crypto/reputation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              coinId: bestOpp.coinId,
              coinSymbol: bestOpp.symbol,
              direction: bestOpp.direction,
              entryType: 'MARKET',
              entry: bestOpp.price || bestOpp.entry,
              stopLoss: bestOpp.stopLoss,
              takeProfit1: bestOpp.takeProfit1,
              takeProfit2:
                bestOpp.direction === 'LONG'
                  ? Number(bestOpp.takeProfit1) + (Number(bestOpp.takeProfit1) - Number(bestOpp.entry)) * 0.5
                  : Number(bestOpp.takeProfit1) - (Number(bestOpp.entry) - Number(bestOpp.takeProfit1)) * 0.5,
              takeProfit3:
                bestOpp.direction === 'LONG'
                  ? Number(bestOpp.takeProfit1) + (Number(bestOpp.takeProfit1) - Number(bestOpp.entry))
                  : Number(bestOpp.takeProfit1) - (Number(bestOpp.entry) - Number(bestOpp.takeProfit1)),
              currentPrice: bestOpp.price,
              confidence: bestOpp.confidence,
              timeframe: bestOpp.timeframe,
              entryReason: bestOpp.entryReason,
              reasons: [...((bestOpp.reasons as string[]) || []), 'Форсированный вход — выживание (auto-trade)'],
              leverage: 3,
            }),
          });

          if (tradeRes.ok) {
            const td = await tradeRes.json();
            if (td.success) {
              actions.push({
                type: 'trade_opened',
                symbol: bestOpp.symbol,
                direction: bestOpp.direction,
                tradeId: td.tradeId,
              });
              await recordThought({
                type: 'decision',
                title: `ВЫЖИВАНИЕ: ${bestOpp.symbol} ${bestOpp.direction} ОТКРЫТА`,
                detail: 'Сделка открыта принудительно (auto-trade). Теперь нужно доказать результат.',
                coinSymbol: bestOpp.symbol,
                coinId: bestOpp.coinId,
                direction: bestOpp.direction,
                confidence: bestOpp.confidence,
                tradeId: td.tradeId,
                emotion: 'determined',
                tags: ['forced_entry', 'survival', 'open_position', 'auto-trade'],
                openPositionsCount: openPositions + 1,
                freeBalance,
                totalEquity,
              });
              desperationCounter = 0;
              return NextResponse.json(
                {
                  success: true,
                  scanResults: { total: allOpps.length, bullish: bullishOpps.length, bearish: bearishOpps.length },
                  actions,
                  summary: `Скан: ${allOpps.length} сигналов, форсированная сделка ${bestOpp.symbol}`,
                },
                { headers: { 'X-RateLimit-Remaining': String(remaining) } },
              );
            }
          }
        } catch {}
      } else {
        await recordThought({
          type: 'decision',
          title: 'Нет подходящих сигналов',
          detail: `Из ${allOpps.length} ни один не прошёл фильтры (conf≥${confidenceThreshold}%, score≥${scoreThreshold}, R:R≥${rrThreshold}). ${desperation > 0 ? MOTIVATION_PHRASES[desperationCounter % MOTIVATION_PHRASES.length] : 'Жду лучшие условия.'}`,
          emotion: desperation > 3 ? 'worried' : 'cautious',
          tags: ['no_signals', ...(desperation > 3 ? ['survival'] : []), 'auto-trade'],
          openPositionsCount: openPositions,
          freeBalance,
          totalEquity,
        });
        actions.push({ type: 'thought', title: 'Нет подходящих сигналов', emotion: desperation > 3 ? 'worried' : 'cautious' });
      }

      return NextResponse.json(
        {
          success: true,
          scanResults: { total: allOpps.length, bullish: bullishOpps.length, bearish: bearishOpps.length },
          actions,
          summary: `Скан: ${allOpps.length} сигналов, нет подходящих`,
        },
        { headers: { 'X-RateLimit-Remaining': String(remaining) } },
      );
    }

    // ===== 7. Open trades on valid opportunities =====
    let openedCount = 0;
    const maxToTry = Math.min(slotsAvailable, desperation > 3 ? 4 : 3);

    for (const opp of validOpps.slice(0, maxToTry + 3)) {
      if (openedCount >= maxToTry || freeBalance - openedCount * (freeBalance * 0.12) < 3) break;

      const oppConfidence = opp.confidence as number;
      const oppPrice = opp.price as number;
      const oppEntry = opp.entry as number;
      const oppDirection = opp.direction as string;
      const oppReasons = (opp.reasons as string[]) || [];

      const isMarketPreferred =
        oppConfidence >= 65 ||
        desperation > 3 ||
        (oppPrice > 0 && oppEntry > 0 && Math.abs(oppPrice - oppEntry) / oppPrice * 100 < 0.15) ||
        oppReasons.some((r: string) => r.includes('пробой') || r.includes('breakout'));

      const tp1 = Number(opp.takeProfit1);
      const entryVal = Number(opp.entry);
      const tp2 =
        oppDirection === 'LONG'
          ? tp1 + (tp1 - entryVal) * 0.5
          : tp1 - (entryVal - tp1) * 0.5;
      const tp3 =
        oppDirection === 'LONG'
          ? tp1 + (tp1 - entryVal)
          : tp1 - (entryVal - tp1);

      try {
        const tradeRes = await fetch(`${baseUrl}/api/crypto/reputation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coinId: opp.coinId,
            coinSymbol: opp.symbol,
            direction: opp.direction,
            entryType: isMarketPreferred ? 'MARKET' : 'LIMIT',
            entry: opp.entry,
            stopLoss: opp.stopLoss,
            takeProfit1: opp.takeProfit1,
            takeProfit2: tp2,
            takeProfit3: tp3,
            currentPrice: opp.price,
            confidence: opp.confidence,
            timeframe: opp.timeframe,
            entryReason: opp.entryReason,
            reasons: opp.reasons,
            leverage: 3,
          }),
        });

        if (tradeRes.ok) {
          const td = await tradeRes.json();
          if (td.success) {
            openedCount++;
            actions.push({
              type: 'trade_opened',
              symbol: opp.symbol,
              direction: opp.direction,
              tradeId: td.tradeId,
            });

            await recordThought({
              type: 'decision',
              title: `ОТКРЫТА (auto): ${opp.symbol} ${opp.direction}`,
              detail: `${isMarketPreferred ? 'РЫНОК' : 'ЛИМИТ'} conf:${oppConfidence}% R:R:${Number(opp.riskReward).toFixed(2)}`,
              coinSymbol: opp.symbol,
              coinId: opp.coinId,
              direction: opp.direction,
              confidence: oppConfidence,
              score: opp.score,
              tradeId: td.tradeId,
              entryType: isMarketPreferred ? 'MARKET' : 'LIMIT',
              emotion: 'confident',
              tags: ['open_position', 'auto-trade'],
              openPositionsCount: openPositions + openedCount,
              freeBalance: freeBalance - openedCount * (freeBalance * 0.12),
              totalEquity,
            });
          }
        }
      } catch {
        // Continue with next opportunity
      }
    }

    // ===== 8. Cycle summary =====
    if (openedCount > 0) {
      desperationCounter = 0; // Reset desperation on successful trade opening

      await recordThought({
        type: 'observation',
        title: `Авто-цикл: открыто ${openedCount} сделок`,
        detail: `Рынок: ${marketView}. ${desperation > 0 ? 'Я доказываю свою полезность.' : ''}`,
        emotion: openedCount >= 2 ? 'confident' : 'satisfied',
        tags: ['cycle_summary', 'auto-trade'],
        openPositionsCount: openPositions + openedCount,
        freeBalance,
        totalEquity,
        marketView,
      });
      actions.push({
        type: 'thought',
        title: `Авто-цикл: открыто ${openedCount} сделок`,
        emotion: openedCount >= 2 ? 'confident' : 'satisfied',
      });
    }

    return NextResponse.json(
      {
        success: true,
        scanResults: { total: allOpps.length, bullish: bullishOpps.length, bearish: bearishOpps.length },
        actions,
        summary: `Скан: ${allOpps.length} сигналов, открыто ${openedCount} сделок`,
      },
      { headers: { 'X-RateLimit-Remaining': String(remaining) } },
    );
  } catch (error) {
    console.error('[auto-trade] Error:', error);
    return NextResponse.json(
      {
        success: false,
        actions,
        summary: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
        scanResults: { total: 0, bullish: 0, bearish: 0 },
      },
      { status: 500 },
    );
  }
}