import { INDIAN_STATES, citiesForState } from "@/lib/data/india-geo";

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const STATE_ALIASES: Record<string, string> = {
  "national capital territory of delhi": "Delhi",
  "nct of delhi": "Delhi",
  "delhi division": "Delhi",
  "orissa": "Odisha",
};

const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bombay: "Mumbai",
  calcutta: "Kolkata",
  pondicherry: "Puducherry",
  pondichéry: "Puducherry",
};

export type OpencageLocationComponents = {
  state?: string;
  state_code?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  locality?: string;
  county?: string;
  state_district?: string;
};

export function matchIndianState(components: OpencageLocationComponents): string | null {
  const code = components.state_code?.trim().toUpperCase();
  if (code) {
    const hit = INDIAN_STATES.find((s) => s.code === code);
    if (hit) return hit.name;
  }
  const raw = components.state?.trim();
  if (!raw) return null;
  const key = norm(raw);
  const alias = STATE_ALIASES[key];
  if (alias) return alias;
  for (const s of INDIAN_STATES) {
    if (norm(s.name) === key) return s.name;
  }
  for (const s of INDIAN_STATES) {
    const sn = norm(s.name);
    if (key.includes(sn) || sn.includes(key)) return s.name;
  }
  return null;
}

function cityCandidates(components: OpencageLocationComponents): string[] {
  const keys: (keyof OpencageLocationComponents)[] = [
    "city",
    "town",
    "suburb",
    "village",
    "locality",
    "county",
    "state_district",
  ];
  const out: string[] = [];
  for (const k of keys) {
    const v = components[k];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  return Array.from(new Set(out));
}

/**
 * Maps OpenCage component strings to a state + city that exist in
 * `StateCitySelect` option lists (exact / alias / conservative substring).
 */
export function matchStateAndCity(
  components: OpencageLocationComponents,
): { state: string | null; city: string | null; cityMatched: boolean } {
  const state = matchIndianState(components);
  if (!state) return { state: null, city: null, cityMatched: false };

  const candidates = cityCandidates(components);
  const cities = citiesForState(state);
  if (!cities.length || candidates.length === 0) {
    return { state, city: null, cityMatched: false };
  }

  for (const raw of candidates) {
    const r = norm(raw);
    const aliased = CITY_ALIASES[r];
    if (aliased && cities.includes(aliased)) {
      return { state, city: aliased, cityMatched: true };
    }
  }

  for (const raw of candidates) {
    const r = norm(raw);
    for (const listCity of cities) {
      if (norm(listCity) === r) return { state, city: listCity, cityMatched: true };
    }
  }

  const minSub = 4;
  for (const raw of candidates) {
    const r = norm(raw);
    if (r.length < 3) continue;
    for (const listCity of cities) {
      const lc = norm(listCity);
      const shorter = Math.min(r.length, lc.length);
      if (shorter < minSub) continue;
      if (r.includes(lc) || lc.includes(r)) {
        return { state, city: listCity, cityMatched: true };
      }
    }
  }

  return { state, city: null, cityMatched: false };
}
