import { getCountries, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export type ParsedPhone = { e164: string; country: string | null; calling: string };

const COUNTRIES = new Set<string>(getCountries());
export const isCountry = (v: unknown): v is string => typeof v === "string" && COUNTRIES.has(v.toUpperCase());

/**
 * One phone parser for the CRM, booking and MCP, so the default country is applied the same way everywhere.
 * A number typed with + and a country code is used as typed; otherwise it is read in `defaultCountry`.
 * Returns an error message instead of throwing, so each caller can word it for its field.
 */
export function parsePhone(input: string, defaultCountry?: string | null): ParsedPhone | { error: string } {
  const raw = input.trim();
  const country = defaultCountry && isCountry(defaultCountry) ? (defaultCountry.toUpperCase() as CountryCode) : undefined;
  if (!raw.startsWith("+") && !country) return { error: "must include the country code, like +14155550123." };
  const n = parsePhoneNumberFromString(raw, country);
  if (!n || !n.isPossible()) return { error: raw.startsWith("+") ? "is not a possible phone number." : `is not a possible phone number in ${country}. Add the country code, like +14155550123.` };
  return { e164: n.number, country: n.country ?? (raw.startsWith("+") ? null : (country ?? null)), calling: `+${n.countryCallingCode}` };
}
