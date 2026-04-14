# Payment System Seeding Guide

This guide explains how to seed your SuperKillo database with payment gateway settings and default configurations.

## 🚀 Quick Start

### 1. Run the Seeding Script

```bash
# From the backend-data directory
node scripts/seed-payments.js
```

### 2. Alternative: Direct TypeScript Execution

```bash
# If you have ts-node installed
npx ts-node prisma/seed-payment-settings.ts
```

## 📋 What Gets Seeded

### Payment Gateway Settings
- **Stripe**: Configuration for Stripe payment processing
- **Paystack**: Configuration for Paystack payment processing  
- **Firstmonie**: Configuration for Firstmonie payment processing

### Currencies
- **NGN**: Nigerian Naira (Default)
- **USD**: US Dollar
- **EUR**: Euro
- **GBP**: British Pound
- **GHS**: Ghanaian Cedi
- **ZAR**: South African Rand
- **KES**: Kenyan Shilling

### Default Admin User
- **Email**: admin@superkillo.com
- **Password**: password
- **Role**: ADMIN

## 🔧 Environment Variables

Set these environment variables to enable payment gateways:

### Stripe
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Paystack
```env
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
```

### Firstmonie
```env
FIRSTMONIE_SECRET_KEY=sk_live_...
FIRSTMONIE_PUBLIC_KEY=pk_live_...
```

## 📊 Payment Settings Configuration

The seeding script creates a comprehensive payment configuration:

```json
{
  "stripe": {
    "secretKey": "sk_live_...",
    "publishableKey": "pk_live_...",
    "webhookSecret": "whsec_...",
    "isEnabled": true,
    "description": "Stripe - Global payment processor"
  },
  "paystack": {
    "secretKey": "sk_live_...",
    "publicKey": "pk_live_...",
    "isEnabled": true,
    "description": "Paystack - African payment processor"
  },
  "firstmonie": {
    "secretKey": "sk_live_...",
    "publicKey": "pk_live_...",
    "isEnabled": true,
    "description": "Firstmonie - Nigerian payment processor"
  }
}
```

## 🛠️ Managing Payment Settings

### Via Admin API

```bash
# Get current settings
curl -X GET /api/admin/payment-gateway-settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Update settings
curl -X POST /api/admin/payment-gateway-settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stripe": {
      "secretKey": "sk_live_...",
      "publishableKey": "pk_live_..."
    }
  }'
```

### Via Database

```sql
-- View current settings
SELECT paymentMethods FROM settings WHERE id = 'default';

-- Update settings
UPDATE settings 
SET paymentMethods = '{"stripe": {...}}' 
WHERE id = 'default';
```

## 🔍 Verification

After seeding, verify the configuration:

### 1. Check Payment Gateways API

```bash
curl -X GET /api/payments/payment-gateways?currency=NGN
```

Expected response:
```json
{
  "gateways": [
    {
      "id": "STRIPE",
      "name": "Stripe",
      "fees": {"percentage": 2.9, "fixed": 30},
      "supportedCurrencies": ["USD", "EUR", "GBP", "NGN"],
      "publicKey": "pk_live_..."
    }
  ],
  "defaultCurrency": "NGN"
}
```

### 2. Check Currencies API

```bash
curl -X GET /api/currencies
```

### 3. Test Admin Login

```bash
curl -X POST /api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@superkillo.com",
    "password": "password"
  }'
```

## ⚠️ Security Notes

1. **Change Default Admin Password**: The default admin password is "password" - change it immediately!
2. **Use Environment Variables**: Never commit API keys to your repository
3. **Use Production Keys**: Make sure to use live/production API keys for production
4. **Webhook Security**: Configure webhook secrets for payment verification

## 🐛 Troubleshooting

### Common Issues

1. **"ts-node not found"**
   ```bash
   npm install -g ts-node
   # or
   npm install ts-node --save-dev
   ```

2. **"Prisma client not found"**
   ```bash
   npx prisma generate
   ```

3. **"No payment gateways enabled"**
   - Check environment variables are set
   - Verify API keys are valid
   - Run seeding script again

4. **Database connection issues**
   - Check DATABASE_URL in .env
   - Ensure database is running
   - Run `npx prisma db push` if needed

### Logs

The seeding script provides detailed logs:
- ✅ Success messages for each step
- ⚠️ Warnings for missing configurations
- ❌ Error messages with troubleshooting hints

## 📞 Support

If you encounter issues:
1. Check the console output for error messages
2. Verify your environment variables
3. Ensure your database is properly configured
4. Check the Prisma schema matches your database

## 🔄 Re-seeding

To re-seed the database:

```bash
# This will update existing settings
node scripts/seed-payments.js
```

The script uses `upsert` operations, so it's safe to run multiple times.


