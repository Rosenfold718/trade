import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 },
    });
    
    if (!response.ok) {
      return NextResponse.json({ data: [], source: 'none' });
    }
    
    const data = await response.json();
    
    const trending = (data.coins || []).map((item: any) => ({
      id: item.item?.id,
      symbol: item.item?.symbol?.toUpperCase(),
      name: item.item?.name,
      market_cap_rank: item.item?.market_cap_rank,
      price_btc: item.item?.price_btc,
      score: item.item?.score,
    }));
    
    return NextResponse.json({ data: trending, source: 'coingecko' });
  } catch (error) {
    console.error('Trending API error:', error);
    return NextResponse.json({ data: [], source: 'none' });
  }
}
