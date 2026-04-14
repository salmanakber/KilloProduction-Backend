# Parent-Child Orders Implementation

## Overview

Implemented a parent-child order system for multi-store/multi-restaurant orders. When a customer orders items from multiple stores/restaurants, the system creates:

1. **Parent Order**: One order for the customer that aggregates all items and totals
2. **Child Orders**: Separate orders for each vendor/store with their specific items

## Database Schema Changes

### Order Model Updates

Added two new fields to the `Order` model:

```prisma
childId       String?  // Parent order ID (for child orders)
isChildOrder  Boolean  @default(false) // True if this is a child order
childOrders   Order[]  @relation("OrderChildren") // Child orders (for parent orders)
parentOrder   Order?   @relation("OrderChildren", fields: [childId], references: [id])
```

## Implementation

### Grocery Checkout (`/api/grocery/checkout`)

**Multi-Store Scenario:**
- Groups items by store
- Creates child order for each store with:
  - Store-specific items
  - Proportional delivery fee (based on subtotal ratio)
  - Proportional platform commission
  - `isChildOrder: true`
  - `childId: <parent_order_id>`
- Creates parent order with:
  - All items aggregated
  - Total delivery fee
  - Total platform commission
  - `isChildOrder: false`
  - `childId: null`

**Single-Store Scenario:**
- Creates regular order (no parent-child relationship)
- `isChildOrder: false`
- `childId: null`

### Food Checkout (`/api/food/checkout`)

Same logic as grocery, but for restaurants:
- Multi-restaurant: Creates parent + child orders
- Single restaurant: Creates regular order

## Order Structure Example

### Multi-Store Order

**Parent Order:**
```
Order #GRC-1234567890
- Customer: John Doe
- Total: ₦15,000
- Delivery Fee: ₦500
- Items: [Item A from Store 1, Item B from Store 2]
- isChildOrder: false
- childId: null
```

**Child Order 1 (Store 1):**
```
Order #GRC-1234567891
- Customer: John Doe
- Vendor: Store 1
- Total: ₦8,000 (proportional)
- Delivery Fee: ₦250 (proportional)
- Items: [Item A]
- isChildOrder: true
- childId: GRC-1234567890
```

**Child Order 2 (Store 2):**
```
Order #GRC-1234567892
- Customer: John Doe
- Vendor: Store 2
- Total: ₦7,000 (proportional)
- Delivery Fee: ₦250 (proportional)
- Items: [Item B]
- isChildOrder: true
- childId: GRC-1234567890
```

## Benefits

1. **Customer View**: Single order with all items
2. **Vendor View**: Each vendor sees only their order
3. **Order Management**: Easy to track and manage per-vendor
4. **Payment**: Single payment for customer, split commission per vendor
5. **Notifications**: Vendors receive notifications for their child orders only

## Next Steps

1. **Run Prisma Migration**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

2. **Update Frontend**:
   - Display parent order to customers
   - Display child orders to vendors
   - Show order relationships in order details

3. **Update Order Queries**:
   - Filter child orders for vendor dashboards
   - Include child orders when fetching parent orders
   - Update order status synchronization (if parent is cancelled, cancel children)

## API Response

Both grocery and food checkout now return:

```json
{
  "success": true,
  "order": {
    "id": "order-id",
    "orderNumber": "GRC-1234567890",
    "isChildOrder": false,
    "childId": null,
    "childOrders": [
      {
        "id": "child-order-1-id",
        "orderNumber": "GRC-1234567891",
        "vendorId": "vendor-1-id",
        "total": 8000
      }
    ]
  }
}
```
