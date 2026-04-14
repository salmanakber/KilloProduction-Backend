# Courier Bid Implementation Guide

## Overview
This document outlines the implementation of the courier bid functionality for the Kilo Super App. The system now supports bidding on courier bookings similar to ride bookings.

## Database Changes

### New Table: `courier_bids`
- Stores bid information for courier bookings
- Similar structure to `ride_bids` table
- Includes bid amount, estimated time, message, and status

### Updated Models
- `CourierBooking` now has a `bids` relation
- `User` now has a `courierBids` relation
- Both models use the existing `BidStatus` enum

## Backend API Endpoints Required

### 1. Submit Courier Bid
```typescript
POST /rider/bid/courier-booking/:bookingId
```

**Request Body:**
```json
{
  "bidAmount": 1500.00,
  "estimatedTime": 30,
  "message": "I can pick up in 10 minutes"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bid submitted successfully",
  "data": {
    "id": "bid_123",
    "courierBookingId": "booking_456",
    "riderId": "rider_789",
    "bidAmount": 1500.00,
    "estimatedTime": 30,
    "message": "I can pick up in 10 minutes",
    "status": "PENDING",
    "expiresAt": "2024-01-20T10:00:00Z",
    "createdAt": "2024-01-20T09:30:00Z"
  }
}
```

### 2. Update Courier Booking Status
```typescript
PUT /courier-bookings/:bookingId/status
```

**Request Body:**
```json
{
  "status": "BIDDING"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Status updated successfully",
  "data": {
    "id": "booking_456",
    "status": "BIDDING",
    "updatedAt": "2024-01-20T09:30:00Z"
  }
}
```

### 3. Get Available Courier Requests (Updated)
```typescript
GET /rider/available-requests?type=courier&status=REQUESTED
```

**Response:**
```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "id": "booking_456",
        "type": "courier",
        "status": "REQUESTED", // Only REQUESTED status, not BIDDING
        "pickupAddress": "123 Main St",
        "dropAddress": "456 Oak Ave",
        // ... other fields
      }
    ]
  }
}
```

## Implementation Steps

### 1. Run Database Migration
```bash
# Option 1: Run the SQL script directly
psql -U postgres -d kilo_super_app -f prisma/migrations/add_courier_bid_table.sql

# Option 2: Use Prisma migrate (recommended)
npx prisma migrate dev --name add_courier_bid_table
```

### 2. Update Prisma Client
```bash
npx prisma generate
```

### 3. Create Backend Controllers

#### Courier Bid Controller
```typescript
// controllers/courierBidController.ts
export const submitCourierBid = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { bidAmount, estimatedTime, message } = req.body;
    const riderId = req.user.id; // From auth middleware

    // Validate booking exists and is available for bidding
    const booking = await prisma.courierBooking.findFirst({
      where: {
        id: bookingId,
        status: 'REQUESTED', // Only allow bids on REQUESTED bookings
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Courier booking not found or not available for bidding'
      });
    }

    // Check if rider already has a pending bid
    const existingBid = await prisma.courierBid.findFirst({
      where: {
        courierBookingId: bookingId,
        riderId,
        status: 'PENDING'
      }
    });

    if (existingBid) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending bid on this booking'
      });
    }

    // Create the bid
    const bid = await prisma.courierBid.create({
      data: {
        courierBookingId: bookingId,
        riderId,
        bidAmount: parseFloat(bidAmount),
        estimatedTime: parseInt(estimatedTime),
        message,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    });

    // Update booking status to BIDDING
    await prisma.courierBooking.update({
      where: { id: bookingId },
      data: { status: 'BIDDING' }
    });

    res.status(201).json({
      success: true,
      message: 'Bid submitted successfully',
      data: bid
    });

  } catch (error) {
    console.error('Error submitting courier bid:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
```

