import { analyzeWithAI } from './queue';
import { getUserAnalyticsData } from '../search/search-helper';

export interface UserAnalyticsInsights {
  preferences: {
    topCategories: string[];
    favoriteItems: string[];
    preferredPriceRange: { min: number; max: number };
    shoppingPatterns: string[];
  };
  recommendations: {
    suggestedItems: Array<{
      itemId: string;
      itemName: string;
      reason: string;
      confidence: number;
    }>;
    personalizedCategories: string[];
  };
  behaviorAnalysis: {
    shoppingFrequency: string;
    averageOrderValue: number;
    preferredTimeOfDay: string;
    preferredModule: string;
  };
}

/**
 * Analyze user data and generate personalized recommendations
 */
export async function analyzeUserBehavior(userId: string, module?: string): Promise<UserAnalyticsInsights> {
  try {
    // Get user analytics data
    const analyticsData = await getUserAnalyticsData(userId);

    // Prepare data for AI analysis
    const analysisPrompt = {
      userId,
      module: module || 'ALL',
      searchHistory: analyticsData.searchHistory,
      viewHistory: analyticsData.viewHistory,
      cartHistory: analyticsData.cartHistory,
      purchaseHistory: analyticsData.purchaseHistory,
      sessionData: analyticsData.sessionData,
      summary: {
        totalSearches: analyticsData.totalSearches,
        totalViews: analyticsData.totalViews,
        totalCartAdds: analyticsData.totalCartAdds,
        totalPurchases: analyticsData.totalPurchases,
        totalTimeSpent: analyticsData.totalTimeSpent,
      },
    };

    // Call AI with USER_ANALYTICS use case
    const aiResponse = await analyzeWithAI('USER_ANALYTICS', analysisPrompt, {
      category: 'TEXT_TO_TEXT',
    });

    if (!aiResponse.content) {
      throw new Error('No response from USER_ANALYTICS AI');
    }

    // Parse AI response
    let parsedResponse: any;
    try {
      // Clean response (remove markdown if present)
      let cleanText = aiResponse.content.trim();
      cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');

      // Extract JSON
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }

      parsedResponse = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Error parsing USER_ANALYTICS response:', parseError);
      // Return default structure if parsing fails
      return getDefaultInsights(analyticsData);
    }

    // Validate and return insights
    return {
      preferences: parsedResponse.preferences || {
        topCategories: [],
        favoriteItems: [],
        preferredPriceRange: { min: 0, max: 1000 },
        shoppingPatterns: [],
      },
      recommendations: parsedResponse.recommendations || {
        suggestedItems: [],
        personalizedCategories: [],
      },
      behaviorAnalysis: parsedResponse.behaviorAnalysis || {
        shoppingFrequency: 'unknown',
        averageOrderValue: 0,
        preferredTimeOfDay: 'unknown',
        preferredModule: module || 'PHARMACY',
      },
    };
  } catch (error) {
    console.error('Error analyzing user behavior:', error);
    // Return default insights on error
    const analyticsData = await getUserAnalyticsData(userId);
    return getDefaultInsights(analyticsData);
  }
}

function getDefaultInsights(analyticsData: any): UserAnalyticsInsights {
  // Extract basic insights from raw data
  const topSearches = analyticsData.searchHistory
    .slice(0, 10)
    .map((s: any) => s.searchQuery)
    .filter(Boolean);

  const topViews = analyticsData.viewHistory
    .slice(0, 10)
    .map((v: any) => v.viewedItemName)
    .filter(Boolean);

  const avgOrderValue = analyticsData.purchaseHistory.length > 0
    ? analyticsData.purchaseHistory.reduce((sum: number, p: any) => sum + (p.orderTotal || 0), 0) / analyticsData.purchaseHistory.length
    : 0;

  return {
    preferences: {
      topCategories: [],
      favoriteItems: topViews,
      preferredPriceRange: { min: 0, max: avgOrderValue * 2 },
      shoppingPatterns: [],
    },
    recommendations: {
      suggestedItems: [],
      personalizedCategories: [],
    },
    behaviorAnalysis: {
      shoppingFrequency: analyticsData.totalPurchases > 10 ? 'frequent' : 'occasional',
      averageOrderValue: avgOrderValue,
      preferredTimeOfDay: 'unknown',
      preferredModule: 'PHARMACY',
    },
  };
}
