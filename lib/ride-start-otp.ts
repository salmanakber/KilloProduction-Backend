import crypto from "crypto"
import Redis from "ioredis"

type RideOtpRecord = {
  hash: string
  expiresAt: number
}

const OTP_TTL_MS = 10 * 60 * 1000
const REDIS_PREFIX = "ride_start_otp:"
const redisUrl = process.env.REDIS_URL
const redisClient = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: null }) : null

declare global {
  // eslint-disable-next-line no-var
  var __rideStartOtpStore: Map<string, RideOtpRecord> | undefined
}

function getStore() {
  if (!global.__rideStartOtpStore) {
    global.__rideStartOtpStore = new Map<string, RideOtpRecord>()
  }
  return global.__rideStartOtpStore
}

function hashOtp(bookingId: string, otp: string) {
  const secret = process.env.RIDE_START_OTP_SECRET || "ride-start-otp-secret"
  return crypto.createHash("sha256").update(`${bookingId}:${otp}:${secret}`).digest("hex")
}

function cleanupExpired() {
  const now = Date.now()
  const store = getStore()
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) store.delete(key)
  }
}

export function issueRideStartOtp(bookingId: string) {
  const otp = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()
  const hash = hashOtp(bookingId, otp)
  if (redisClient) {
    void redisClient.set(`${REDIS_PREFIX}${bookingId}`, hash, "PX", OTP_TTL_MS)
  } else {
    cleanupExpired()
    const store = getStore()
    store.set(bookingId, {
      hash,
      expiresAt: Date.now() + OTP_TTL_MS,
    })
  }
  return { otp, expiresAt }
}

export async function verifyRideStartOtp(bookingId: string, otp: string) {
  const expectedHash = hashOtp(bookingId, otp)
  if (redisClient) {
    const key = `${REDIS_PREFIX}${bookingId}`
    const storedHash = await redisClient.get(key)
    if (!storedHash) return false
    const valid = storedHash === expectedHash
    if (valid) await redisClient.del(key)
    return valid
  }

  cleanupExpired()
  const record = getStore().get(bookingId)
  if (!record) return false
  if (record.expiresAt <= Date.now()) {
    getStore().delete(bookingId)
    return false
  }
  const valid = record.hash === expectedHash
  if (valid) getStore().delete(bookingId)
  return valid
}
