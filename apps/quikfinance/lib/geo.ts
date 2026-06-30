import { INDIAN_STATE_OPTIONS } from "@/lib/india";

export type GeoOption = { label: string; value: string };

/** Country dropdown options (ISO 3166-1 alpha-2 codes). */
export const COUNTRY_OPTIONS: GeoOption[] = [
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SG", label: "Singapore" },
  { value: "AU", label: "Australia" },
  { value: "CA", label: "Canada" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "NL", label: "Netherlands" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "ZA", label: "South Africa" },
  { value: "JP", label: "Japan" },
  { value: "CN", label: "China" },
  { value: "BR", label: "Brazil" }
];

/** US state options (used to demonstrate state dropdowns for a non-India country). */
const US_STATE_OPTIONS: GeoOption[] = [
  { value: "CA", label: "California" },
  { value: "NY", label: "New York" },
  { value: "TX", label: "Texas" },
  { value: "FL", label: "Florida" },
  { value: "WA", label: "Washington" },
  { value: "IL", label: "Illinois" }
];

/**
 * States for a country. Returns [] when we don't ship a list for that country —
 * the UI then falls back to a free-text input.
 */
export function getStateOptions(country: string): GeoOption[] {
  if (country === "IN") {
    return INDIAN_STATE_OPTIONS.map((state) => ({ value: state.value, label: `${state.value} · ${state.label}` }));
  }
  if (country === "US") {
    return US_STATE_OPTIONS;
  }
  return [];
}

/** Cities keyed by `${country}:${state}`. Sample data — extend as needed. */
const CITY_BY_LOCATION: Record<string, string[]> = {
  "IN:23": ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain"], // Madhya Pradesh
  "IN:27": ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane"], // Maharashtra
  "IN:07": ["New Delhi", "Delhi"], // Delhi
  "IN:29": ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi"], // Karnataka
  "IN:33": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"], // Tamil Nadu
  "IN:24": ["Ahmedabad", "Surat", "Vadodara", "Rajkot"], // Gujarat
  "IN:09": ["Lucknow", "Kanpur", "Noida", "Ghaziabad", "Varanasi"], // Uttar Pradesh
  "US:CA": ["Los Angeles", "San Francisco", "San Diego", "Sacramento"],
  "US:NY": ["New York City", "Buffalo", "Rochester", "Albany"]
};

/**
 * Cities for a country/state. Returns [] when none are known so the UI falls
 * back to a free-text input.
 */
export function getCityOptions(country: string, state: string): GeoOption[] {
  if (!country || !state) {
    return [];
  }
  const cities = CITY_BY_LOCATION[`${country}:${state}`];
  return (cities ?? []).map((city) => ({ value: city, label: city }));
}
