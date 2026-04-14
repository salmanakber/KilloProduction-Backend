#!/usr/bin/env node

/**
 * SuperKillo Payment System Seeding Script
 * 
 * This script seeds the database with:
 * - Payment gateway settings
 * - Supported currencies
 * - Default admin user
 * 
 * Usage:
 *   node scripts/seed-payments.js
 * 
 * Environment Variables Required:
 *   - STRIPE_SECRET_KEY (optional)
 *   - STRIPE_PUBLISHABLE_KEY (optional)
 *   - PAYSTACK_SECRET_KEY (optional)
 *   - PAYSTACK_PUBLIC_KEY (optional)
 *   - FIRSTMONIE_SECRET_KEY (optional)
 *   - FIRSTMONIE_PUBLIC_KEY (optional)
 */

const { execSync } = require('child_process');
const path = require('path');

async function runSeeding() {
  try {
    console.log('🌱 Starting SuperKillo Payment System Seeding...');
    console.log('');

    // Check if we're in the right directory
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    try {
      const packageJson = require(packageJsonPath);
      if (!packageJson.dependencies || !packageJson.dependencies['@prisma/client']) {
        throw new Error('Prisma client not found');
      }
    } catch (error) {
      console.error('❌ Error: This script must be run from the backend-data directory');
      console.error('   Make sure you have package.json with @prisma/client dependency');
      process.exit(1);
    }

    // Run the TypeScript seeding script
    console.log('📦 Running payment settings seed...');
    execSync('npx ts-node prisma/seed-payment-settings.ts', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });

    console.log('');
    console.log('✅ Payment system seeding completed successfully!');
    console.log('');
    console.log('📋 What was seeded:');
    console.log('   ✓ Payment gateway settings');
    console.log('   ✓ Supported currencies (NGN, USD, EUR, GBP, GHS, ZAR, KES)');
    console.log('   ✓ Default admin user (admin@superkillo.com)');
    console.log('');
    console.log('🔧 To configure payment gateways:');
    console.log('   1. Set API keys in environment variables');
    console.log('   2. Or use the admin API to update settings');
    console.log('   3. Test payment flows');
    console.log('');
    console.log('⚠️  Important: Change the default admin password!');

  } catch (error) {
    console.error('💥 Seeding failed:', error.message);
    process.exit(1);
  }
}

// Check if ts-node is available
try {
  require.resolve('ts-node');
} catch (error) {
  console.error('❌ Error: ts-node is required to run this script');
  console.error('   Install it with: npm install -g ts-node');
  console.error('   Or run: npm install ts-node --save-dev');
  process.exit(1);
}

runSeeding();


