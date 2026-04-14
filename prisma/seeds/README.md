# Auto Parts Seed Data

This seed script creates test data for the Auto Parts module, including:

- **3 Test Vendors** with vendor profiles in different cities (Lagos, Abuja)
- **4 Categories**: Brakes, Engine, Suspension, Electrical
- **12 Test Products** across different categories with realistic pricing
- **Sample Reviews** for products

## Running the Seed

```bash
# From the backend-data directory
npm run db:seed:auto-parts
```

Or directly with tsx:

```bash
tsx prisma/seeds/auto-parts-seed.ts
```

## Test Data Created

### Vendors
1. **Premium Auto Parts** (Lagos) - `autoparts1@test.com`
2. **Quick Fix Auto Parts** (Abuja) - `autoparts2@test.com`
3. **Elite Car Parts** (Lagos) - `autoparts3@test.com`

### Products Include:
- Brake pads, rotors, brake fluid
- Air filters, oil filters, timing belts, spark plugs
- Shock absorbers, strut assemblies
- Car batteries, alternators, starter motors

All products are:
- Active and in stock
- Have realistic pricing with compare prices (for deals)
- Include images, descriptions, and SKUs
- Properly categorized

## Testing AI Vehicle Check

You can test the AI vehicle check feature with these example inputs:

**Text Input:**
- "My Toyota Camry 2020 is making a grinding noise when I brake"
- "I need brake pads for my Honda Accord"
- "My car battery died, need a replacement"

**Voice Input:**
- Record: "My car is making a strange noise and I need to replace the brake pads"

**Image Input:**
- Upload a photo of your vehicle dashboard
- Upload a photo of a damaged part
- Upload a photo of a part label

The AI will analyze the input and recommend matching parts from the seeded products.


