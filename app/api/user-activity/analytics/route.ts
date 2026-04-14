import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getUserAnalyticsData } from '@/lib/search/search-helper';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const analyticsData = await getUserAnalyticsData(user.id);

    return NextResponse.json({ success: true, data: analyticsData });
  } catch (error: any) {
    console.error('Error fetching user analytics:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch analytics' }, { status: 500 });
  }
}
