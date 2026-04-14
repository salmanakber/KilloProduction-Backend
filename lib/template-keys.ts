/**
 * Template Keys - Immutable identifiers for email and SMS templates
 * 
 * USE THESE KEYS IN YOUR CODE instead of hardcoding template names
 * These keys are guaranteed to exist in the database and cannot be deleted
 */

export const EMAIL_TEMPLATE_KEYS = {
  // Global Templates
  GLOBAL: {
    WELCOME_EMAIL: 'GLOBAL_WELCOME_EMAIL',
    RESET_PASSWORD: 'GLOBAL_RESET_PASSWORD',
    EMAIL_VERIFICATION: 'GLOBAL_EMAIL_VERIFICATION',
  },
  
  // Pharmacy Templates
  PHARMACY: {
    ORDER_CONFIRMATION: 'PHARMACY_ORDER_CONFIRMATION',
    PRESCRIPTION_READY: 'PHARMACY_PRESCRIPTION_READY',
    ORDER_SHIPPED: 'PHARMACY_ORDER_SHIPPED',
  },
  
  // Food Templates
  FOOD: {
    ORDER_CONFIRMATION: 'FOOD_ORDER_CONFIRMATION',
  },
  
  // Grocery Templates
  GROCERY: {
    ORDER_CONFIRMATION: 'GROCERY_ORDER_CONFIRMATION',
  },
  
  // Auto Parts Templates
  AUTO_PARTS: {
    ORDER_CONFIRMATION: 'AUTOPARTS_ORDER_CONFIRMATION',
  },
  
  // Riding Templates
  RIDING: {
    RIDE_CONFIRMATION: 'RIDING_RIDE_CONFIRMATION',
    RIDER_ACCOUNT_CREATED: 'RIDER_ACCOUNT_CREATED',
  },
  
  // Delivery Templates
  DELIVERY: {
    ASSIGNMENT: 'DELIVERY_ASSIGNMENT',
  },
  
  // Admin Templates
  ADMIN: {
    NEW_VENDOR: 'ADMIN_NEW_VENDOR',
  },
} as const

export const SMS_TEMPLATE_KEYS = {
  // Global Templates
  GLOBAL: {
    OTP: 'GLOBAL_OTP',
    WELCOME_SMS: 'GLOBAL_WELCOME_SMS',
  },
  
  // Pharmacy Templates
  PHARMACY: {
    ORDER_SHIPPED: 'PHARMACY_ORDER_SHIPPED',
    ORDER_DELIVERED: 'PHARMACY_ORDER_DELIVERED',
    PRESCRIPTION_REMINDER: 'PHARMACY_PRESCRIPTION_REMINDER',
  },
  
  // Food Templates
  FOOD: {
    ORDER_PREPARING: 'FOOD_ORDER_PREPARING',
    ORDER_DELIVERED: 'FOOD_ORDER_DELIVERED',
    DRIVER_ARRIVING: 'FOOD_DRIVER_ARRIVING',
  },
  
  // Grocery Templates
  GROCERY: {
    ORDER_SHIPPED: 'GROCERY_ORDER_SHIPPED',
    SUBSTITUTION_ALERT: 'GROCERY_SUBSTITUTION_ALERT',
  },
  
  // Auto Parts Templates
  AUTO_PARTS: {
    QUOTE_READY: 'AUTOPARTS_QUOTE_READY',
    ORDER_READY: 'AUTOPARTS_ORDER_READY',
  },
  
  // Riding Templates
  RIDING: {
    DRIVER_ASSIGNED: 'RIDING_DRIVER_ASSIGNED',
    RIDE_COMPLETED: 'RIDING_RIDE_COMPLETED',
  },
  
  // Delivery Templates
  DELIVERY: {
    PICKUP_COMPLETE: 'DELIVERY_PICKUP_COMPLETE',
    PAYMENT_RECEIVED: 'DELIVERY_PAYMENT_RECEIVED',
  },
} as const

// Type helpers for type safety
export type EmailTemplateKey = typeof EMAIL_TEMPLATE_KEYS[keyof typeof EMAIL_TEMPLATE_KEYS][keyof typeof EMAIL_TEMPLATE_KEYS[keyof typeof EMAIL_TEMPLATE_KEYS]]
export type SmsTemplateKey = typeof SMS_TEMPLATE_KEYS[keyof typeof SMS_TEMPLATE_KEYS][keyof typeof SMS_TEMPLATE_KEYS[keyof typeof SMS_TEMPLATE_KEYS]]

