import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      activityType,
      module,
      searchQuery,
      searchFilters,
      searchResultsCount,
      searchImageUrl,
      viewedItemId,
      viewedItemType,
      viewedItemName,
      viewDuration,
      orderId,
      orderTotal,
      itemsPurchased,
      purchaseModule,
      sessionStartTime,
      sessionEndTime,
      timeSpentSeconds,
      latitude,
      longitude,
      locationName,
      sessionId,
      metadata,
    } = body;

    if (!activityType) {
      return NextResponse.json({ error: 'activityType is required' }, { status: 400 });
    }

    const activity = await prisma.userActivity.create({
      data: {
        userId: user.id,
        activityType: activityType as any,
        module: module ? (module as any) : null,
        searchQuery: searchQuery || null,
        searchFilters: searchFilters || null,
        searchResultsCount: searchResultsCount || null,
        searchImageUrl: searchImageUrl || null,
        viewedItemId: viewedItemId || null,
        viewedItemType: viewedItemType || null,
        viewedItemName: viewedItemName || null,
        viewDuration: viewDuration || null,
        orderId: orderId || null,
        orderTotal: orderTotal || null,
        itemsPurchased: itemsPurchased || null,
        purchaseModule: purchaseModule ? (purchaseModule as any) : null,
        sessionStartTime: sessionStartTime ? new Date(sessionStartTime) : null,
        sessionEndTime: sessionEndTime ? new Date(sessionEndTime) : null,
        timeSpentSeconds: timeSpentSeconds || null,
        latitude: latitude || null,
        longitude: longitude || null,
        locationName: locationName || null,
        sessionId: sessionId || null,
        metadata: metadata || null,
      },
    });

    return NextResponse.json({ success: true, activity });
  } catch (error: any) {
    console.error('Error tracking user activity:', error);
    return NextResponse.json({ error: error.message || 'Failed to track activity' }, { status: 500 });
  }
}
