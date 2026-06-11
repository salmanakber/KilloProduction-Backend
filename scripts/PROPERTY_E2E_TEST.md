# Property module — manual E2E checklist

Prerequisites:

```bash
cd web/backend-data
npx tsx scripts/seed-property-commission.ts
# optional listings:
PROPERTY_SEED_VENDOR_ID=<vendorUserId> npx tsx scripts/seed-property-listings.ts
```

Ensure `.env` has `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

Worker (reminders / auto-complete):

```bash
npx tsx scripts/food-rider-dispatch-worker.ts
```

## Host (vendor)

1. Open **Add Property** → upload gallery photos (Cloudinary `kilo/property/listings`).
2. Publish listing → appears on **My Properties** and customer search.
3. **Booking Requests** → approve a paid booking.
4. QR / check-in → booking becomes `ACTIVE`.
5. Check-out → escrow released, **Global Earnings** shows PROPERTY payout.

## Guest (customer)

1. Search → open listing → **Book** → quote shows platform fee from commission settings.
2. Pay via **PaymentScreen** (`PROPERTY` module).
3. **Booking History** → itinerary details.
4. After `COMPLETED` → **Submit Review** with photos (Cloudinary `kilo/property/reviews`).
5. Cancel paid booking (if allowed) → wallet **Refund processed** notification.

## API smoke

```bash
# Upload (Bearer token)
curl -X POST "$API/property/upload-images" \
  -H "Authorization: Bearer $TOKEN" \
  -F "folder=listings" \
  -F "images=@./sample.jpg"
```

Expected: `{ "success": true, "images": ["https://res.cloudinary.com/..."] }`
