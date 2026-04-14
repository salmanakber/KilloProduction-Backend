# Multi-Pickup Routing System

## Overview

A comprehensive, reusable routing and delivery fee calculation system for multi-pickup orders across different modules (Grocery, Food, Pharmacy, Courier).

## Features

- ✅ **Route Optimization**: Uses Google Maps Directions API with waypoint optimization
- ✅ **Single & Multiple Pickups**: Handles both single and multiple pickup scenarios
- ✅ **Distance & Time Calculation**: Accurate driving distance and estimated delivery time
- ✅ **Delivery Fee Calculation**: Fair pricing based on optimized route
- ✅ **Route Persistence**: Saves route data to database for rider navigation
- ✅ **Module Agnostic**: Reusable across Grocery, Food, Pharmacy, and Courier modules
- ✅ **Fallback Support**: Works even when Google Maps API is unavailable

## Architecture

### Core Service

**File**: `/lib/multi-pickup-route.service.ts`

Main service providing:
- `calculateOptimizedRoute()`: Calculates optimized route for multiple pickup points
- `calculateDeliveryFee()`: Calculates delivery fee based on route and ride type
- `calculateRouteAndFee()`: Combined route and fee calculation
- `calculateFallbackRoute()`: Fallback when API is unavailable

### Helper Functions

**File**: `/lib/multi-pickup-route-helper.ts`

Database operations:
- `saveRouteToMultiplePickups()`: Saves route data to MultiplePickup records
- `getRouteDataForOrder()`: Retrieves route data for an order
- `getPickupPointsForOrder()`: Gets pickup points for rider navigation

### API Endpoint

**File**: `/app/api/delivery/route/calculate/route.ts`

**POST** `/api/delivery/route/calculate`

Request body:
```json
{
  "pickupPoints": [
    {
      "id": "store-id",
      "name": "Store Name",
      "address": "Store Address",
      "latitude": 6.5244,
      "longitude": 3.3792,
      "module": "GROCERY",
      "storeType": "GROCERY_STORE"
    }
  ],
  "dropoffPoint": {
    "id": "address-id",
    "address": "Customer Address",
    "latitude": 6.4550,
    "longitude": 3.4738
  },
  "module": "GROCERY"
}
```

Response:
```json
{
  "success": true,
  "route": {
    "pickupPoints": [...],
    "dropoffPoint": {...},
    "segments": [...],
    "totalDistance": 15.5,
    "totalDuration": 1800,
    "estimatedDeliveryTime": 30,
    "routePolyline": "...",
    "waypointOrder": [0, 2, 1]
  },
  "deliveryFee": {
    "basePrice": 500,
    "pricePerKm": 100,
    "pricePerMinute": 10,
    "distanceFee": 1550,
    "timeFee": 300,
    "totalFee": 2350
  },
  "isValid": true
}
```

## Database Schema

### MultiplePickup Model

Updated to support:
- **Multiple Store Types**: Grocery stores, restaurants, pharmacies
- **Route Data**: Distance, duration, polyline, waypoint order
- **Optional Relations**: `courierBookingId` can be null (created later)
- **Module Support**: Generic `module` field for identification

Key fields:
```prisma
model MultiplePickup {
  id                  String
  courierBookingId    String? // Optional - created when rider assigned
  orderId             String?
  
  // Store identification (at least one must be set)
  restaurantId        String?
  groceryStoreId     String?
  pharmacyId         String?
  
  // Store information
  storeName           String
  storeAddress        String
  storeLatitude       Float
  storeLongitude      Float
  module              String?
  
  // Route data
  sequence            Int
  distanceFromPrevious Float?
  durationFromPrevious Int?
  totalRouteDistance  Float?
  totalRouteDuration  Int?
  routePolyline       String?
  estimatedArrivalTime DateTime?
  
  // Status
  status              String
  pickedUpAt          DateTime?
  ...
}
```

## Integration

### Grocery Checkout

**File**: `/app/api/grocery/checkout/route.ts`

- ✅ Removed single-store restriction
- ✅ Detects multi-store orders
- ✅ Uses route optimization service for multi-store
- ✅ Saves route data to MultiplePickup records
- ✅ Creates CourierBooking with route information

### Grocery Cart Screen

**File**: `/mobile/app/src/screens/customer/grocery/GroceryCartScreen.tsx`

- ✅ Removed multi-store restriction
- ✅ Uses route calculation API for multi-store orders
- ✅ Displays informative message about route optimization
- ✅ Calculates delivery fee based on optimized route

## Usage Examples

### Single Store Order

Works as before - simple point-to-point calculation.

### Multi-Store Order

1. Customer adds items from multiple stores to cart
2. Cart screen detects multiple stores
3. On address selection, calls `/api/delivery/route/calculate`
4. Service optimizes route using Google Maps waypoint optimization
5. Returns optimized pickup order, total distance, duration, and delivery fee
6. On checkout, route data is saved to MultiplePickup records
7. Rider receives optimized route for navigation

## Route Optimization Algorithm

1. **Single Pickup**: Direct route from pickup to dropoff
2. **Multiple Pickups**: 
   - Uses Google Maps Directions API with `optimize:true` waypoints
   - API returns optimized waypoint order
   - Reorders pickup points based on optimization
   - Calculates segments between each pickup point
   - Sums total distance and duration

## Delivery Fee Calculation

Formula:
```
totalFee = basePrice + (pricePerKm × totalDistance) + (pricePerMinute × totalDurationInMinutes)
```

Where:
- `basePrice`: Base delivery fee
- `pricePerKm`: Cost per kilometer
- `pricePerMinute`: Cost per minute
- `totalDistance`: Optimized route distance in km
- `totalDuration`: Optimized route duration in minutes

## Future Enhancements

- [ ] Support for Mapbox as alternative to Google Maps
- [ ] Real-time route updates during delivery
- [ ] Route caching for frequently used routes
- [ ] Dynamic pricing based on traffic conditions
- [ ] Support for scheduled deliveries
- [ ] Route sharing with customers

## Testing

To test multi-store routing:

1. Add items from multiple grocery stores to cart
2. Select delivery address
3. Verify delivery fee is calculated based on optimized route
4. Complete checkout
5. Verify MultiplePickup records are created with route data
6. Check CourierBooking has correct route information

## Notes

- Google Maps API key must be configured in environment variables
- Fallback calculation uses Haversine formula (less accurate but no API needed)
- Route polyline can be used for map visualization in rider app
- Waypoint order is stored for reference and debugging
