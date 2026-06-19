// Currency helpers for the catalog (Products + Services).
//
// Why these live here: the price/pricing field on Product and Service is a
// free-text string ("$49", "₹999/month", "Starting at €25"). Without a
// dedicated currency field the UI has to guess what symbol to show, and
// hardcoding "$" produces double-symbol bugs like "$₹999".
//
// The new `currency` field on the model is the source of truth. When it
// is set we render that symbol verbatim. When it is null (legacy rows
// or scraped products) we fall back to (1) sniffing the price string,
// then (2) the brand's country, then (3) "$".
//
// The currency value stored is the SYMBOL the user picked in the modal —
// not an ISO code. Symbols are short, unambiguous, and what users actually
// see on the card. AED is the one exception: there is no widely-recognised
// 1-character symbol so we store and render the literal "AED" string.

export const CURRENCY_OPTIONS = [
  { value: "₹",   label: "₹ Rupee" },
  { value: "$",   label: "$ Dollar" },
  { value: "€",   label: "€ Euro" },
  { value: "£",   label: "£ Pound" },
  { value: "AED", label: "AED Dirham" },
] as const;

// Country → currency symbol. Country names match Brand.country values
// stored in MongoDB. Anything not in this map falls through to "$".
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  India:      "₹",
  Pakistan:   "₹",
  Bangladesh: "₹",
  "Sri Lanka": "₹",
  USA:        "$",
  "United States": "$",
  "United States of America": "$",
  UAE:        "AED",
  "United Arab Emirates": "AED",
  UK:         "£",
  "United Kingdom": "£",
  France:     "€",
  Germany:    "€",
  Italy:      "€",
  Spain:      "€",
  Netherlands: "€",
};

/** Default currency symbol for a brand based on its `country` field. */
export function defaultCurrencyForCountry(
  country?: string | null
): string {
  if (!country) return "$";
  return COUNTRY_TO_CURRENCY[country.trim()] ?? "$";
}

/** Detect a leading currency symbol/string in a free-text price. */
export function detectCurrencyInPriceString(
  priceText?: string | null
): string | null {
  if (!priceText) return null;
  const s = priceText.trim();
  // Multi-character codes first so "AED 500" wins over "$500".
  if (/^aed\b/i.test(s)) return "AED";
  if (s.includes("₹")) return "₹";
  if (s.includes("€")) return "€";
  if (s.includes("£")) return "£";
  if (s.includes("$")) return "$";
  return null;
}

/**
 * Resolve which symbol to display for a given catalog row.
 *
 *   1. Explicit `currency` on the row wins.
 *   2. Otherwise sniff the price string for an embedded symbol.
 *   3. Otherwise fall back to the brand's country default.
 *   4. Otherwise "$".
 */
export function resolveCurrencySymbol(args: {
  currency?: string | null;
  priceText?: string | null;
  brandCountry?: string | null;
}): string {
  const explicit = (args.currency ?? "").trim();
  if (explicit) return explicit;
  const sniffed = detectCurrencyInPriceString(args.priceText ?? null);
  if (sniffed) return sniffed;
  return defaultCurrencyForCountry(args.brandCountry ?? null);
}

/**
 * Strip any leading currency symbol/string from the price so it is safe
 * to render alongside our resolved symbol without doubling up.
 *
 *   "$49"        → "49"
 *   "₹ 999"      → "999"
 *   "AED 500/mo" → "500/mo"
 *   "Starting at $99" → "Starting at 99"   (we strip every $/₹/€/£ token)
 *   "49"          → "49"
 */
export function stripCurrencyFromPrice(priceText?: string | null): string {
  if (!priceText) return "";
  let s = priceText.trim();
  // Strip leading "AED" word boundary (case-insensitive)
  s = s.replace(/^aed\s*/i, "");
  // Strip any/all single-character currency glyphs
  s = s.replace(/[₹€£$]/g, "");
  // Collapse double-spaces left behind
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}
