import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

export interface SearchHistoryItem {
  query: string;
  module: string;
  filters?: any;
  resultsCount?: number;
  imageUrl?: string;
  timestamp: Date;
}

export interface UserSearchContext {
  userId: string;
  module: string;
  query: string;
  filters?: any;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Track user search activity
 */
export async function trackSearchActivity(context: UserSearchContext, resultsCount?: number) {
  try {
    await prisma.userActivity.create({
      data: {
        userId: context.userId,
        activityType: context.imageUrl ? 'IMAGE_SEARCH' : 'SEARCH',
        module: context.module as any,
        searchQuery: context.query,
        searchFilters: context.filters || null,
        searchResultsCount: resultsCount,
        searchImageUrl: context.imageUrl || null,
        latitude: context.latitude || null,
        longitude: context.longitude || null,
        sessionId: `search_${Date.now()}`,
      },
    });
  } catch (error) {
    console.error('Error tracking search activity:', error);
    // Don't throw - search tracking shouldn't break the search functionality
  }
}

/**
 * Get user search history for a module
 */
export async function getUserSearchHistory(
  userId: string,
  module: string,
  limit: number = 20
): Promise<SearchHistoryItem[]> {
  try {
    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        module: module as any,
        activityType: { in: ['SEARCH', 'IMAGE_SEARCH'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        searchQuery: true,
        searchFilters: true,
        searchResultsCount: true,
        searchImageUrl: true,
        createdAt: true,
        module: true,
      },
    });

    return activities
      .filter(a => a.searchQuery)
      .map(a => ({
        query: a.searchQuery!,
        module: a.module || module,
        filters: a.searchFilters as any,
        resultsCount: a.searchResultsCount || undefined,
        imageUrl: a.searchImageUrl || undefined,
        timestamp: a.createdAt,
      }));
  } catch (error) {
    console.error('Error fetching search history:', error);
    return [];
  }
}

/**
 * Track item view activity
 */
export async function trackItemView(
  userId: string,
  module: string,
  itemId: string,
  itemType: string,
  itemName: string,
  viewDuration?: number
) {
  try {
    await prisma.userActivity.create({
      data: {
        userId,
        activityType: 'VIEW_ITEM',
        module: module as any,
        viewedItemId: itemId,
        viewedItemType: itemType,
        viewedItemName: itemName,
        viewDuration: viewDuration,
      },
    });
  } catch (error) {
    console.error('Error tracking item view:', error);
  }
}

/**
 * Track add to cart activity
 */
export async function trackAddToCart(
  userId: string,
  module: string,
  itemId: string,
  itemName: string,
  itemPrice: number,
  quantity: number
) {
  try {
    await prisma.userActivity.create({
      data: {
        userId,
        activityType: 'ADD_TO_CART',
        module: module as any,
        viewedItemId: itemId,
        viewedItemName: itemName,
        metadata: {
          price: itemPrice,
          quantity: quantity,
        },
      },
    });
  } catch (error) {
    console.error('Error tracking add to cart:', error);
  }
}

/**
 * Track purchase activity
 */
export async function trackPurchase(
  userId: string,
  module: string,
  orderId: string,
  orderTotal: number,
  items: Array<{ id: string; name: string; price: number; quantity: number }>
) {
  try {
    await prisma.userActivity.create({
      data: {
        userId,
        activityType: 'PURCHASE',
        module: module as any,
        purchaseModule: module as any,
        orderId: orderId,
        orderTotal: orderTotal,
        itemsPurchased: items as any,
      },
    });
  } catch (error) {
    console.error('Error tracking purchase:', error);
  }
}

/**
 * Track session activity
 */
export async function trackSession(
  userId: string,
  module: string,
  sessionType: 'SESSION_START' | 'SESSION_END',
  timeSpentSeconds?: number,
  sessionId?: string
) {
  try {
    await prisma.userActivity.create({
      data: {
        userId,
        activityType: sessionType,
        module: module as any,
        sessionId: sessionId || `session_${Date.now()}`,
        timeSpentSeconds: timeSpentSeconds,
        sessionStartTime: sessionType === 'SESSION_START' ? new Date() : undefined,
        sessionEndTime: sessionType === 'SESSION_END' ? new Date() : undefined,
      },
    });
  } catch (error) {
    console.error('Error tracking session:', error);
  }
}

/**
 * Get user analytics data for AI analysis
 */
export async function getUserAnalyticsData(userId: string) {
  try {
    const [
      searchHistory,
      viewHistory,
      cartHistory,
      purchaseHistory,
      sessionData,
    ] = await Promise.all([
      // Search activities
      prisma.userActivity.findMany({
        where: {
          userId,
          activityType: { in: ['SEARCH', 'IMAGE_SEARCH'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          searchQuery: true,
          module: true,
          searchFilters: true,
          createdAt: true,
        },
      }),
      // View activities
      prisma.userActivity.findMany({
        where: {
          userId,
          activityType: 'VIEW_ITEM',
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          viewedItemId: true,
          viewedItemName: true,
          viewedItemType: true,
          module: true,
          viewDuration: true,
          createdAt: true,
        },
      }),
      // Cart activities
      prisma.userActivity.findMany({
        where: {
          userId,
          activityType: 'ADD_TO_CART',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          viewedItemName: true,
          module: true,
          metadata: true,
          createdAt: true,
        },
      }),
      // Purchase activities
      prisma.userActivity.findMany({
        where: {
          userId,
          activityType: 'PURCHASE',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          orderId: true,
          orderTotal: true,
          itemsPurchased: true,
          module: true,
          purchaseModule: true,
          createdAt: true,
        },
      }),
      // Session data
      prisma.userActivity.findMany({
        where: {
          userId,
          activityType: { in: ['SESSION_START', 'SESSION_END'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          activityType: true,
          module: true,
          timeSpentSeconds: true,
          sessionStartTime: true,
          sessionEndTime: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      searchHistory: searchHistory.filter(s => s.searchQuery),
      viewHistory,
      cartHistory,
      purchaseHistory,
      sessionData,
      totalSearches: searchHistory.length,
      totalViews: viewHistory.length,
      totalCartAdds: cartHistory.length,
      totalPurchases: purchaseHistory.length,
      totalTimeSpent: sessionData
        .filter(s => s.timeSpentSeconds)
        .reduce((sum, s) => sum + (s.timeSpentSeconds || 0), 0),
    };
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    return {
      searchHistory: [],
      viewHistory: [],
      cartHistory: [],
      purchaseHistory: [],
      sessionData: [],
      totalSearches: 0,
      totalViews: 0,
      totalCartAdds: 0,
      totalPurchases: 0,
      totalTimeSpent: 0,
    };
  }
}
