export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: "CUSTOMER" | "VENDOR" | "RIDER" | "WHOLESALER" | "ADMIN" | "SUPER_ADMIN"
  module?: "PHARMACY" | "AUTO_PARTS" | "FOOD" | "GROCERY" | "RIDING"
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING"
  isVerified: boolean
  joinedAt: string
  lastActive: string
  location: string
  totalOrders: number
  totalSpent: number
  rating: number
  avatar?: string
  // Additional fields for detailed view
  userProfile?: {
    id: string
    userId: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
    dateOfBirth?: string
    gender?: string
  }
  autoPartsStore?: {
    id: string
    businessName: string
    businessType: string
    registrationNumber: string
    address: string
    status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
    isVerified: boolean
    specializations: string[]
    brandsCarried: string[]
  }
  pharmacy?: {
    id: string
    name: string
    licenseNumber: string
    address: string
    status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
    isVerified: boolean
    specializations: string[]
    medicineOrigins: string[]
  }
  restaurant?: {
    id: string
    name: string
    cuisine: string
    address: string
    status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
    isVerified: boolean
  }
  groceryStore?: {
    id: string
    name: string
    address: string
    status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
    isVerified: boolean
  }
  riderProfile?: {
    id: string
    vehicleType: string
    licenseNumber: string
    isApproved: boolean
    isVerified: boolean
    totalRides: number
    totalEarnings: number
    rating: number
  }
  customerOrders?: Array<{
    id: string
    totalAmount: number
    status: string
    createdAt: string
    module: string
  }>
  vendorOrders?: Array<{
    id: string
    totalAmount: number
    status: string
    createdAt: string
    module: string
  }>
}

export interface UserProfile {
  id: string
  firstName?: string
  lastName?: string
  dateOfBirth?: string
  gender?: "MALE" | "FEMALE" | "OTHER"
  bio?: string
  profileImage?: string
  emergencyContact?: string
}

export interface UserSettings {
  id: string
  pushNotifications: boolean
  emailNotifications: boolean
  smsNotifications: boolean
  locationTracking: boolean
  language: string
  currency: string
  theme: string
}

export interface Wallet {
  id: string
  balance: number
  currency: string
  isActive: boolean
}

export interface Address {
  id: string
  type: "HOME" | "WORK" | "OTHER"
  title: string
  street: string
  city: string
  state: string
  country: string
  postalCode: string
  latitude?: number
  longitude?: number
  isDefault: boolean
  instructions?: string
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string
  vendorId?: string
  riderId?: string
  module: "AUTO_PARTS" | "PHARMACY" | "FOOD" | "GROCERY" | "RIDING"
  status: OrderStatus
  subtotal: number
  deliveryFee: number
  serviceFee: number
  tax: number
  discount: number
  total: number
  paymentStatus: PaymentStatus
  deliveryType: "STANDARD" | "EXPRESS" | "SCHEDULED" | "PICKUP"
  estimatedDelivery?: string
  actualDelivery?: string
  trackingNumber?: string
  notes?: string
  items: OrderItem[]
  tracking: OrderTracking[]
  createdAt: string
  updatedAt: string
}

export interface OrderItem {
  id: string
  productId: string
  productType: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  notes?: string
  customizations?: any
}

export interface OrderTracking {
  id: string
  status: OrderStatus
  location?: string
  latitude?: number
  longitude?: number
  notes?: string
  timestamp: string
}

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED"

export interface AutoPart {
  id: string
  name: string
  description?: string
  partNumber?: string
  brand: string
  model: string
  year: string
  partType: string
  category: string
  condition: "NEW" | "USED_LIKE_NEW" | "USED_GOOD" | "USED_FAIR" | "REFURBISHED"
  price: number
  compareAtPrice?: number
  stock: number
  images: string[]
  specifications?: any
  warranty?: string
  isActive: boolean
  isFeatured: boolean
  tags: string[]
  store: {
    storeName: string
    rating: number
    isVerified: boolean
    deliveryZones: string[]
  }
}

export interface Medicine {
  id: string
  name: string
  genericName?: string
  brand?: string
  manufacturer?: string
  dosage: string
  form: MedicineForm
  strength?: string
  category: string
  price: number
  compareAtPrice?: number
  stock: number
  expiryDate: string
  activeIngredients: string[]
  sideEffects: string[]
  contraindications: string[]
  storageInstructions?: string
  images: string[]
  isPrescriptionRequired: boolean
  isControlled: boolean
  isActive: boolean
  isFeatured: boolean
  tags: string[]
  pharmacy: {
    pharmacyName: string
    rating: number
    isVerified: boolean
    is24Hours: boolean
    deliveryAvailable: boolean
  }
}

export type MedicineForm =
  | "TABLET"
  | "CAPSULE"
  | "SYRUP"
  | "INJECTION"
  | "CREAM"
  | "OINTMENT"
  | "DROPS"
  | "INHALER"
  | "PATCH"
  | "SUPPOSITORY"

export interface Restaurant {
  id: string
  name: string
  description?: string
  cuisine: string[]
  address: string
  phone: string
  logo?: string
  coverImage?: string
  images: string[]
  rating: number
  totalReviews: number
  priceRange: "BUDGET" | "MODERATE" | "EXPENSIVE" | "LUXURY"
  deliveryTime: string
  deliveryFee: number
  minOrderAmount: number
  maxDeliveryDistance: number
  isOpen: boolean
  isVerified: boolean
  deliveryZones: string[]
  specialDiets: string[]
  features: string[]
  openingHours: any
}

