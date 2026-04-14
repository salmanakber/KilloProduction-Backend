import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

/**
 * Seed script for Food and Grocery vendors
 * Creates test vendors, restaurants, grocery stores, menu items, products, and offers
 */
async function main() {
  console.log('🌱 Seeding food and grocery data...')

  // Hash password for vendors
  const hashedPassword = await bcrypt.hash('password123', 10)

  // ============================================
  // CREATE FOOD VENDORS & RESTAURANTS
  // ============================================
  console.log('\n📦 Creating food vendors...')

  const foodVendors = await Promise.all([
    // Food Vendor 1 - Italian Restaurant
    prisma.user.upsert({
      where: { email: 'food1@test.com' },
      update: {},
      create: {
        email: 'food1@test.com',
        phone: '+2348011111111',
        name: 'Mario Rossi',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        password: hashedPassword,
        // module: 'FOOD',
        restaurant: {
          create: {
            name: 'Bella Italia Restaurant',
            description: 'Authentic Italian cuisine with fresh ingredients and traditional recipes',
            cuisine: ['Italian', 'Pizza', 'Pasta'],
            address: '123 Victoria Island, Lagos',
            phone: '+2348011111111',
            email: 'info@bellaitalia.com',
            latitude: 6.4281,
            longitude: 3.4219,
            rating: 4.5,
            totalReviews: 120,
            totalOrders: 450,
            priceRange: 'MODERATE',
            deliveryTime: '25-35 min',
            deliveryFee: 500,
            minOrderAmount: 2000,
            maxDeliveryDistance: 10,
            isOpen: true,
            isVerified: true,
            openingHours: {
              monday: { open: '10:00', close: '22:00' },
              tuesday: { open: '10:00', close: '22:00' },
              wednesday: { open: '10:00', close: '22:00' },
              thursday: { open: '10:00', close: '22:00' },
              friday: { open: '10:00', close: '23:00' },
              saturday: { open: '10:00', close: '23:00' },
              sunday: { open: '12:00', close: '21:00' },
            },
            logo: 'https://via.placeholder.com/200?text=Bella+Italia',
            coverImage: 'https://via.placeholder.com/800x400?text=Bella+Italia+Restaurant',
          },
        },
      },
    }),

    // Food Vendor 2 - Fast Food
    prisma.user.upsert({
      where: { email: 'food2@test.com' },
      update: {},
      create: {
        email: 'food2@test.com',
        phone: '+2348022222222',
        name: 'John Burger',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        password: hashedPassword,
        // modules: ['FOOD'],
        restaurant: {
          create: {
            name: 'Burger Express',
            description: 'Fast, fresh, and delicious burgers with crispy fries',
            cuisine: ['Fast Food', 'Burgers', 'American'],
            address: '456 Ikeja, Lagos',
            phone: '+2348022222222',
            email: 'info@burgerexpress.com',
            latitude: 6.5244,
            longitude: 3.3792,
            rating: 4.2,
            totalReviews: 85,
            totalOrders: 320,
            priceRange: 'BUDGET',
            deliveryTime: '15-25 min',
            deliveryFee: 300,
            minOrderAmount: 1500,
            maxDeliveryDistance: 8,
            isOpen: true,
            isVerified: true,
            openingHours: {
              monday: { open: '08:00', close: '23:00' },
              tuesday: { open: '08:00', close: '23:00' },
              wednesday: { open: '08:00', close: '23:00' },
              thursday: { open: '08:00', close: '23:00' },
              friday: { open: '08:00', close: '00:00' },
              saturday: { open: '08:00', close: '00:00' },
              sunday: { open: '10:00', close: '22:00' },
            },
            logo: 'https://via.placeholder.com/200?text=Burger+Express',
            coverImage: 'https://via.placeholder.com/800x400?text=Burger+Express',
          },
        },
      },
    }),

    // Food Vendor 3 - Asian Cuisine
    prisma.user.upsert({
      where: { email: 'food3@test.com' },
      update: {},
      create: {
        email: 'food3@test.com',
        phone: '+2348033333333',
        name: 'Chen Wei',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        password: hashedPassword,
        // modules: ['FOOD'],
        restaurant: {
          create: {
            name: 'Dragon Wok',
            description: 'Authentic Chinese and Asian fusion dishes',
            cuisine: ['Chinese', 'Asian', 'Fusion'],
            address: '789 Lekki Phase 1, Lagos',
            phone: '+2348033333333',
            email: 'info@dragonwok.com',
            latitude: 6.4550,
            longitude: 3.4738,
            rating: 4.7,
            totalReviews: 200,
            totalOrders: 680,
            priceRange: 'MODERATE',
            deliveryTime: '30-40 min',
            deliveryFee: 600,
            minOrderAmount: 2500,
            maxDeliveryDistance: 12,
            isOpen: true,
            isVerified: true,
            openingHours: {
              monday: { open: '11:00', close: '22:00' },
              tuesday: { open: '11:00', close: '22:00' },
              wednesday: { open: '11:00', close: '22:00' },
              thursday: { open: '11:00', close: '22:00' },
              friday: { open: '11:00', close: '23:00' },
              saturday: { open: '11:00', close: '23:00' },
              sunday: { open: '12:00', close: '21:00' },
            },
            logo: 'https://via.placeholder.com/200?text=Dragon+Wok',
            coverImage: 'https://via.placeholder.com/800x400?text=Dragon+Wok',
          },
        },
      },
    }),
  ])

  console.log('✅ Created food vendors:', foodVendors.length)

  // ============================================
  // CREATE MENU CATEGORIES & ITEMS FOR FOOD
  // ============================================
  console.log('\n🍕 Creating menu items...')

  // Get restaurants
  const restaurants = await Promise.all(
    foodVendors.map(v => prisma.restaurant.findUnique({ where: { userId: v.id } }))
  )

  // Menu categories and items for Bella Italia
  const bellaItaliaCategories = await Promise.all([
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurants[0]!.id,
        name: 'Pizza',
        description: 'Authentic Italian pizzas',
        sortOrder: 1,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurants[0]!.id,
        name: 'Pasta',
        description: 'Fresh pasta dishes',
        sortOrder: 2,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurants[0]!.id,
        name: 'Appetizers',
        description: 'Start your meal right',
        sortOrder: 3,
      },
    }),
  ])

  await Promise.all([
    // Pizza items
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[0]!.id,
        categoryId: bellaItaliaCategories[0].id,
        name: 'Margherita Pizza',
        description: 'Classic pizza with tomato, mozzarella, and basil',
        price: 3500,
        compareAtPrice: 4000,
        preparationTime: 20,
        calories: 850,
        images: ['https://via.placeholder.com/400?text=Margherita+Pizza'],
        isVegetarian: true,
        isAvailable: true,
        isFeatured: true,
        isPopular: true,
        spiceLevel: 'MILD',
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[0]!.id,
        categoryId: bellaItaliaCategories[0].id,
        name: 'Pepperoni Pizza',
        description: 'Spicy pepperoni with mozzarella cheese',
        price: 4500,
        compareAtPrice: 5000,
        preparationTime: 20,
        calories: 1100,
        images: ['https://via.placeholder.com/400?text=Pepperoni+Pizza'],
        isAvailable: true,
        isFeatured: true,
        isPopular: true,
        spiceLevel: 'MEDIUM',
      },
    }),
    // Pasta items
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[0]!.id,
        categoryId: bellaItaliaCategories[1].id,
        name: 'Spaghetti Carbonara',
        description: 'Creamy pasta with bacon and parmesan',
        price: 4200,
        compareAtPrice: 4800,
        preparationTime: 15,
        calories: 750,
        images: ['https://via.placeholder.com/400?text=Carbonara'],
        isAvailable: true,
        isFeatured: true,
        spiceLevel: 'MILD',
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[0]!.id,
        categoryId: bellaItaliaCategories[1].id,
        name: 'Fettuccine Alfredo',
        description: 'Rich and creamy fettuccine pasta',
        price: 4000,
        compareAtPrice: 4500,
        preparationTime: 15,
        calories: 800,
        images: ['https://via.placeholder.com/400?text=Alfredo'],
        isVegetarian: true,
        isAvailable: true,
        spiceLevel: 'MILD',
      },
    }),
  ])

  // Menu items for Burger Express
  const burgerCategories = await Promise.all([
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurants[1]!.id,
        name: 'Burgers',
        description: 'Juicy burgers',
        sortOrder: 1,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurants[1]!.id,
        name: 'Sides',
        description: 'Fries and more',
        sortOrder: 2,
      },
    }),
  ])

  await Promise.all([
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[1]!.id,
        categoryId: burgerCategories[0].id,
        name: 'Classic Burger',
        description: 'Beef patty, lettuce, tomato, onion, special sauce',
        price: 2500,
        compareAtPrice: 3000,
        preparationTime: 10,
        calories: 650,
        images: ['https://via.placeholder.com/400?text=Classic+Burger'],
        isAvailable: true,
        isFeatured: true,
        isPopular: true,
        spiceLevel: 'MILD',
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[1]!.id,
        categoryId: burgerCategories[0].id,
        name: 'Cheese Burger',
        description: 'Classic burger with melted cheese',
        price: 2800,
        compareAtPrice: 3200,
        preparationTime: 10,
        calories: 720,
        images: ['https://via.placeholder.com/400?text=Cheese+Burger'],
        isAvailable: true,
        isFeatured: true,
        spiceLevel: 'MILD',
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[1]!.id,
        categoryId: burgerCategories[1].id,
        name: 'French Fries',
        description: 'Crispy golden fries',
        price: 800,
        compareAtPrice: 1000,
        preparationTime: 5,
        calories: 320,
        images: ['https://via.placeholder.com/400?text=French+Fries'],
        isVegetarian: true,
        isAvailable: true,
        spiceLevel: 'MILD',
      },
    }),
  ])

  // Menu items for Dragon Wok
  const dragonWokCategories = await Promise.all([
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurants[2]!.id,
        name: 'Main Dishes',
        description: 'Signature dishes',
        sortOrder: 1,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurants[2]!.id,
        name: 'Rice & Noodles',
        description: 'Fried rice and noodles',
        sortOrder: 2,
      },
    }),
  ])

  await Promise.all([
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[2]!.id,
        categoryId: dragonWokCategories[0].id,
        name: 'Sweet and Sour Chicken',
        description: 'Crispy chicken with sweet and sour sauce',
        price: 4500,
        compareAtPrice: 5200,
        preparationTime: 20,
        calories: 680,
        images: ['https://via.placeholder.com/400?text=Sweet+Sour+Chicken'],
        isAvailable: true,
        isFeatured: true,
        isPopular: true,
        spiceLevel: 'MILD',
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurants[2]!.id,
        categoryId: dragonWokCategories[1].id,
        name: 'Fried Rice',
        description: 'Special fried rice with vegetables and egg',
        price: 3000,
        compareAtPrice: 3500,
        preparationTime: 15,
        calories: 550,
        images: ['https://via.placeholder.com/400?text=Fried+Rice'],
        isAvailable: true,
        isFeatured: true,
        spiceLevel: 'MILD',
      },
    }),
  ])

  console.log('✅ Created menu items')

  // ============================================
  // CREATE RESTAURANT OFFERS
  // ============================================
  console.log('\n🎁 Creating restaurant offers...')

  await Promise.all([
    prisma.restaurantOffer.create({
      data: {
        restaurantId: restaurants[0]!.id,
        title: '20% Off All Pizzas',
        description: 'Get 20% discount on all pizza orders',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderAmount: 5000,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        images: ['https://via.placeholder.com/400?text=Pizza+Offer'],
      },
    }),
    prisma.restaurantOffer.create({
      data: {
        restaurantId: restaurants[1]!.id,
        title: 'Buy 2 Get 1 Free',
        description: 'Buy 2 burgers, get 1 free',
        discountType: 'FIXED_AMOUNT',
        discountValue: 2500,
        minOrderAmount: 5000,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
        images: ['https://via.placeholder.com/400?text=Burger+Offer'],
      },
    }),
  ])

  console.log('✅ Created restaurant offers')

  // ============================================
  // CREATE GROCERY VENDORS & STORES
  // ============================================
  console.log('\n🛒 Creating grocery vendors...')

  const groceryVendors = await Promise.all([
    // Grocery Vendor 1
    prisma.user.upsert({
      where: { email: 'grocery1@test.com' },
      update: {},
      create: {
        email: 'grocery1@test.com',
        phone: '+2348044444444',
        name: 'Sarah Market',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        password: hashedPassword,
        // modules: ['GROCERY'],
        groceryStore: {
          create: {
            storeName: 'Fresh Mart',
            description: 'Your neighborhood grocery store with fresh produce and daily essentials',
            address: '321 Surulere, Lagos',
            phone: '+2348044444444',
            email: 'info@freshmart.com',
            latitude: 6.4924,
            longitude: 3.3434,
            rating: 4.3,
            totalReviews: 95,
            totalOrders: 280,
            deliveryFee: 400,
            minOrderAmount: 1500,
            maxDeliveryDistance: 8,
            isOpen: true,
            isVerified: true,
            storeType: ['Supermarket', 'Fresh Produce'],
            productCategories: ['Fruits', 'Vegetables', 'Dairy', 'Beverages'],
            openingHours: {
              monday: { open: '07:00', close: '21:00' },
              tuesday: { open: '07:00', close: '21:00' },
              wednesday: { open: '07:00', close: '21:00' },
              thursday: { open: '07:00', close: '21:00' },
              friday: { open: '07:00', close: '22:00' },
              saturday: { open: '08:00', close: '22:00' },
              sunday: { open: '09:00', close: '20:00' },
            },
            logo: 'https://via.placeholder.com/200?text=Fresh+Mart',
            coverImage: 'https://via.placeholder.com/800x400?text=Fresh+Mart',
          },
        },
      },
    }),

    // Grocery Vendor 2
    prisma.user.upsert({
      where: { email: 'grocery2@test.com' },
      update: {},
      create: {
        email: 'grocery2@test.com',
        phone: '+2348055555555',
        name: 'Mike Store',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        password: hashedPassword,
        // modules: ['GROCERY'],
        groceryStore: {
          create: {
            storeName: 'Organic Groceries',
            description: 'Premium organic and natural products',
            address: '654 Gbagada, Lagos',
            phone: '+2348055555555',
            email: 'info@organicgroceries.com',
            latitude: 6.5481,
            longitude: 3.3792,
            rating: 4.6,
            totalReviews: 150,
            totalOrders: 420,
            deliveryFee: 500,
            minOrderAmount: 2000,
            maxDeliveryDistance: 10,
            isOpen: true,
            isVerified: true,
            storeType: ['Organic', 'Health Food'],
            productCategories: ['Organic Fruits', 'Organic Vegetables', 'Health Products'],
            openingHours: {
              monday: { open: '08:00', close: '20:00' },
              tuesday: { open: '08:00', close: '20:00' },
              wednesday: { open: '08:00', close: '20:00' },
              thursday: { open: '08:00', close: '20:00' },
              friday: { open: '08:00', close: '21:00' },
              saturday: { open: '09:00', close: '21:00' },
              sunday: { open: '10:00', close: '19:00' },
            },
            logo: 'https://via.placeholder.com/200?text=Organic+Groceries',
            coverImage: 'https://via.placeholder.com/800x400?text=Organic+Groceries',
          },
        },
      },
    }),

    // Grocery Vendor 3
    prisma.user.upsert({
      where: { email: 'grocery3@test.com' },
      update: {},
      create: {
        email: 'grocery3@test.com',
        phone: '+2348066666666',
        name: 'Amina Shop',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        password: hashedPassword,
        // modules: ['GROCERY'],
        groceryStore: {
          create: {
            storeName: 'Quick Shop',
            description: 'Fast delivery grocery store for your daily needs',
            address: '987 Yaba, Lagos',
            phone: '+2348066666666',
            email: 'info@quickshop.com',
            latitude: 6.4989,
            longitude: 3.3779,
            rating: 4.1,
            totalReviews: 70,
            totalOrders: 190,
            deliveryFee: 350,
            minOrderAmount: 1000,
            maxDeliveryDistance: 6,
            isOpen: true,
            isVerified: true,
            storeType: ['Convenience Store'],
            productCategories: ['Snacks', 'Beverages', 'Household', 'Personal Care'],
            openingHours: {
              monday: { open: '06:00', close: '23:00' },
              tuesday: { open: '06:00', close: '23:00' },
              wednesday: { open: '06:00', close: '23:00' },
              thursday: { open: '06:00', close: '23:00' },
              friday: { open: '06:00', close: '00:00' },
              saturday: { open: '07:00', close: '00:00' },
              sunday: { open: '08:00', close: '22:00' },
            },
            logo: 'https://via.placeholder.com/200?text=Quick+Shop',
            coverImage: 'https://via.placeholder.com/800x400?text=Quick+Shop',
          },
        },
      },
    }),
  ])

  console.log('✅ Created grocery vendors:', groceryVendors.length)

  // ============================================
  // CREATE GROCERY PRODUCTS
  // ============================================
  console.log('\n🥬 Creating grocery products...')

  // Get grocery stores
  const groceryStores = await Promise.all(
    groceryVendors.map(v => prisma.groceryStore.findUnique({ where: { userId: v.id } }))
  )

  // Products for Fresh Mart
  await Promise.all([
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[0]!.id,
        name: 'Fresh Tomatoes',
        description: 'Fresh red tomatoes, 1kg',
        brand: 'Farm Fresh',
        category: 'Vegetables',
        subcategory: 'Fresh Produce',
        price: 800,
        compareAtPrice: 1000,
        unit: 'kg',
        unitSize: 1,
        stock: 150,
        minStock: 20,
        isOrganic: false,
        isFrozen: false,
        isActive: true,
        isFeatured: true,
        images: ['https://via.placeholder.com/400?text=Tomatoes'],
      },
    }),
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[0]!.id,
        name: 'Fresh Bananas',
        description: 'Sweet yellow bananas, 1kg',
        brand: 'Tropical',
        category: 'Fruits',
        subcategory: 'Fresh Produce',
        price: 600,
        compareAtPrice: 750,
        unit: 'kg',
        unitSize: 1,
        stock: 200,
        minStock: 30,
        isOrganic: false,
        isFrozen: false,
        isActive: true,
        isFeatured: true,
        images: ['https://via.placeholder.com/400?text=Bananas'],
      },
    }),
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[0]!.id,
        name: 'Fresh Milk',
        description: 'Whole milk, 1 liter',
        brand: 'Dairy Fresh',
        category: 'Dairy',
        subcategory: 'Milk',
        price: 1200,
        compareAtPrice: 1400,
        unit: 'liter',
        unitSize: 1,
        stock: 80,
        minStock: 15,
        isOrganic: false,
        isFrozen: false,
        isActive: true,
        isFeatured: false,
        images: ['https://via.placeholder.com/400?text=Milk'],
      },
    }),
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[0]!.id,
        name: 'Coca Cola',
        description: 'Carbonated soft drink, 500ml',
        brand: 'Coca Cola',
        category: 'Beverages',
        subcategory: 'Soft Drinks',
        price: 300,
        compareAtPrice: 350,
        unit: 'bottle',
        unitSize: 0.5,
        stock: 500,
        minStock: 50,
        isOrganic: false,
        isFrozen: false,
        isActive: true,
        isFeatured: false,
        images: ['https://via.placeholder.com/400?text=Coca+Cola'],
      },
    }),
  ])

  // Products for Organic Groceries
  await Promise.all([
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[1]!.id,
        name: 'Organic Apples',
        description: 'Certified organic red apples, 1kg',
        brand: 'Organic Farm',
        category: 'Organic Fruits',
        subcategory: 'Fresh Produce',
        price: 2500,
        compareAtPrice: 3000,
        unit: 'kg',
        unitSize: 1,
        stock: 60,
        minStock: 10,
        isOrganic: true,
        isFrozen: false,
        isActive: true,
        isFeatured: true,
        images: ['https://via.placeholder.com/400?text=Organic+Apples'],
      },
    }),
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[1]!.id,
        name: 'Organic Spinach',
        description: 'Fresh organic spinach, 500g',
        brand: 'Green Leaf',
        category: 'Organic Vegetables',
        subcategory: 'Leafy Greens',
        price: 1500,
        compareAtPrice: 1800,
        unit: 'pack',
        unitSize: 0.5,
        stock: 40,
        minStock: 8,
        isOrganic: true,
        isFrozen: false,
        isActive: true,
        isFeatured: true,
        images: ['https://via.placeholder.com/400?text=Organic+Spinach'],
      },
    }),
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[1]!.id,
        name: 'Organic Honey',
        description: 'Pure organic honey, 500g',
        brand: 'Bee Natural',
        category: 'Health Products',
        subcategory: 'Natural Products',
        price: 3500,
        compareAtPrice: 4000,
        unit: 'jar',
        unitSize: 0.5,
        stock: 25,
        minStock: 5,
        isOrganic: true,
        isFrozen: false,
        isActive: true,
        isFeatured: false,
        images: ['https://via.placeholder.com/400?text=Organic+Honey'],
      },
    }),
  ])

  // Products for Quick Shop
  await Promise.all([
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[2]!.id,
        name: 'Potato Chips',
        description: 'Crispy potato chips, 150g',
        brand: 'Crunchy',
        category: 'Snacks',
        subcategory: 'Chips',
        price: 500,
        compareAtPrice: 600,
        unit: 'pack',
        unitSize: 0.15,
        stock: 300,
        minStock: 40,
        isOrganic: false,
        isFrozen: false,
        isActive: true,
        isFeatured: true,
        images: ['https://via.placeholder.com/400?text=Potato+Chips'],
      },
    }),
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[2]!.id,
        name: 'Bottled Water',
        description: 'Pure drinking water, 500ml',
        brand: 'Pure Water',
        category: 'Beverages',
        subcategory: 'Water',
        price: 150,
        compareAtPrice: 200,
        unit: 'bottle',
        unitSize: 0.5,
        stock: 1000,
        minStock: 100,
        isOrganic: false,
        isFrozen: false,
        isActive: true,
        isFeatured: false,
        images: ['https://via.placeholder.com/400?text=Bottled+Water'],
      },
    }),
    prisma.groceryProduct.create({
      data: {
        storeId: groceryStores[2]!.id,
        name: 'Bread Loaf',
        description: 'Fresh white bread, 500g',
        brand: 'Bakery Fresh',
        category: 'Household',
        subcategory: 'Bakery',
        price: 400,
        compareAtPrice: 500,
        unit: 'loaf',
        unitSize: 0.5,
        stock: 120,
        minStock: 20,
        isOrganic: false,
        isFrozen: false,
        isActive: true,
        isFeatured: false,
        images: ['https://via.placeholder.com/400?text=Bread'],
      },
    }),
  ])

  console.log('✅ Created grocery products')

  // ============================================
  // CREATE GROCERY OFFERS
  // ============================================
  console.log('\n🎁 Creating grocery offers...')

  await Promise.all([
    prisma.groceryOffer.create({
      data: {
        storeId: groceryStores[0]!.id,
        title: '15% Off Fresh Produce',
        description: 'Get 15% discount on all fresh fruits and vegetables',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        minOrderAmount: 3000,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days
        images: ['https://via.placeholder.com/400?text=Produce+Offer'],
      },
    }),
    prisma.groceryOffer.create({
      data: {
        storeId: groceryStores[1]!.id,
        title: 'Buy 2 Get 1 Free Organic Products',
        description: 'Buy 2 organic items, get 1 free',
        discountType: 'FIXED_AMOUNT',
        discountValue: 1500,
        minOrderAmount: 5000,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days
        images: ['https://via.placeholder.com/400?text=Organic+Offer'],
      },
    }),
    prisma.groceryOffer.create({
      data: {
        storeId: groceryStores[2]!.id,
        title: '10% Off All Snacks',
        description: 'Save 10% on all snack items',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderAmount: 2000,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
        images: ['https://via.placeholder.com/400?text=Snacks+Offer'],
      },
    }),
  ])

  console.log('✅ Created grocery offers')

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n✨ Seeding completed successfully!')
  console.log('\n📊 Summary:')
  console.log(`   ✅ Food Vendors: ${foodVendors.length}`)
  console.log(`   ✅ Restaurants: ${restaurants.length}`)
  console.log(`   ✅ Grocery Vendors: ${groceryVendors.length}`)
  console.log(`   ✅ Grocery Stores: ${groceryStores.length}`)
  console.log('\n🔑 Test Credentials:')
  console.log('   Food Vendors:')
  console.log('     - food1@test.com / password123')
  console.log('     - food2@test.com / password123')
  console.log('     - food3@test.com / password123')
  console.log('   Grocery Vendors:')
  console.log('     - grocery1@test.com / password123')
  console.log('     - grocery2@test.com / password123')
  console.log('     - grocery3@test.com / password123')
  console.log('\n')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
