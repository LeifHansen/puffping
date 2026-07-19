import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normalize any phone-ish input to E.164, defaulting to US numbers.
 * Returns null when the input can't be parsed into a valid number.
 */
export function normalizePhone(raw: string, defaultCountry: "US" = "US"): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  try {
    // libphonenumber-js can throw on some malformed inputs — never let a bad
    // cell (CSV import) or pasted value (DNC list) crash the request.
    const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number; // E.164
  } catch {
    return null;
  }
}

/** Pretty display: +14155552671 -> (415) 555-2671 */
export function formatPhoneDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === "US" ? parsed.formatNational() : parsed.formatInternational();
}

export function isTollFree(e164: string): boolean {
  return /^\+1(800|833|844|855|866|877|888)/.test(e164);
}
