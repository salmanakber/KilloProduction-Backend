# Implementation Summary - User Analytics, Global Cart, and Prescription Analysis

## Overview
This document summarizes the major features implemented:
1. User Activity Tracking & Analytics
2. Global Cart System
3. Prescription Analysis AI
4. Centralized Search Helpers
5. Fixed AI Doctor Modal Image Upload

---

## 1. User Activity Tracking & Analytics

### Prisma Schema Changes

**New Model: `UserActivity`**
- Tracks all user interactions: searches, views, cart additions, purchases, sessions
- Supports all modules: PHARMACY, GROCERY, FOOD, AUTO_PARTS
- Includes location, device info, and session tracking

**New Enum: `UserActivityType`**
- SEARCH, VIEW_ITEM, ADD_TO_CART, PURCHASE, SESSION_START, SESSION_END, SCREEN_VIEW, BUTTON_CLICK, IMAGE_SEARCH, PRESCRIPTION_UPLOAD, AI_CONSULTATION

**Updated Enum: `AIUseCase`**
- Added: `USER_ANALYTICS`, `PRESCRIPTION_ANALYSIS`

### API Endpoints

**POST `/api/user-activity/track`**
- Track any user activity
- Body: `{ activityType, module, searchQuery, ... }`

**GET `/api/user-activity/analytics`**
- Get comprehensive user analytics data
- Returns: search history, view history, cart history, purchase history, session data

**GET `/api/user-activity/search-history?module=PHARMACY&limit=20`**
- Get user's search history for a specific module

### Usage in Mobile App

```typescript
// Track search
await api.post('/user-activity/track', {
  activityType: 'SEARCH',
  module: 'PHARMACY',
  searchQuery: 'paracetamol',
  searchResultsCount: 15,
  latitude: userLat,
  longitude: userLon,
});

// Track item view
await api.post('/user-activity/track', {
  activityType: 'VIEW_ITEM',
  module: 'GROCERY',
  viewedItemId: productId,
  viewedItemName: productName,
  viewDuration: 30, // seconds
});
```

---

## 2. USER_ANALYTICS AI Use Case

### Setup in Admin Panel

1. Go to `/admin/ai-config`
2. Create new AI Configuration:
   - **Name**: "User Behavior Analytics"
   - **Use Case**: `USER_ANALYTICS`
   - **System Prompt**: (See template below)
   - **Model**: Select appropriate TEXT_TO_TEXT model

### System Prompt Template

```
You are a user behavior analytics AI. Analyze user data and provide:

1. **Preferences**:
   - Top categories they search/view
   - Favorite items/products
   - Preferred price range
   - Shopping patterns

2. **Recommendations**:
   - Suggested items with reasons
   - Personalized categories
   - Confidence scores (0-1)

3. **Behavior Analysis**:
   - Shopping frequency
   - Average order value
   - Preferred time of day
   - Preferred module

Return ONLY valid JSON in this format:
{
  "preferences": {
    "topCategories": ["category1", "category2"],
    "favoriteItems": ["item1", "item2"],
    "preferredPriceRange": { "min": 0, "max": 1000 },
    "shoppingPatterns": ["pattern1"]
  },
  "recommendations": {
    "suggestedItems": [
      {
        "itemId": "id",
        "itemName": "name",
        "reason": "why recommended",
        "confidence": 0.8
      }
    ],
    "personalizedCategories": ["cat1"]
  },
  "behaviorAnalysis": {
    "shoppingFrequency": "frequent|occasional|rare",
    "averageOrderValue": 500,
    "preferredTimeOfDay": "morning|afternoon|evening",
    "preferredModule": "PHARMACY|GROCERY|FOOD|AUTO_PARTS"
  }
}
```

### Usage

```typescript
import { analyzeUserBehavior } from '@/lib/ai/user-analytics';

const insights = await analyzeUserBehavior(userId, 'PHARMACY');
// Returns: preferences, recommendations, behaviorAnalysis
```

---

## 3. Global Cart System

### New Context: `GlobalCartContext`

**Location**: `mobile/app/src/contexts/GlobalCartContext.tsx`

**Features**:
- ✅ Unified cart for all modules (PHARMACY, GROCERY, FOOD, AUTO_PARTS)
- ✅ **PRESERVES multi-pickup functionality** (critical!)
- ✅ Module-specific vendor grouping
- ✅ Backward compatible with existing cart interfaces

### Key Methods