export interface MenuItem {
  id: string
  restaurantId: string
  categoryId?: string
  name: string
  description?: string
  price: number
  compareAtPrice?: number
  preparationTime: number
  calories?: number
  ingredients: string[]
  allergens: string[]
  spiceLevel: "NONE" | "MILD" | "MEDIUM" | "HOT" | "EXTRA_HOT"
  images: string[]
  isVegetarian: boolean
  isVegan: boolean
  isGlutenFree: boolean
  isAvailable: boolean
  isFeatured: boolean
  isPopular: boolean
  tags: string[]
  customizations?: any
}

export interface CartItem {
  id: string
  productId: string
  productType: string
  productName: string
  quantity: number
  price: number
  notes?: string
  customizations?: any
  image?: string
}

export interface Notification {
  id: string
  title: string
  message: string
  type: "ORDER_UPDATE" | "PROMOTION" | "REMINDER" | "SYSTEM" | "CHAT_MESSAGE"
  module?: string
  data?: any
  imageUrl?: string
  actionUrl?: string
  isRead: boolean
  createdAt: string
}

export interface GroceryProduct {
  id: string
  name: string
  description?: string
  brand?: string
  category: string
  subcategory?: string
  price: number
  compareAtPrice?: number
  unit: string
  unitSize?: number
  stock: number
  barcode?: string
  sku?: string
  weight?: number
  images: string[]
  nutritionFacts?: any
  ingredients: string[]
  allergens: string[]
  expiryDate?: string
  isOrganic: boolean
  isFrozen: boolean
  isActive: boolean
  isFeatured: boolean
  tags: string[]
  store: {
    id: string
    storeName: string
    rating: number
    isVerified: boolean
    deliveryFee: number
    minOrderAmount: number
  }
}

export interface CourierBooking {
  id: string
  bookingNumber: string
  customerId: string
  riderId?: string
  pickupAddress: string
  pickupLatitude: number
  pickupLongitude: number
  dropAddress: string
  dropLatitude: number
  dropLongitude: number
  distance: number
  estimatedTime: number
  fare: number
  status: CourierStatus
  paymentStatus: PaymentStatus
  paymentMethod?: string
  notes?: string
  recipientName?: string
  recipientPhone?: string
  packageType?: string
  packageWeight?: number
  isFragile: boolean
  scheduledAt?: string
  pickedUpAt?: string
  deliveredAt?: string
  cancelledAt?: string
  customer: {
    name: string
    phone: string
  }
  rider?: {
    name: string
    phone: string
    riderProfile: {
      vehicleType: string
      licensePlate: string
      rating: number
    }
  }
  trackingUpdates: CourierTracking[]
  createdAt: string
  updatedAt: string
}

export interface CourierTracking {
  id: string
  bookingId: string
  status: CourierStatus
  latitude?: number
  longitude?: number
  notes?: string
  timestamp: string
}

export type CourierStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "RIDER_ASSIGNED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"

export interface RiderProfile {
  id: string
  userId: string
  vehicleType: "BICYCLE" | "MOTORCYCLE" | "SCOOTER" | "CAR" | "VAN" | "TRUCK"
  vehicleBrand?: string
  vehicleModel?: string
  vehicleYear?: string
  vehicleColor?: string
  licensePlate: string
  licenseNumber: string
  licenseExpiry: string
  insurance?: string
  insuranceExpiry?: string
  modules: string[]
  isAvailable: boolean
  currentLocation?: any
  rating: number
  totalDeliveries: number
  totalEarnings: number
  isVerified: boolean
  isActive: boolean
  workingHours?: any
  deliveryZones: string[]
  emergencyContact?: string
  bankDetails?: any
  documents?: any
}

export interface GroceryStore {
  id: string
  storeName: string
  description?: string
  address: string
  phone: string
  email?: string
  website?: string
  logo?: string
  coverImage?: string
  rating: number
  totalReviews: number
  totalOrders: number
  deliveryFee: number
  minOrderAmount: number
  maxDeliveryDistance: number
  isOpen: boolean
  isVerified: boolean
  openingHours: any
  deliveryZones: string[]
  storeType: string[]
}

export interface Campaign {
  id: string
  name: string
  type: "EMAIL" | "SMS" | "PUSH_NOTIFICATION"
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED"
  targetSegmentId?: string
  scheduledAt?: string
  sentAt?: string
  subject?: string
  body: string
  metrics: {
    sent: number
    opened: number
    clicked: number
    converted: number
  }
  createdAt: string
  updatedAt: string
}

export interface Segment {
  id: string
  name: string
  description?: string
  criteria: any // JSON object defining segmentation rules
  userCount: number
  createdAt: string
  updatedAt: string
}

export interface AutomationRule {
  id: string
  name: string
  trigger: string // e.g., "USER_REGISTERED", "ORDER_COMPLETED"
  action: string // e.g., "SEND_WELCOME_EMAIL", "ADD_TO_SEGMENT"
  status: "ACTIVE" | "INACTIVE"
  createdAt: string
  updatedAt: string
}
