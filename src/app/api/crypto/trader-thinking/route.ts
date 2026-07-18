import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const THINKING_PATH = path.join(process.cwd(), 'trader-thinking.json');

interface Thought {
  id: string;
  timestamp: number;
  type: 'scan' | 'decision' | 'close' | 'adjustment' | 'lesson' | 'observation';
  title: string;
  detail: string;
  coinSymbol?: string;
  coinId?: string;
  direction?: 'LONG' | 'SHORT';
  confidence?: number;
  score?: number;
  tradeId?: string;
  pnl?: number;
  entryType?: 'LIMIT' | 'MARKET';
  emotion: 'neutral' | 'confident' | 'cautious' | 'worried' | 'frustrated' | 'satisfied' | 'analytical';
  tags: string[];
}

interface ThinkingSession {
  thoughts: Thought[];
  currentMood: string;
  activeStrategy: string;
  marketView: string;
  lastScanAt: number | null;
  openPositionsCount: number;
  freeBalance: number;
  totalEquity: number;
}

const DEFAULT_SESSION: ThinkingSession = {
  thoughts: [],
  currentMood: 'Анализ рынка',
  activeStrategy: 'Внутридневная торговля с адаптивным входом',
  marketView: 'Нейтральный',
  lastScanAt: null,
  openPositionsCount: 0,
  freeBalance: 100,
  totalEquity: 100,
};

async function loadThinking(): Promise<ThinkingSession> {
  try {
    if (existsSync(THINKING_PATH)) {
      const raw = await readFile(THINKING_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SESSION, ...parsed, thoughts: parsed.thoughts || [] };
    }
  } catch {}
  return { ...DEFAULT_SESSION };
}

async function saveThinking(session: ThinkingSession) {
  try {
    await writeFile(THINKING_PATH, JSON.stringify(session, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save thinking:', e);
  }
}

// GET: Retrieve trader's thinking log
export async function GET() {
  try {
    const session = await loadThinking();
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load thinking' }, { status: 500 });
  }
}

// POST: Add a new thought
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = await loadThinking();

    const thought: Thought = {
      id: `thought_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      type: body.type || 'observation',
      title: body.title || 'Наблюдение',
      detail: body.detail || '',
      coinSymbol: body.coinSymbol,
      coinId: body.coinId,
      direction: body.direction,
      confidence: body.confidence,
      score: body.score,
      tradeId: body.tradeId,
      pnl: body.pnl,
      entryType: body.entryType,
      emotion: body.emotion || 'neutral',
      tags: body.tags || [],
    };

    session.thoughts.unshift(thought); // Newest first
    session.thoughts = session.thoughts.slice(0, 200); // Keep last 200

    // Update session metadata
    if (body.currentMood) session.currentMood = body.currentMood;
    if (body.marketView) session.marketView = body.marketView;
    if (body.activeStrategy) session.activeStrategy = body.activeStrategy;
    if (body.openPositionsCount !== undefined) session.openPositionsCount = body.openPositionsCount;
    if (body.freeBalance !== undefined) session.freeBalance = body.freeBalance;
    if (body.totalEquity !== undefined) session.totalEquity = body.totalEquity;
    if (body.type === 'scan') session.lastScanAt = Date.now();

    await saveThinking(session);
    return NextResponse.json({ success: true, thought, session });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to record thought' }, { status: 500 });
  }
}

// DELETE: Clear thinking log
export async function DELETE() {
  try {
    await saveThinking({ ...DEFAULT_SESSION });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear thinking' }, { status: 500 });
  }
}
