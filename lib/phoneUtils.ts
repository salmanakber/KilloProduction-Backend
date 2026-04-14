// phoneUtils.ts
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normalizes phone numbers into Twilio E.164 format
 * @param phone - user's input (any format)
 * @param defaultCountry - fallback country (ISO code e.g. PK, US, AE)
 */
export function formatPhoneForTwilio(
  phone: string,
  defaultCountry: string = "US"
): string {
  if (!phone) throw new Error("Phone number is required");

  // Remove spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-()]/g, "");

  // Parse and auto-detect or fallback to provided country
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);

  if (!parsed || !parsed.isValid()) {
    throw new Error("Invalid phone number format");
  }

  // Return number in Twilio-ready E.164 format: +923001234567
  return parsed.number;
}
