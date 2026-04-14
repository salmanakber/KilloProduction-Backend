# Food & Grocery Seed Data

This seed script creates comprehensive test data for the Food and Grocery modules, including:

- **3 Food Vendors** with restaurants in different locations (Victoria Island, Ikeja, Lekki)
- **3 Grocery Vendors** with stores in different locations (Surulere, Gbagada, Yaba)
- **Menu Categories & Items** for each restaurant
- **Grocery Products** across different categories
- **Offers & Promotions** for both restaurants and grocery stores

## Running the Seed

```bash
# From the backend-data directory
npm run db:seed:food-grocery
```

Or directly with tsx:

```bash
tsx prisma/seeds/food-grocery-seed.ts
```

## Test Data Created

### Food Vendors & Restaurants

1. **Bella Italia Restaurant** (Victoria Island)
   - Email: `food1@test.com`
   - Cuisine: Italian, Pizza, Pasta
   - Menu: Margherita Pizza, Pepperoni Pizza, Spaghetti Carbonara, Fettuccine Alfredo
   - Offer: 20% Off All Pizzas

2. **Burger Express** (Ikeja)
   - Email: `food2@test.com`
   - Cuisine: Fast Food, Burgers, American
   - Menu: Classic Burger, Cheese Burger, French Fries
   - Offer: Buy 2 Get 1 Free

3. **Dragon Wok** (Lekki Phase 1)
   - Email: `food3@test.com`
   - Cuisine: Chinese, Asian, Fusion
   - Menu: Sweet and Sour Chicken, Fried Rice
   - Rating: 4.7/5

### Grocery Vendors & Stores

1. **Fresh Mart** (Surulere)
   - Email: `grocery1@test.com`
   - Type: Supermarket, Fresh Produce
   - Products: Fresh Tomatoes, Fresh Bananas, Fresh Milk, Coca Cola
   - Offer: 15% Off Fresh Produce

2. **Organic Groceries** (Gbagada)
   - Email: `grocery2@test.com`
   - Type: Organic, Health Food
   - Products: Organic Apples, Organic Spinach, Organic Honey
   - Offer: Buy 2 Get 1 Free Organic Products
   - Rating: 4.6/5

3. **Quick Shop** (Yaba)
   - Email: `grocery3@test.com`
   - Type: Convenience Store
   - Products: Potato Chips, Bottled Water, Bread Loaf
   - Offer: 10% Off All Snacks

## Test Credentials

All vendors use the same password: `password123`

### Food Vendors
- `food1@test.com` / `password123`
- `food2@test.com` / `password123`
- `food3@test.com` / `password123`

### Grocery Vendors
- `grocery1@test.com` / `password123`
- `grocery2@test.com` / `password123`
- `grocery3@test.com` / `password123`

## Features Included

### Restaurants
- ✅ Opening hours configured
- ✅ Delivery zones and fees set
- ✅ Menu categories with proper sorting
- ✅ Menu items with prices, descriptions, images
- ✅ Featured and popular items marked
- ✅ Active offers with discount types

### Grocery Stores
- ✅ Store types and product categories configured
- ✅ Opening hours configured
- ✅ Products with units, sizes, stock levels
- ✅ Organic and frozen product flags
- ✅ Featured products
- ✅ Active offers with discount types

## Testing Scenarios

### Food Module
1. **Browse Restaurants**: View all restaurants with ratings and delivery times
2. **View Menus**: Browse menu categories and items
3. **Place Orders**: Add items to cart and checkout
4. **Apply Offers**: Use restaurant offers at checkout
5. **Vendor Dashboard**: Login as vendor to manage menu and orders

### Grocery Module
1. **Browse Stores**: View all grocery stores with ratings
2. **Search Products**: Search by category, name, or brand
3. **Filter Products**: Filter by organic, frozen, price range
4. **Place Orders**: Add products to cart and checkout
5. **Apply Offers**: Use grocery offers at checkout
6. **Vendor Dashboard**: Login as vendor to manage products and orders

## Data Characteristics

- **Realistic Pricing**: Prices in Naira (₦) with compare-at prices for deals
- **Stock Management**: Products have stock levels and minimum stock alerts
- **Location Data**: All stores have latitude/longitude for distance calculations
- **Ratings & Reviews**: Stores have realistic ratings and review counts
- **Active Offers**: All offers are currently active with future expiry dates
- **Featured Items**: Some items are marked as featured for homepage display

## Notes

- All vendors are verified and active
- All stores are open by default
- Products are in stock and active
- Offers are currently active (expire in 10-30 days)
- Location coordinates are for Lagos, Nigeria
- Images use placeholder URLs (replace with actual images in production)
