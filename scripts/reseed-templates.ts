import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding email and SMS templates with templateKeys...')

  // Email Templates for all modules
  const emailTemplates = [

    {
      templateKey: 'OTP_VERIFICATION',
      name: 'OTP Verification',
      subject: 'Your {{appName}} One-Time Password (OTP)',
      htmlContent: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f9f9f9; padding: 40px 0;">
          <div style="max-width: 600px; background-color: #ffffff; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="background-color: #4F46E5; color: #ffffff; text-align: center; padding: 20px;">
              <h1 style="margin: 0; font-size: 22px;">{{appName}}</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="font-size: 20px; margin-bottom: 10px; color: #333;">Hello {{customerName}},</h2>
              <p style="font-size: 16px; color: #555; margin-bottom: 20px;">
                Use the following One-Time Password (OTP) to verify your email and log in to your {{appName}} account:
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <span style="display: inline-block; font-size: 28px; letter-spacing: 4px; font-weight: bold; color: #4F46E5; background-color: #f3f4f6; padding: 12px 24px; border-radius: 6px;">
                  {{otpCode}}
                </span>
              </div>
              <p style="font-size: 16px; color: #555; margin-bottom: 25px;">
                You can also verify your email by clicking the button below:
              </p>
              <div style="text-align: center;">
                <a href="{{appUrl}}/verify-email?code={{otpCode}}" 
                  style="background-color: #4F46E5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Verify Email
                </a>
              </div>
              <p style="font-size: 14px; color: #888; margin-top: 30px;">
                If you did not request this verification, you can safely ignore this email.
              </p>
              <p style="font-size: 14px; color: #888; margin-top: 10px;">— The {{appName}} Team</p>
            </div>
          </div>
          <p style="text-align: center; font-size: 12px; color: #aaa; margin-top: 20px;">
            © {{appName}}. All rights reserved.
          </p>
        </div>
      `,
      variables: ['otpCode', 'appName', 'appUrl', 'customerName'],
      category: 'VERIFICATION',
      module: 'GLOBAL',
      description: 'Elegant and responsive OTP verification email template',
      isDefault: false,
      isSystem: true,
    }
    

    // {
    //   templateKey: 'RIDER_REVIEW_RECEIVED',
    //   name: 'rider_review_received',
    //   subject: '🌟 You’ve Received New Feedback from {{customerName}}!',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    //       <div style="background: linear-gradient(135deg, #4285F4, #0D47A1); color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0;">
    //         <h1 style="margin: 0; font-size: 26px;">New Ride Review Received!</h1>
    //         <p style="margin: 8px 0 0 0; font-size: 16px;">See what your customer said about their experience</p>
    //       </div>
    
    //       <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    //         <p style="color: #555; line-height: 1.6;">Hi {{riderName}},</p>
    
    //         <p style="color: #555; line-height: 1.6;">
    //           Great job! Your customer <strong>{{customerName}}</strong> just left a review for your recent {{rideType}} (Ride ID: <strong>{{rideId}}</strong>).
    //         </p>
    
    //         <div style="background: #fff; border: 1px solid #ddd; padding: 20px; border-radius: 8px; margin: 20px 0;">
    //           <p style="font-size: 15px; color: #333; line-height: 1.5;"><strong>Rating:</strong> ⭐ {{rating}}/5</p>
    //           <p style="font-size: 15px; color: #333; line-height: 1.5;"><strong>Review:</strong> "{{reviewComment}}"</p>
    //         </div>
    
    //         <div style="text-align: center; margin: 30px 0;">
    //           <a href="{{dashboardUrl}}" 
    //             style="background: #4285F4; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
    //             🔍 View on Dashboard
    //           </a>
    //         </div>
    
    //         <p style="color: #999; font-size: 13px; text-align: center;">
    //           Keep up the great work! Every happy customer builds your reputation on {{appName}}.
    //         </p>
    //       </div>
    //     </div>
    //   `,
    //   variables: ['riderName', 'customerName', 'rideType', 'rideId', 'rating', 'reviewComment', 'dashboardUrl', 'appName'],
    //   category: 'FEEDBACK',
    //   description: 'Sent to rider when a customer submits a new review about their completed ride',
    //   module: 'RIDING',
    //   isDefault: false,
    //   isSystem: true,
    // },
    


    // // GLOBAL Templates
    // {
    //   templateKey: 'RIDE_FEEDBACK_REQUEST',
    //   name: 'ride_feedback_request',
    //   subject: '🚗 Share Your Feedback for Your Recent Ride with {{riderName}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    //       <div style="background: linear-gradient(135deg, #00C851, #007E33); color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0;">
    //         <h1 style="margin: 0; font-size: 26px;">We Value Your Feedback!</h1>
    //         <p style="margin: 8px 0 0 0; font-size: 16px;">Tell us how your ride with {{riderName}} went</p>
    //       </div>
          
    //       <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    //         <p style="color: #555; line-height: 1.6;">Hi {{customerName}},</p>
            
    //         <p style="color: #555; line-height: 1.6;">
    //           Your recent {{rideType}} with <strong>{{riderName}}</strong> (Ride ID: {{rideId}}) has been completed successfully.  
    //           We’d love to hear how everything went — your feedback helps us improve our service.
    //         </p>
            
    //         <div style="text-align: center; margin: 30px 0;">
    //           <a href="{{feedbackUrl}}" 
    //             style="background: #00C851; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
    //             ⭐ Leave Feedback
    //           </a>
    //         </div>
            
    //         <p style="color: #999; font-size: 13px; text-align: center;">
    //           Thank you for riding with {{appName}}! We hope to see you again soon.
    //         </p>
    //       </div>
    //     </div>
    //   `,
    //   variables: ['customerName', 'riderName', 'rideType', 'rideId', 'feedbackUrl', 'appName'],
    //   category: 'FEEDBACK',
    //   description: 'Sent to customer after ride completion to request feedback about their rider',
    //   module: 'RIDING',
    //   isDefault: true,
    //   isSystem: true,
    // },
    


    // {
    //   templateKey: 'RIDE_COMPLETED_CUSTOMER',
    //   name: 'ride_completed_customer',
    //   subject: '🚗 Ride Completed Successfully - {{rideNumber}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    //       <div style="background: linear-gradient(135deg, #007E33, #00C851); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    //         <h1 style="margin: 0; font-size: 26px;">Ride Completed ✅</h1>
    //         <p style="margin: 10px 0 0 0; font-size: 16px;">Thank you for riding with {{appName}}</p>
    //       </div>
  
    //       <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    //         <h2 style="color: #333;">Hi {{customerName}},</h2>
    //         <p style="color: #555; line-height: 1.6;">
    //           Your ride <strong>{{rideNumber}}</strong> with <strong>{{riderName}}</strong> has been successfully completed.
    //         </p>
  
    //         <ul style="color: #666; line-height: 1.6; list-style-type: none; padding: 0;">
    //           <li><strong>Pickup:</strong> {{pickupLocation}}</li>
    //           <li><strong>Drop-off:</strong> {{dropoffLocation}}</li>
    //           <li><strong>Total Fare:</strong> {{totalFare}}</li>
    //           <li><strong>Payment Method:</strong> {{paymentMethod}}</li>
    //         </ul>
  
    //         <div style="text-align: center; margin: 30px 0;">
    //           <a href="{{rideDetailsUrl}}" style="background: #007E33; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
    //             View Ride Details
    //           </a>
    //         </div>
  
    //         <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
    //           Thank you for choosing {{appName}}. We hope to see you again soon!
    //         </p>
    //       </div>
    //     </div>
    //   `,
    //   variables: [
    //     'customerName',
    //     'riderName',
    //     'rideNumber',
    //     'pickupLocation',
    //     'dropoffLocation',
    //     'totalFare',
    //     'paymentMethod',
    //     'rideDetailsUrl',
    //     'appName'
    //   ],
    //   category: 'TRANSACTIONAL',
    //   description: 'Sent to customer when a ride is completed',
    //   module: 'RIDING',
    //   isDefault: true,
    //   isSystem: true,
    // },
    // {
    //   templateKey: 'COURIER_COMPLETED_CUSTOMER',
    //   name: 'courier_completed_customer',
    //   subject: '📦 Delivery Completed - {{deliveryNumber}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    //       <div style="background: linear-gradient(135deg, #0056b3, #007bff); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    //         <h1 style="margin: 0; font-size: 26px;">Delivery Completed 📦</h1>
    //         <p style="margin: 10px 0 0 0; font-size: 16px;">Your courier delivery is now complete</p>
    //       </div>
  
    //       <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
    //         <h2 style="color: #333;">Hi {{customerName}},</h2>
    //         <p style="color: #555; line-height: 1.6;">
    //           Your delivery <strong>{{deliveryNumber}}</strong> has been successfully completed by <strong>{{courierName}}</strong>.
    //         </p>
  
    //         <ul style="color: #666; line-height: 1.6; list-style-type: none; padding: 0;">
    //           <li><strong>Pickup Address:</strong> {{pickupAddress}}</li>
    //           <li><strong>Delivery Address:</strong> {{deliveryAddress}}</li>
    //           <li><strong>Total Fee:</strong> {{deliveryFee}}</li>
    //           <li><strong>Payment Method:</strong> {{paymentMethod}}</li>
    //         </ul>
  
    //         <div style="text-align: center; margin: 30px 0;">
    //           <a href="{{deliveryDetailsUrl}}" style="background: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
    //             View Delivery Details
    //           </a>
    //         </div>
  
    //         <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
    //           Thanks for using {{appName}} for your delivery needs!
    //         </p>
    //       </div>
    //     </div>
    //   `,
    //   variables: [
    //     'customerName',
    //     'courierName',
    //     'deliveryNumber',
    //     'pickupAddress',
    //     'deliveryAddress',
    //     'deliveryFee',
    //     'paymentMethod',
    //     'deliveryDetailsUrl',
    //     'appName'
    //   ],
    //   category: 'TRANSACTIONAL',
    //   description: 'Sent to customer when a courier delivery is completed',
    //   module: 'COURIER',
    //   isDefault: true,
    //   isSystem: true,
    // },






    // {
    //   templateKey: 'GLOBAL_WELCOME_EMAIL',
    //   name: 'Global Welcome Email',
    //   subject: '🎉 Welcome to Killo - Your Super App!',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h1>Welcome to Killo, {{user_name}}!</h1>
    //       <p>We're excited to have you on board.</p>
    //       <p>Your email: {{email}}</p>
    //     </div>
    //   `,
    //   variables: ['user_name', 'email'],
    //   category: 'WELCOME',
    //   module: 'GLOBAL',
    //   description: 'Default welcome email for all new users',
    //   isDefault: true,
    //   isSystem: true,
    // },
    // {
    //   templateKey: 'GLOBAL_RESET_PASSWORD',
    //   name: 'Password Reset Email',
    //   subject: 'Reset Your Killo Password',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Password Reset Request</h2>
    //       <p>Hi {{user_name}},</p>
    //       <p>Click the link below to reset your password:</p>
    //       <a href="{{reset_link}}" style="background: #00C851; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a>
    //       <p>This link expires in {{expiry_time}} minutes.</p>
    //     </div>
    //   `,
    //   variables: ['user_name', 'reset_link', 'expiry_time'],
    //   category: 'RESET_PASSWORD',
    //   module: 'GLOBAL',
    //   description: 'Password reset email',
    //   isDefault: true,
    //   isSystem: true,
    // },
    // {
    //   templateKey: 'GLOBAL_EMAIL_VERIFICATION',
    //   name: 'Email Verification',
    //   subject: 'Verify Your Email Address',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Verify Your Email</h2>
    //       <p>Hi {{user_name}},</p>
    //       <p>Please verify your email address by clicking the link below:</p>
    //       <a href="{{verification_link}}">Verify Email</a>
    //       <p>Or use this code: {{verification_code}}</p>
    //     </div>
    //   `,
    //   variables: ['user_name', 'verification_link', 'verification_code'],
    //   category: 'VERIFICATION',
    //   module: 'GLOBAL',
    //   description: 'Email verification',
    //   isDefault: true,
    //   isSystem: true,
    // },

    // // PHARMACY Templates
    // {
    //   templateKey: 'PHARMACY_ORDER_CONFIRMATION',
    //   name: 'Pharmacy Order Confirmation',
    //   subject: '✅ Pharmacy Order Confirmed - {{order_number}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Order Confirmed!</h2>
    //       <p>Hi {{customer_name}},</p>
    //       <p>Your pharmacy order <strong>{{order_number}}</strong> has been confirmed.</p>
    //       <p>Pharmacy: {{pharmacy_name}}</p>
    //       <p>Total: {{total_amount}}</p>
    //       <p>Estimated Delivery: {{delivery_date}}</p>
    //     </div>
    //   `,
    //   variables: ['customer_name', 'order_number', 'pharmacy_name', 'total_amount', 'delivery_date'],
    //   category: 'ORDER_CONFIRMATION',
    //   module: 'PHARMACY',
    //   description: 'Pharmacy order confirmation',
    //   isDefault: true,
    //   isSystem: true,
    // },
    // {
    //   templateKey: 'PHARMACY_PRESCRIPTION_READY',
    //   name: 'Prescription Ready Notification',
    //   subject: '💊 Your Prescription is Ready - {{pharmacy_name}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Prescription Ready for Pickup!</h2>
    //       <p>Hi {{customer_name}},</p>
    //       <p>Your prescription at {{pharmacy_name}} is ready for pickup.</p>
    //       <p>Prescription ID: {{prescription_id}}</p>
    //       <p>Please bring your ID when collecting.</p>
    //     </div>
    //   `,
    //   variables: ['customer_name', 'pharmacy_name', 'prescription_id'],
    //   category: 'NOTIFICATION',
    //   module: 'PHARMACY',
    //   description: 'Prescription ready notification',
    //   isDefault: false,
    //   isSystem: true,
    // },
    // {
    //   templateKey: 'PHARMACY_ORDER_SHIPPED',
    //   name: 'Pharmacy Order Shipped',
    //   subject: '📦 Your Order is On the Way!',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Order Shipped!</h2>
    //       <p>Hi {{customer_name}},</p>
    //       <p>Your order {{order_number}} has been shipped and is on its way!</p>
    //       <p>Track your order: <a href="{{tracking_url}}">{{tracking_url}}</a></p>
    //     </div>
    //   `,
    //   variables: ['customer_name', 'order_number', 'tracking_url'],
    //   category: 'ORDER_STATUS',
    //   module: 'PHARMACY',
    //   description: 'Order shipped notification',
    //   isDefault: true,
    //   isSystem: true,
    // },

    // // FOOD Templates
    // {
    //   templateKey: 'FOOD_ORDER_CONFIRMATION',
    //   name: 'Food Order Confirmation',
    //   subject: '🍔 Food Order Confirmed - {{order_number}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Order Confirmed!</h2>
    //       <p>Hi {{customer_name}},</p>
    //       <p>Your food order from <strong>{{restaurant_name}}</strong> is confirmed.</p>
    //       <p>Order: {{order_number}}</p>
    //       <p>Total: {{total_amount}}</p>
    //       <p>Delivery Address: {{delivery_address}}</p>
    //       <p>ETA: {{estimated_time}} minutes</p>
    //     </div>
    //   `,
    //   variables: ['customer_name', 'restaurant_name', 'order_number', 'total_amount', 'delivery_address', 'estimated_time'],
    //   category: 'ORDER_CONFIRMATION',
    //   module: 'FOOD',
    //   description: 'Food order confirmation',
    //   isDefault: true,
    //   isSystem: true,
    // },

    // // GROCERY Templates
    // {
    //   templateKey: 'GROCERY_ORDER_CONFIRMATION',
    //   name: 'Grocery Order Confirmation',
    //   subject: '🛒 Grocery Order Confirmed - {{order_number}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Order Confirmed!</h2>
    //       <p>Hi {{customer_name}},</p>
    //       <p>Your grocery order from <strong>{{store_name}}</strong> is confirmed.</p>
    //       <p>Order: {{order_number}}</p>
    //       <p>Total: {{total_amount}}</p>
    //       <p>Items: {{item_count}}</p>
    //       <p>Delivery Time: {{delivery_time}}</p>
    //     </div>
    //   `,
    //   variables: ['customer_name', 'store_name', 'order_number', 'total_amount', 'item_count', 'delivery_time'],
    //   category: 'ORDER_CONFIRMATION',
    //   module: 'GROCERY',
    //   description: 'Grocery order confirmation',
    //   isDefault: true,
    //   isSystem: true,
    // },

    // // AUTO_PARTS Templates
    // {
    //   templateKey: 'AUTOPARTS_ORDER_CONFIRMATION',
    //   name: 'Auto Parts Order Confirmation',
    //   subject: '🔧 Auto Parts Order Confirmed - {{order_number}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Order Confirmed!</h2>
    //       <p>Hi {{customer_name}},</p>
    //       <p>Your auto parts order from <strong>{{vendor_name}}</strong> is confirmed.</p>
    //       <p>Order: {{order_number}}</p>
    //       <p>Parts: {{parts_list}}</p>
    //       <p>Total: {{total_amount}}</p>
    //       <p>Estimated Delivery: {{delivery_date}}</p>
    //     </div>
    //   `,
    //   variables: ['customer_name', 'vendor_name', 'order_number', 'parts_list', 'total_amount', 'delivery_date'],
    //   category: 'ORDER_CONFIRMATION',
    //   module: 'AUTO_PARTS',
    //   description: 'Auto parts order confirmation',
    //   isDefault: true,
    //   isSystem: true,
    // },

    // // RIDING Templates
    // {
    //   templateKey: 'RIDING_RIDE_CONFIRMATION',
    //   name: 'Ride Booking Confirmation',
    //   subject: '🚗 Ride Booked - {{ride_id}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Ride Confirmed!</h2>
    //       <p>Hi {{customer_name}},</p>
    //       <p>Your ride has been booked.</p>
    //       <p>Ride ID: {{ride_id}}</p>
    //       <p>Driver: {{driver_name}}</p>
    //       <p>Vehicle: {{vehicle_info}}</p>
    //       <p>Pickup: {{pickup_location}}</p>
    //       <p>Dropoff: {{dropoff_location}}</p>
    //       <p>Fare: {{fare_amount}}</p>
    //     </div>
    //   `,
    //   variables: ['customer_name', 'ride_id', 'driver_name', 'vehicle_info', 'pickup_location', 'dropoff_location', 'fare_amount'],
    //   category: 'ORDER_CONFIRMATION',
    //   module: 'RIDING',
    //   description: 'Ride booking confirmation',
    //   isDefault: true,
    //   isSystem: true,
    // },

    // // DELIVERY Templates
    // {
    //   templateKey: 'DELIVERY_ASSIGNMENT',
    //   name: 'Delivery Assignment Notification',
    //   subject: '📦 Delivery Assignment - {{order_number}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>New Delivery Assignment</h2>
    //       <p>Hi {{rider_name}},</p>
    //       <p>You have been assigned a new delivery.</p>
    //       <p>Order: {{order_number}}</p>
    //       <p>Pickup: {{pickup_address}}</p>
    //       <p>Delivery: {{delivery_address}}</p>
    //       <p>Distance: {{distance}}</p>
    //       <p>Payment: {{payment_amount}}</p>
    //     </div>
    //   `,
    //   variables: ['rider_name', 'order_number', 'pickup_address', 'delivery_address', 'distance', 'payment_amount'],
    //   category: 'NOTIFICATION',
    //   module: 'DELIVERY',
    //   description: 'Delivery assignment notification',
    //   isDefault: true,
    //   isSystem: true,
    // },

    // // ADMIN Templates
    // {
    //   templateKey: 'ADMIN_NEW_VENDOR',
    //   name: 'New Vendor Registration Alert',
    //   subject: '🔔 New Vendor Registration - {{vendor_name}}',
    //   htmlContent: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>New Vendor Registration</h2>
    //       <p>A new vendor has registered on the platform.</p>
    //       <p>Vendor: {{vendor_name}}</p>
    //       <p>Email: {{vendor_email}}</p>
    //       <p>Module: {{module_type}}</p>
    //       <p>Registration Date: {{registration_date}}</p>
    //       <a href="{{admin_link}}">Review Application</a>
    //     </div>
    //   `,
    //   variables: ['vendor_name', 'vendor_email', 'module_type', 'registration_date', 'admin_link'],
    //   category: 'NOTIFICATION',
    //   module: 'ADMIN',
    //   description: 'New vendor registration notification for admins',
    //   isDefault: true,
    //   isSystem: true,
    // },
  ]

  // SMS Templates for all modules
  const smsTemplates = [
    // GLOBAL Templates
    {
      templateKey: 'GLOBAL_OTP',
      name: 'OTP Verification',
      content: 'Your Killo verification code is {{otp}}. Valid for {{validity}} minutes. Do not share this code.',
      variables: ['otp', 'validity'],
      category: 'OTP',
      module: 'GLOBAL',
      description: 'Default OTP verification',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'GLOBAL_WELCOME_SMS',
      name: 'Welcome SMS',
      content: 'Welcome to Killo, {{user_name}}! Thanks for joining us. Download our app to get started.',
      variables: ['user_name'],
      category: 'NOTIFICATION',
      module: 'GLOBAL',
      description: 'Welcome SMS',
      maxLength: 160,
      isDefault: false,
      isSystem: false,
    },

    // PHARMACY Templates
    {
      templateKey: 'PHARMACY_ORDER_SHIPPED',
      name: 'Pharmacy Order Shipped',
      content: 'Hi {{customer_name}}, your pharmacy order {{order_number}} from {{pharmacy_name}} has been shipped! Track: {{tracking_url}}',
      variables: ['customer_name', 'order_number', 'pharmacy_name', 'tracking_url'],
      category: 'ORDER_UPDATE',
      module: 'PHARMACY',
      description: 'Pharmacy order shipment notification',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'PHARMACY_ORDER_DELIVERED',
      name: 'Pharmacy Order Delivered',
      content: 'Your pharmacy order {{order_number}} has been delivered. Thank you for choosing {{pharmacy_name}}!',
      variables: ['order_number', 'pharmacy_name'],
      category: 'DELIVERY',
      module: 'PHARMACY',
      description: 'Pharmacy delivery confirmation',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'PHARMACY_PRESCRIPTION_REMINDER',
      name: 'Prescription Pickup Reminder',
      content: 'Reminder: Your prescription at {{pharmacy_name}} is ready for pickup. Valid until {{expiry_date}}.',
      variables: ['pharmacy_name', 'expiry_date'],
      category: 'REMINDER',
      module: 'PHARMACY',
      description: 'Prescription pickup reminder',
      maxLength: 160,
      isDefault: true,
      isSystem: false,
    },

    // FOOD Templates
    {
      templateKey: 'FOOD_ORDER_PREPARING',
      name: 'Food Order Preparing',
      content: '🍔 Your order {{order_number}} from {{restaurant_name}} is being prepared! ETA: {{eta}} mins.',
      variables: ['order_number', 'restaurant_name', 'eta'],
      category: 'ORDER_UPDATE',
      module: 'FOOD',
      description: 'Food order preparation update',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'FOOD_ORDER_DELIVERED',
      name: 'Food Order Delivered',
      content: 'Your food from {{restaurant_name}} has been delivered. Enjoy your meal! Order: {{order_number}}',
      variables: ['restaurant_name', 'order_number'],
      category: 'DELIVERY',
      module: 'FOOD',
      description: 'Food delivery confirmation',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'FOOD_DRIVER_ARRIVING',
      name: 'Driver Arriving Soon',
      content: 'Your driver {{driver_name}} is arriving in {{eta}} minutes with your food order {{order_number}}.',
      variables: ['driver_name', 'eta', 'order_number'],
      category: 'NOTIFICATION',
      module: 'FOOD',
      description: 'Driver arrival notification',
      maxLength: 160,
      isDefault: false,
      isSystem: false,
    },

    // GROCERY Templates
    {
      templateKey: 'GROCERY_ORDER_SHIPPED',
      name: 'Grocery Order Shipped',
      content: 'Your grocery order {{order_number}} from {{store_name}} is on the way! ETA: {{eta}} mins.',
      variables: ['order_number', 'store_name', 'eta'],
      category: 'ORDER_UPDATE',
      module: 'GROCERY',
      description: 'Grocery order shipping update',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'GROCERY_SUBSTITUTION_ALERT',
      name: 'Item Substitution Alert',
      content: 'Alert: {{item_name}} is out of stock. We substituted with {{substitute_item}}. Approve? Reply YES/NO.',
      variables: ['item_name', 'substitute_item'],
      category: 'ALERT',
      module: 'GROCERY',
      description: 'Item substitution alert',
      maxLength: 160,
      isDefault: true,
      isSystem: false,
    },

    // AUTO_PARTS Templates
    {
      templateKey: 'AUTOPARTS_QUOTE_READY',
      name: 'Auto Parts Quote Ready',
      content: 'Quote ready for {{part_name}}! Price: {{price}}. Valid for {{validity}} days. Order: {{order_number}}',
      variables: ['part_name', 'price', 'validity', 'order_number'],
      category: 'NOTIFICATION',
      module: 'AUTO_PARTS',
      description: 'Parts quote notification',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'AUTOPARTS_ORDER_READY',
      name: 'Auto Parts Order Ready',
      content: 'Your auto parts order {{order_number}} is ready for pickup at {{vendor_name}}. Bring your ID.',
      variables: ['order_number', 'vendor_name'],
      category: 'ORDER_UPDATE',
      module: 'AUTO_PARTS',
      description: 'Parts ready for pickup',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },

    // RIDING Templates
    {
      templateKey: 'RIDING_DRIVER_ASSIGNED',
      name: 'Ride Driver Assigned',
      content: 'Driver {{driver_name}} is on the way! Vehicle: {{vehicle_info}}. ETA: {{eta}} mins. Track: {{tracking_link}}',
      variables: ['driver_name', 'vehicle_info', 'eta', 'tracking_link'],
      category: 'NOTIFICATION',
      module: 'RIDING',
      description: 'Driver assignment notification',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'RIDING_RIDE_COMPLETED',
      name: 'Ride Completed',
      content: 'Ride completed! Fare: {{fare_amount}}. Please rate your driver. Thanks for using Killo!',
      variables: ['fare_amount'],
      category: 'NOTIFICATION',
      module: 'RIDING',
      description: 'Ride completion message',
      maxLength: 160,
      isDefault: false,
      isSystem: true,
    },

    // DELIVERY Templates
    {
      templateKey: 'DELIVERY_PICKUP_COMPLETE',
      name: 'Delivery Pickup Complete',
      content: 'Pickup complete for order {{order_number}}. En route to customer at {{delivery_address}}.',
      variables: ['order_number', 'delivery_address'],
      category: 'ORDER_UPDATE',
      module: 'DELIVERY',
      description: 'Pickup completion notification',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
    {
      templateKey: 'DELIVERY_PAYMENT_RECEIVED',
      name: 'Delivery Payment Received',
      content: 'Payment of {{amount}} received for delivery {{delivery_id}}. Thank you!',
      variables: ['amount', 'delivery_id'],
      category: 'PAYMENT',
      module: 'DELIVERY',
      description: 'Delivery payment confirmation',
      maxLength: 160,
      isDefault: true,
      isSystem: true,
    },
  ]

  console.log('Creating email templates...')
  for (const template of emailTemplates) {
    try {
      await prisma.emailTemplate.create({
        data: {
          ...template,
          isActive: true,
        }
      })
      console.log(`✓ Created email template: ${template.templateKey} [${template.module}/${template.category}]${template.isDefault ? ' (DEFAULT)' : ''}${template.isSystem ? ' [SYSTEM]' : ''}`)
    } catch (error: any) {
      console.error(`✗ Failed to create ${template.templateKey}:`, error.message)
    }
  }

  // console.log('\nCreating SMS templates...')
  // for (const template of smsTemplates) {
  //   try {
  //     await prisma.smsTemplate.create({
  //       data: {
  //         ...template,
  //         isActive: true,
  //       }
  //     })
  //     console.log(`✓ Created SMS template: ${template.templateKey} [${template.module}/${template.category}]${template.isDefault ? ' (DEFAULT)' : ''}${template.isSystem ? ' [SYSTEM]' : ''}`)
  //   } catch (error: any) {
  //     console.error(`✗ Failed to create ${template.templateKey}:`, error.message)
  //   }
  // }

  // console.log('\n📊 Summary:')
  // const emailCount = await prisma.emailTemplate.count()
  // const smsCount = await prisma.smsTemplate.count()
  // const emailDefaults = await prisma.emailTemplate.count({ where: { isDefault: true } })
  // const smsDefaults = await prisma.smsTemplate.count({ where: { isDefault: true } })
  // const emailSystem = await prisma.emailTemplate.count({ where: { isSystem: true } })
  // const smsSystem = await prisma.smsTemplate.count({ where: { isSystem: true } })

  // console.log(`Email Templates: ${emailCount} (${emailDefaults} defaults, ${emailSystem} system)`)
  // console.log(`SMS Templates: ${smsCount} (${smsDefaults} defaults, ${smsSystem} system)`)
  
  // console.log('\n📝 Template Keys Reference:')
  // console.log('Use these keys in your code (they are immutable):')
  // console.log('\nEmail Template Keys:')
  // emailTemplates.forEach(t => console.log(`  - ${t.templateKey}`))
  // console.log('\nSMS Template Keys:')
  // smsTemplates.forEach(t => console.log(`  - ${t.templateKey}`))
  
  // console.log('\n✅ Template seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
