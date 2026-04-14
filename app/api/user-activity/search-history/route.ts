import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getUserSearchHistory } from '@/lib/search/search-helper';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module') || 'PHARMACY';
    const limit = parseInt(searchParams.get('limit') || '20');

    const history = await getUserSearchHistory(user.id, module, limit);

    return NextResponse.json({ success: true, history });
  } catch (error: any) {
    console.error('Error fetching search history:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch search history' }, { status: 500 });
  }
}