```typescript
const {
  cartItems,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  clearCartByModule,
  getTotalPrice,
  getTotalPriceByModule,
  getTotalItems,
  getTotalItemsByModule,
  
  // Multi-pickup support (PRESERVED)
  getVendorIds,        // Get all vendor IDs (works per module or global)
  getItemsByVendor,    // Group items by vendor (works per module or global)
  getItemsByModule,    // Group items by module
  isMultipleVendors,   // Check if multiple vendors (works per module or global)
} = useGlobalCart();
```

### Migration Guide

**Step 1: Update App Provider**
```typescript
// In your app root (app.tsx or similar)
import { GlobalCartProvider } from './contexts/GlobalCartContext';

// Wrap your app
<GlobalCartProvider>
  {/* Your app */}
</GlobalCartProvider>
```

**Step 2: Update Cart Screens**

**For GroceryCartScreen.tsx:**
```typescript
// Replace
import { useGroceryCart } from '../../../contexts/GroceryCartContext';
const { cartItems, getStoreIds, getItemsByStore } = useGroceryCart();

// With
import { useGlobalCart } from '../../../contexts/GlobalCartContext';
const { 
  cartItems, 
  getVendorIds, 
  getItemsByVendor 
} = useGlobalCart();

// Filter for grocery module
const groceryItems = cartItems.filter(i => i.module === 'GROCERY');
const storeIds = getVendorIds('GROCERY');
const itemsByStore = getItemsByVendor('GROCERY');
```

**For FoodCartScreen.tsx:**
```typescript
// Similar changes - use getVendorIds('FOOD') and getItemsByVendor('FOOD')
```

**Step 3: Update Add to Cart Calls**

```typescript
// Grocery
addToCart({
  module: 'GROCERY',
  productId: item.id,
  vendorId: store.id,  // or storeId: store.id (both work)
  vendorName: store.name,
  name: item.name,
  price: item.price,
  quantity: 1,
  // ... other fields
});

// Food
addToCart({
  module: 'FOOD',
  productId: item.id,
  vendorId: restaurant.id,  // or restaurantId: restaurant.id
  vendorName: restaurant.name,
  name: item.name,
  price: item.price,
  quantity: 1,
  customizations: item.customizations,
  // ... other fields
});
```

**Important**: The global cart preserves all multi-pickup features:
- ✅ `getVendorIds()` - Returns all vendor IDs (works per module)
- ✅ `getItemsByVendor()` - Groups items by vendor (works per module)
- ✅ `isMultipleVendors()` - Checks for multiple vendors
- ✅ Delivery fee calculation with route optimization (unchanged)
- ✅ Multi-store/restaurant checkout (unchanged)

---

## 4. PRESCRIPTION_ANALYSIS AI Use Case

### Setup in Admin Panel

1. Go to `/admin/ai-config`
2. Create new AI Configuration:
   - **Name**: "Prescription Analyzer"
   - **Use Case**: `PRESCRIPTION_ANALYSIS`
   - **System Prompt**: (See template below)
   - **Model**: Select IMAGE_TO_TEXT model for image analysis
   - **Custom Functions**: Can include medicine search function

### System Prompt Template

```
You are a prescription analysis AI. Analyze prescription images/text and extract:

1. **Medicines**: Array of prescribed medicines with:
   - medicineName (exact name from database)
   - dosage
   - frequency
   - duration
   - quantity
   - instructions

2. **Prescription Details**:
   - doctorName
   - patientName
   - date

3. **Notes**: Any additional instructions

Return ONLY valid JSON:
{
  "medicines": [
    {
      "medicineName": "Paracetamol 500mg",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "5 days",
      "quantity": "10 tablets",
      "instructions": "Take after meals"
    }
  ],
  "doctorName": "Dr. John Doe",
  "patientName": "Jane Smith",
  "date": "2024-01-15",
  "notes": "Complete the course"
}
```

### API Endpoint

**POST `/api/pharmacy/analyze-prescription`**
- Accepts: `imageFile` (FormData) or `textInput`
- Optional: `latitude`, `longitude` (for pharmacy matching)
- Returns: Analysis with pharmacy matching results

### Usage

```typescript
const formData = new FormData();
formData.append('imageFile', imageFile);
formData.append('latitude', userLat.toString());
formData.append('longitude', userLon.toString());

const response = await api.post('/pharmacy/analyze-prescription', formData);
const { analysis, pharmacyMatch } = response.data;

// pharmacyMatch contains:
// - singlePharmacyMatch: All medicines in one pharmacy
// - multiPharmacyMatch: Medicines from multiple pharmacies
// - allMedicinesFound: Boolean
```

### Pharmacy Matching Logic

1. **First**: Try to find ALL medicines in ONE nearby pharmacy
2. **If not found**: Search multiple nearby pharmacies
3. **Location-based**: Uses user's lat/lon to find nearest pharmacies
4. **Distance calculation**: Haversine formula for accurate distance

