# Template Management System

## Overview

The template management system allows administrators to create, update, and manage email and SMS templates with dynamic variables. This ensures consistent messaging across the platform while allowing easy customization.

## Features

### Email Templates
- HTML and plain text content support
- Dynamic variable replacement
- Category-based organization
- Active/inactive status
- Usage tracking (last used timestamp)
- Rich text editor-ready

### SMS Templates
- Character limit enforcement
- Dynamic variable replacement
- Category-based organization
- Active/inactive status
- Usage tracking
- Multiple SMS lengths (160, 320, 480, etc.)

## Database Models

### EmailTemplate
```prisma
model EmailTemplate {
  id          String   @id @default(cuid())
  name        String   @unique
  subject     String
  htmlContent String   @db.Text
  textContent String?  @db.Text
  variables   Json     // Array of variable names
  category    String
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?
  lastUsedAt  DateTime?
}
```

### SmsTemplate
```prisma
model SmsTemplate {
  id          String   @id @default(cuid())
  name        String   @unique
  content     String   @db.Text
  variables   Json     // Array of variable names
  category    String
  description String?
  isActive    Boolean  @default(true)
  maxLength   Int      @default(160)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?
  lastUsedAt  DateTime?
}
```

## API Endpoints

### Email Templates

#### GET /api/admin/templates/email
- Fetch all email templates
- Query params: `category`, `isActive`

#### POST /api/admin/templates/email
- Create new email template
- Body: `{ name, subject, htmlContent, textContent, variables, category, description, isActive }`

#### PUT /api/admin/templates/email/[id]
- Update existing email template

#### DELETE /api/admin/templates/email/[id]
- Delete email template

#### GET /api/admin/templates/email/by-name/[name]
- Get template by name

### SMS Templates

#### GET /api/admin/templates/sms
- Fetch all SMS templates
- Query params: `category`, `isActive`

#### POST /api/admin/templates/sms
- Create new SMS template
- Body: `{ name, content, variables, category, description, isActive, maxLength }`

#### PUT /api/admin/templates/sms/[id]
- Update existing SMS template

#### DELETE /api/admin/templates/sms/[id]
- Delete SMS template

#### GET /api/admin/templates/sms/by-name/[name]
- Get template by name

## Usage Examples

### Sending Email from Template

```typescript
import { sendEmailFromTemplate } from '@/lib/email'

// Send email using template
await sendEmailFromTemplate(
  'user@example.com',
  'order_confirmation',
  {
    customerName: 'John Doe',
    orderNumber: 'ORD-12345',
    totalAmount: '$99.99',
    deliveryDate: 'Jan 25, 2025'
  }
)
```

### Sending SMS from Template

```typescript
import { sendSMSFromTemplate } from '@/lib/twilio'

// Send SMS using template
await sendSMSFromTemplate(
  '+1234567890',
  'order_shipped',
  {
    customerName: 'John',
    orderNumber: 'ORD-12345',
    trackingUrl: 'https://track.killo.com/12345'
  }
)
```

### Variable Replacement

Templates use `{{variable_name}}` syntax for dynamic content:

**Template:**
```
Hi {{customerName}}, your order {{orderNumber}} has been confirmed!
```

**Data:**
```json
{
  "customerName": "John",
  "orderNumber": "ORD-12345"
}
```

**Result:**
```
Hi John, your order ORD-12345 has been confirmed!
```

## Categories

### Email Categories
- `verification` - Account verification emails
- `notification` - System notifications
- `marketing` - Promotional emails
- `transactional` - Order/payment confirmations
- `support` - Support and help emails

### SMS Categories
- `otp` - One-time password messages
- `notification` - Status updates
- `alert` - Urgent alerts
- `reminder` - Appointment/order reminders

## Admin Interface

### Template Management Page
Location: `/admin/templates`

Features:
- Create/Edit/Delete templates
- Preview templates
- Manage variables
- Toggle active status
- Search and filter
- Category management
- Usage statistics

### Variable Management
- Add variables to templates
- Click to insert into content
- Automatic validation
- Variable list management

## Best Practices

1. **Variable Naming**: Use snake_case (e.g., `user_name`, `order_id`)
2. **Template Naming**: Use descriptive names (e.g., `order_confirmation`, `password_reset`)
3. **Testing**: Always test templates before activating
4. **Fallbacks**: Legacy templates remain as fallback
5. **Character Limits**: Keep SMS under 160 chars for single message
6. **HTML Validation**: Ensure HTML templates are valid
7. **Variables**: Include all required variables in template
8. **Categories**: Use appropriate categories for organization

## Migration from Legacy Templates

The system maintains backward compatibility with legacy templates:

1. New `sendEmailFromTemplate` and `sendSMSFromTemplate` functions check database first
2. If template not found, falls back to legacy functions
3. Gradually migrate existing code to use new system
4. Keep legacy templates as reference

## Seeding Templates

Run the seed script to populate initial templates:

```bash
npx tsx scripts/seed-templates.ts
```

This creates:
- 3 email templates (wholesaler_approved, pharmacy_approved, order_confirmation)
- 4 SMS templates (otp_verification, order_shipped, order_delivered, payment_received)

