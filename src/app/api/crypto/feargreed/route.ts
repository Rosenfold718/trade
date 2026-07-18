import { NextResponse } from 'next/server';

// Fear & Greed Index from alternative.me
let cachedData: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 300000; // 5 minutes

export async function GET() {
  try {
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      return NextResponse.json(cachedData.data);
    }
    
    const response = await fetch('https://api.alternative.me/fng/?limit=7', {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      // Return default values if API fails
      return NextResponse.json({
        current: { value: 50, classification: 'Neutral' },
        history: [],
        source: 'fallback'
      });
    }
    
    const data = await response.json();
    
    const current = data.data?.[0] ? {
      value: parseInt(data.data[0].value),
      classification: data.data[0].value_classification,
      timestamp: data.data[0].timestamp,
    } : { value: 50, classification: 'Neutral' };
    
    const history = (data.data || []).slice(0, 7).map((item: any) => ({
      value: parseInt(item.value),
      classification: item.value_classification,
      date: new Date(parseInt(item.timestamp) * 1000).toLocaleDateString('ru-RU'),
    }));
    
    const result = { current, history, source: 'alternative.me' };
    cachedData = { data: result, timestamp: Date.now() };
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Fear & Greed API error:', error);
    return NextResponse.json({
      current: { value: 50, classification: 'Neutral' },
      history: [],
      source: 'fallback'
    });
  }
}
