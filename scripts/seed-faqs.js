const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const sampleFAQs = [
  {
    question: "How do I create an account?",
    answer: "To create an account, tap the 'Sign Up' button on the login screen, enter your email address, phone number, and create a secure password. You'll receive a verification code via SMS to complete the registration process.",
    category: "account",
    order: 1,
    tags: ["registration", "signup", "verification"]
  },
  {
    question: "How do I reset my password?",
    answer: "If you've forgotten your password, tap 'Forgot Password' on the login screen, enter your email address, and follow the instructions sent to your email to reset your password.",
    category: "account",
    order: 2,
    tags: ["password", "reset", "security"]
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, Mastercard, American Express), debit cards, bank transfers, and mobile money. You can also use our wallet feature for faster checkout.",
    category: "payment",
    order: 1,
    tags: ["payment", "cards", "wallet", "mobile money"]
  },
  {
    question: "How do I add money to my wallet?",
    answer: "Go to your Wallet section, tap 'Add Money', enter the amount you want to add, select your preferred payment method, and complete the transaction. The money will be available in your wallet immediately.",
    category: "payment",
    order: 2,
    tags: ["wallet", "top-up", "balance"]
  },
  {
    question: "How do I track my order?",
    answer: "Once your order is confirmed, you'll receive a tracking number. You can view your order status in the 'Orders' section of the app, where you'll see real-time updates on your order's progress.",
    category: "order",
    order: 1,
    tags: ["tracking", "order status", "delivery"]
  },
  {
    question: "Can I cancel my order?",
    answer: "You can cancel your order within 30 minutes of placing it, as long as it hasn't been processed yet. Go to your order details and tap 'Cancel Order'. Refunds will be processed within 3-5 business days.",
    category: "order",
    order: 2,
    tags: ["cancel", "refund", "order modification"]
  },
  {
    question: "How do I contact customer support?",
    answer: "You can reach our customer support team through the Help & Support section in the app, via email at support@killo.com, or by calling our 24/7 helpline at +234 123 456 7890.",
    category: "general",
    order: 1,
    tags: ["support", "contact", "help"]
  },
  {
    question: "What are your operating hours?",
    answer: "Our customer support is available 24/7. Our delivery services operate from 6 AM to 10 PM daily, with some pharmacies offering 24-hour emergency services.",
    category: "general",
    order: 2,
    tags: ["hours", "availability", "emergency"]
  },
  {
    question: "How do I find nearby pharmacies?",
    answer: "The app automatically detects your location and shows nearby pharmacies on the map. You can also use the search function to find pharmacies in specific areas or by name.",
    category: "pharmacy",
    order: 1,
    tags: ["location", "pharmacy", "map", "search"]
  },
  {
    question: "Can I get prescription medications?",
    answer: "Yes, you can order prescription medications. You'll need to upload a valid prescription from a licensed doctor. Our partner pharmacies will verify the prescription before processing your order.",
    category: "pharmacy",
    order: 2,
    tags: ["prescription", "medication", "doctor", "verification"]
  },
  {
    question: "What if the app is not working properly?",
    answer: "If you're experiencing technical issues, try closing and reopening the app, check your internet connection, or restart your device. If problems persist, contact our technical support team.",
    category: "technical",
    order: 1,
    tags: ["technical", "bugs", "troubleshooting", "app issues"]
  },
  {
    question: "How do I update the app?",
    answer: "App updates are automatically downloaded when available. You can also manually check for updates in your device's app store (Google Play Store or Apple App Store) and install the latest version.",
    category: "technical",
    order: 2,
    tags: ["update", "app store", "version", "download"]
  }
]

async function seedFAQs() {
  try {
    console.log('Seeding FAQs...')
    
    // Clear existing FAQs
    await prisma.fAQ.deleteMany({})
    console.log('Cleared existing FAQs')
    
    // Insert sample FAQs
    for (const faq of sampleFAQs) {
      await prisma.fAQ.create({
        data: {
          question: faq.question,
          answer: faq.answer,
          category: faq.category,
          order: faq.order,
          tags: faq.tags,
          isActive: true,
          views: Math.floor(Math.random() * 100),
          helpful: Math.floor(Math.random() * 20),
          notHelpful: Math.floor(Math.random() * 5)
        }
      })
    }
    
    console.log(`Successfully seeded ${sampleFAQs.length} FAQs`)
  } catch (error) {
    console.error('Error seeding FAQs:', error)
  } finally {
    await prisma.$disconnect()
  }
}

seedFAQs()
