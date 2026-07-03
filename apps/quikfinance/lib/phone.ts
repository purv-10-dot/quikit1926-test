// Country list with international dialing codes. Used for phone country-code
// dropdowns (defaulting to the org's country) and the address country dropdown.

export type Country = { name: string; iso2: string; dial: string };

export const COUNTRIES: Country[] = [
  { name: "India", iso2: "IN", dial: "+91" },
  { name: "United States", iso2: "US", dial: "+1" },
  { name: "United Kingdom", iso2: "GB", dial: "+44" },
  { name: "United Arab Emirates", iso2: "AE", dial: "+971" },
  { name: "Australia", iso2: "AU", dial: "+61" },
  { name: "Canada", iso2: "CA", dial: "+1" },
  { name: "Singapore", iso2: "SG", dial: "+65" },
  { name: "Germany", iso2: "DE", dial: "+49" },
  { name: "France", iso2: "FR", dial: "+33" },
  { name: "Netherlands", iso2: "NL", dial: "+31" },
  { name: "Spain", iso2: "ES", dial: "+34" },
  { name: "Italy", iso2: "IT", dial: "+39" },
  { name: "Ireland", iso2: "IE", dial: "+353" },
  { name: "Switzerland", iso2: "CH", dial: "+41" },
  { name: "Saudi Arabia", iso2: "SA", dial: "+966" },
  { name: "Qatar", iso2: "QA", dial: "+974" },
  { name: "Kuwait", iso2: "KW", dial: "+965" },
  { name: "Bahrain", iso2: "BH", dial: "+973" },
  { name: "Oman", iso2: "OM", dial: "+968" },
  { name: "Japan", iso2: "JP", dial: "+81" },
  { name: "China", iso2: "CN", dial: "+86" },
  { name: "Hong Kong", iso2: "HK", dial: "+852" },
  { name: "Malaysia", iso2: "MY", dial: "+60" },
  { name: "Indonesia", iso2: "ID", dial: "+62" },
  { name: "Thailand", iso2: "TH", dial: "+66" },
  { name: "Philippines", iso2: "PH", dial: "+63" },
  { name: "Vietnam", iso2: "VN", dial: "+84" },
  { name: "Bangladesh", iso2: "BD", dial: "+880" },
  { name: "Sri Lanka", iso2: "LK", dial: "+94" },
  { name: "Nepal", iso2: "NP", dial: "+977" },
  { name: "Pakistan", iso2: "PK", dial: "+92" },
  { name: "South Africa", iso2: "ZA", dial: "+27" },
  { name: "Kenya", iso2: "KE", dial: "+254" },
  { name: "Nigeria", iso2: "NG", dial: "+234" },
  { name: "Brazil", iso2: "BR", dial: "+55" },
  { name: "Mexico", iso2: "MX", dial: "+52" },
  { name: "New Zealand", iso2: "NZ", dial: "+64" }
];

export const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

// Distinct dial codes (ordered, India first) for the phone code dropdown.
export const DIAL_CODES = Array.from(new Set(COUNTRIES.map((c) => c.dial)));

const DEFAULT_DIAL = "+91";

/** Resolve a default dial code from a country name (falls back to +91). */
export function dialForCountry(country: string | null | undefined): string {
  if (!country) return DEFAULT_DIAL;
  const match = COUNTRIES.find((c) => c.name.toLowerCase() === country.trim().toLowerCase() || c.iso2.toLowerCase() === country.trim().toLowerCase());
  return match?.dial ?? DEFAULT_DIAL;
}

/** Split a stored phone like "+91 8717962050" into dial code + local number. */
export function splitPhone(value: string | null | undefined, fallbackDial = DEFAULT_DIAL): { dial: string; number: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { dial: fallbackDial, number: "" };
  // Longest matching dial code prefix wins (e.g. +971 before +9).
  const codes = [...DIAL_CODES].sort((a, b) => b.length - a.length);
  for (const code of codes) {
    if (raw.startsWith(code)) {
      return { dial: code, number: raw.slice(code.length).trim() };
    }
  }
  return { dial: fallbackDial, number: raw };
}

/** Combine a dial code + local number into a single stored value. */
export function joinPhone(dial: string, number: string): string {
  const n = (number ?? "").trim();
  return n ? `${dial} ${n}` : "";
}
