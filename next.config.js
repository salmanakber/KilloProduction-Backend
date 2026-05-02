/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ["localhost", "firebasestorage.googleapis.com", "res.cloudinary.com"],
    unoptimized: true,
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    FIREBASE_ADMIN_KEY: process.env.FIREBASE_ADMIN_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    USE_GITHUB_AI: process.env.USE_GITHUB_AI,
    GITHUB_AI_PROVIDER: process.env.GITHUB_AI_PROVIDER,
   
  },
  experimental: {
    // pdfkit loads StandardFont .afm files from its package `data/` folder; bundling breaks those paths.
    serverComponentsExternalPackages: ['ws', 'pdfkit'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      if (Array.isArray(config.externals)) {
        config.externals.push('pdfkit')
      }
    }
    return config
  },
}

module.exports = nextConfig