---

## 5. Centralized Search Helpers

### Location: `web/backend-data/lib/search/search-helper.ts`

**Functions**:
- `trackSearchActivity()` - Track search with module, query, filters, results
- `getUserSearchHistory()` - Get user's search history for a module
- `trackItemView()` - Track item views with duration
- `trackAddToCart()` - Track cart additions
- `trackPurchase()` - Track purchases
- `trackSession()` - Track session start/end with time spent
- `getUserAnalyticsData()` - Get comprehensive analytics for AI

### Usage in Search Endpoints

```typescript
import { trackSearchActivity } from '@/lib/search/search-helper';

// In your search route
export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  const query = searchParams.get('q');
  
  // ... perform search ...
  
  // Track search activity
  if (user) {
    await trackSearchActivity({
      userId: user.id,
      module: 'PHARMACY',
      query: query,
      filters: { category, priceRange },
      resultsCount: results.length,
      latitude: userLat,
      longitude: userLon,
    });
  }
  
  return NextResponse.json({ results });
}
```

---

## 6. Fixed AI Doctor Modal Image Upload

### Changes Made

1. **Added `onInputTypeChange` prop** to `AIDoctorModal`
   - Syncs modal's `inputType` state with parent component

2. **Updated `processAIConsultation`** in `CustomerPharmacyScreen`
   - Now checks `selectedImage` directly (more reliable)
   - Falls back to `inputType === 'image'`

3. **Fixed state synchronization**
   - Modal's tab changes now update parent's `inputType`
   - Image selection properly triggers `processImageInput`

### Result
✅ Image upload now correctly opens `AIResultsScreen` after analysis

---

## Next Steps

### 1. Run Prisma Migration

```bash
cd web/backend-data
npx prisma migrate dev --name add_user_activity_and_ai_use_cases
npx prisma generate
```

### 2. Update Mobile App

1. **Add GlobalCartProvider** to app root
2. **Migrate cart screens** to use `useGlobalCart`
3. **Add activity tracking** to search functions
4. **Test multi-pickup** functionality thoroughly

### 3. Configure AI Models

1. **USER_ANALYTICS**: Set up in admin panel with system prompt
2. **PRESCRIPTION_ANALYSIS**: Set up in admin panel with system prompt
3. **Test** both AI use cases with sample data

### 4. Test Prescription Analysis

1. Upload a prescription image
2. Verify medicine extraction
3. Verify pharmacy matching (single vs multi)
4. Test pharmacy chat integration

---

## Important Notes

⚠️ **Global Cart Migration**: 
- The global cart preserves ALL multi-pickup features
- Test thoroughly before removing old cart contexts
- Keep old contexts as fallback during migration

⚠️ **User Activity Tracking**:
- All tracking is non-blocking (errors don't break functionality)
- Consider rate limiting for high-frequency events
- Privacy: Ensure compliance with data protection regulations

⚠️ **Prescription Analysis**:
- Requires accurate medicine name matching
- Pharmacy matching depends on user location
- Ensure pharmacy chat is working for contact feature

---

## Files Created/Modified

### Backend
- `prisma/schema.prisma` - Added UserActivity model, updated AIUseCase enum
- `lib/search/search-helper.ts` - Centralized search tracking
- `lib/ai/user-analytics.ts` - User behavior analysis
- `lib/virtual-doctor/prescription-analyzer.ts` - Prescription analysis
- `app/api/user-activity/track/route.ts` - Activity tracking endpoint
- `app/api/user-activity/analytics/route.ts` - Analytics endpoint
- `app/api/user-activity/search-history/route.ts` - Search history endpoint
- `app/api/pharmacy/analyze-prescription/route.ts` - Prescription analysis endpoint

### Mobile
- `contexts/GlobalCartContext.tsx` - Unified cart for all modules
- `components/aiDoctorModal.tsx` - Fixed image upload
- `screens/customer/pharmacy/CustomerPharmacyScreen.tsx` - Fixed image processing

---

## Testing Checklist

- [ ] User activity tracking works for all modules
- [ ] Search history is saved and retrieved correctly
- [ ] USER_ANALYTICS AI returns valid insights
- [ ] Global cart preserves multi-pickup for grocery
- [ ] Global cart preserves multi-pickup for food
- [ ] Prescription analysis extracts medicines correctly
- [ ] Pharmacy matching finds single pharmacy when possible
- [ ] Pharmacy matching falls back to multiple pharmacies
- [ ] AI Doctor modal image upload opens results screen
- [ ] All existing cart features work with global cart