#### Updated Available Requests Controller
```typescript
// controllers/riderController.ts
export const getAvailableRequests = async (req: Request, res: Response) => {
  try {
    const { type, status, riderLat, riderLng } = req.query;
    
    let whereClause: any = {};
    
    // Filter by type
    if (type === 'courier') {
      whereClause.module = 'COURIER';
    } else if (type === 'ride') {
      whereClause.module = 'RIDING';
    }
    
    // Filter by status - exclude BIDDING status
    if (status) {
      whereClause.status = status;
    } else {
      // Default: exclude BIDDING status
      whereClause.status = {
        not: 'BIDDING'
      };
    }

    // Get courier bookings
    const courierBookings = await prisma.courierBooking.findMany({
      where: {
        ...whereClause,
        status: 'REQUESTED', // Only show REQUESTED status
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true
          }
        },
        rideType: true
      }
    });

    // Get ride bookings
    const rideBookings = await prisma.rideBooking.findMany({
      where: {
        ...whereClause,
        status: 'REQUESTED', // Only show REQUESTED status
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true
          }
        },
        rideType: true
      }
    });

    // Combine and format requests
    const requests = [
      ...courierBookings.map(booking => ({
        ...booking,
        type: 'courier',
        bookingNumber: booking.bookingNumber,
        pickupAddress: booking.pickupAddress,
        dropAddress: booking.dropAddress,
        // ... map other fields
      })),
      ...rideBookings.map(booking => ({
        ...booking,
        type: 'ride',
        bookingNumber: booking.bookingNumber,
        pickupAddress: booking.pickupAddress,
        dropAddress: booking.dropAddress,
        // ... map other fields
      }))
    ];

    res.json({
      success: true,
      data: { requests }
    });

  } catch (error) {
    console.error('Error fetching available requests:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
```

### 4. Update Routes
```typescript
// routes/rider.ts
router.post('/bid/courier-booking/:bookingId', authMiddleware, submitCourierBid);
router.post('/bid/ride-booking/:bookingId', authMiddleware, submitRideBid);

// routes/courier.ts
router.put('/:bookingId/status', authMiddleware, updateCourierBookingStatus);
```

## Frontend Changes (Already Implemented)

The frontend has been updated to:
- Show bid button for available requests
- Handle both courier and ride bids
- Update request status to BIDDING after bid submission
- Filter out BIDDING requests from available requests
- Show visual indicators for bidding status

## Testing

### Test Cases
1. **Submit Valid Bid**: Rider submits bid on REQUESTED courier booking
2. **Duplicate Bid Prevention**: Rider cannot submit multiple bids on same booking
3. **Status Update**: Booking status changes to BIDDING after bid
4. **Request Filtering**: BIDDING requests don't appear in available requests
5. **Bid Expiration**: Bids expire after 24 hours

### Test Data
```sql
-- Insert test courier booking
INSERT INTO courier_bookings (id, booking_number, customer_id, ride_type_id, pickup_address, drop_address, status, fare, distance, estimated_time)
VALUES ('test_booking_1', 'CB001', 'customer_id', 'ride_type_id', '123 Main St', '456 Oak Ave', 'REQUESTED', 1000.00, 5.5, 30);

-- Insert test bid
INSERT INTO courier_bids (id, courier_booking_id, rider_id, bid_amount, estimated_time, message, status, expires_at)
VALUES ('test_bid_1', 'test_booking_1', 'rider_id', 950.00, 25, 'I can do it cheaper', 'PENDING', NOW() + INTERVAL '24 hours');
```

## Security Considerations

1. **Authentication**: All bid endpoints require valid rider authentication
2. **Authorization**: Riders can only bid on available (REQUESTED) bookings
3. **Rate Limiting**: Prevent spam bidding
4. **Input Validation**: Validate bid amounts and estimated times
5. **Duplicate Prevention**: One rider per booking bid

## Future Enhancements

1. **Bid Expiration Handling**: Automatic cleanup of expired bids
2. **Bid Acceptance**: Customer can accept/reject bids
3. **Bid History**: Track all bids for analytics
4. **Auto-assignment**: Automatically assign rider based on best bid
5. **Bid Notifications**: Notify customers of new bids


