import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding email and SMS templates...')

  // Email Templates
  const emailTemplates = [

    {
      name: 'ride_completed_customer',
      templateKey: 'RIDE_COMPLETED_CUSTOMER',
      subject: '🚗 Ride Completed Successfully - {{rideNumber}}',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #007E33, #00C851); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 26px;">Ride Completed ✅</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Thank you for riding with {{appName}}</p>
          </div>
  
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Hi {{customerName}},</h2>
            <p style="color: #555; line-height: 1.6;">
              Your ride <strong>{{rideNumber}}</strong> with <strong>{{riderName}}</strong> has been successfully completed.
            </p>
  
            <ul style="color: #666; line-height: 1.6; list-style-type: none; padding: 0;">
              <li><strong>Pickup:</strong> {{pickupLocation}}</li>
              <li><strong>Drop-off:</strong> {{dropoffLocation}}</li>
              <li><strong>Total Fare:</strong> {{totalFare}}</li>
              <li><strong>Payment Method:</strong> {{paymentMethod}}</li>
            </ul>
  
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{rideDetailsUrl}}" style="background: #007E33; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                View Ride Details
              </a>
            </div>
  
            <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
              Thank you for choosing {{appName}}. We hope to see you again soon!
            </p>
          </div>
        </div>
      `,
      variables: [
        'customerName',
        'riderName',
        'rideNumber',
        'pickupLocation',
        'dropoffLocation',
        'totalFare',
        'paymentMethod',
        'rideDetailsUrl',
        'appName'
      ],
      category: 'TRANSACTIONAL' as const,
      description: 'Sent to customer when a ride is completed',
    },
    {
      name: 'courier_completed_customer',
      templateKey: 'COURIER_COMPLETED_CUSTOMER',
      subject: '📦 Delivery Completed - {{deliveryNumber}}',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0056b3, #007bff); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 26px;">Delivery Completed 📦</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Your courier delivery is now complete</p>
          </div>
  
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Hi {{customerName}},</h2>
            <p style="color: #555; line-height: 1.6;">
              Your delivery <strong>{{deliveryNumber}}</strong> has been successfully completed by <strong>{{courierName}}</strong>.
            </p>
  
            <ul style="color: #666; line-height: 1.6; list-style-type: none; padding: 0;">
              <li><strong>Pickup Address:</strong> {{pickupAddress}}</li>
              <li><strong>Delivery Address:</strong> {{deliveryAddress}}</li>
              <li><strong>Total Fee:</strong> {{deliveryFee}}</li>
              <li><strong>Payment Method:</strong> {{paymentMethod}}</li>
            </ul>
  
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{deliveryDetailsUrl}}" style="background: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                View Delivery Details
              </a>
            </div>
  
            <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
              Thanks for using {{appName}} for your delivery needs!
            </p>
          </div>
        </div>
      `,
      variables: [
        'customerName',
        'courierName',
        'deliveryNumber',
        'pickupAddress',
        'deliveryAddress',
        'deliveryFee',
        'paymentMethod',
        'deliveryDetailsUrl',
        'appName'
      ],
      category: 'TRANSACTIONAL' as const,
      description: 'Sent to customer when a courier delivery is completed',
    },


  ]

  // SMS Templates
  // const smsTemplates = [
  //   {
  //     name: 'otp_verification',
  //     content: 'Your Killo verification code is: {{otp}}. Valid for {{validity}} minutes.',
  //     variables: ['otp', 'validity'],
  //     category: 'otp',
  //     description: 'OTP verification message',
  //     maxLength: 160,
  //   },
  //   {
  //     name: 'order_shipped',
  //     content: 'Hi {{customerName}}, your order {{orderNumber}} has been shipped! Track: {{trackingUrl}}',
  //     variables: ['customerName', 'orderNumber', 'trackingUrl'],
  //     category: 'notification',
  //     description: 'Order shipment notification',
  //     maxLength: 160,
  //   },
  //   {
  //     name: 'order_delivered',
  //     content: 'Your order {{orderNumber}} has been delivered. Thank you for choosing Killo!',
  //     variables: ['orderNumber'],
  //     category: 'notification',
  //     description: 'Order delivery confirmation',
  //     maxLength: 160,
  //   },
  //   {
  //     name: 'payment_received',
  //     content: 'Payment of {{amount}} {{currency}} received for order {{orderNumber}}. Thank you!',
  //     variables: ['amount', 'currency', 'orderNumber'],
  //     category: 'notification',
  //     description: 'Payment confirmation message',
  //     maxLength: 160,
  //   },
  // ]

  // Clear existing templates (optional - comment out if you want to keep existing)
  console.log('Clearing existing templates...')
  await prisma.emailTemplate.deleteMany()
  await prisma.smsTemplate.deleteMany()

  // Create email templates
  console.log('Creating email templates...')
  for (const template of emailTemplates) {
    await prisma.emailTemplate.create({
      data: {
        ...template,
        isActive: true,
      }
    })
    console.log(`Created email template: ${template.name}`)
  }

  // Create SMS templates (commented out since smsTemplates array is not defined)
  // Uncomment when SMS templates are needed
  // console.log('Creating SMS templates...')
  // const smsTemplates = [] // Define SMS templates here when needed
  // for (const template of smsTemplates) {
  //   await prisma.smsTemplate.create({
  //     data: {
  //       ...template,
  //       isActive: true,
  //     }
  //   })
  //   console.log(`Created SMS template: ${template.name}`)
  // }

  console.log('Template seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

