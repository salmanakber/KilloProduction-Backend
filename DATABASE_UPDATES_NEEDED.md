# Database Updates Required for Auto Parts Mechanic Commission

## 1. Add MECHANIC_COMMISSION to CommissionType Enum

You need to add `MECHANIC_COMMISSION` to the `CommissionType` enum in your Prisma schema.

**File:** `prisma/schema.prisma`

**Current enum:**
```prisma
enum CommissionType {
  VENDOR_COMMISSION
  RIDER_COMMISSION
  PLATFORM_FEE
  PAYMENT_PROCESSING
  WHOLESALE_ORDER
}
```

**Updated enum:**
```prisma
enum CommissionType {
  VENDOR_COMMISSION
  RIDER_COMMISSION
  MECHANIC_COMMISSION  // ADD THIS LINE
  PLATFORM_FEE
  PAYMENT_PROCESSING
  WHOLESALE_ORDER
}
```

## 2. Add Order Status (Optional but Recommended)

You may want to add `AWAITING_MECHANIC_OFFER` to your OrderStatus enum if it doesn't exist.

**File:** `prisma/schema.prisma`

Look for `enum OrderStatus` and ensure it includes:
```prisma
enum OrderStatus {
  // ... existing statuses
  AWAITING_MECHANIC_OFFER  // ADD THIS if not present
  // ... other statuses
}
```

## 3. Create Commission Setting Record

After updating the enum, create a commission setting for mechanics in your database:

```sql
INSERT INTO commission_settings (id, module, "commissionType", rate, "minAmount", "maxAmount", "isActive", description, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'AUTO_PARTS',
  'MECHANIC_COMMISSION',
  5.0,  -- 5% commission rate (adjust as needed)
  0,    -- minimum amount (adjust as needed)
  NULL, -- maximum amount (NULL = no limit)
  true,
  'Commission rate for mechanics on auto parts service charges',
  NOW(),
  NOW()
);
```

Or using Prisma Client:
```typescript
await prisma.commissionSetting.create({
  data: {
    module: "AUTO_PARTS",
    commissionType: "MECHANIC_COMMISSION",
    rate: 5.0,
    minAmount: 0,
    maxAmount: null,
    isActive: true,
    description: "Commission rate for mechanics on auto parts service charges"
  }
})
```

## 4. Run Migrations

After making these changes:

1. Generate Prisma migration:
```bash
npx prisma migrate dev --name add_mechanic_commission
```

2. Or if using Prisma Studio, apply the schema changes:
```bash
npx prisma db push
```

## Notes

- The mechanic commission is currently stored in the order's `metadata` field as JSON
- You can later create a dedicated `MechanicCommission` model similar to `VendorCommission` and `RiderCommission` if needed
- The commission is calculated when the mechanic offer is accepted, not when the vendor offer is accepted



