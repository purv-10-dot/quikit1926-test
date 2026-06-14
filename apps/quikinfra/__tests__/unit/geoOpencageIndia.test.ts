import { describe, it, expect } from "vitest";
import {
  matchIndianState,
  matchStateAndCity,
} from "@/lib/geo/opencage-india";

describe("matchIndianState", () => {
  it("matches by state_code (case-insensitive)", () => {
    expect(matchIndianState({ state_code: "mh" })).toBe("Maharashtra");
    expect(matchIndianState({ state_code: " KA " })).toBe("Karnataka");
  });

  it("matches by exact state name", () => {
    expect(matchIndianState({ state: "Karnataka" })).toBe("Karnataka");
  });

  it("resolves known aliases (NCT of Delhi → Delhi, Orissa → Odisha)", () => {
    expect(matchIndianState({ state: "National Capital Territory of Delhi" })).toBe(
      "Delhi",
    );
    expect(matchIndianState({ state: "Orissa" })).toBe("Odisha");
  });

  it("falls back to substring match", () => {
    expect(matchIndianState({ state: "Tamil Nadu State" })).toBe("Tamil Nadu");
  });

  it("returns null when nothing matches", () => {
    expect(matchIndianState({ state: "Bavaria" })).toBeNull();
    expect(matchIndianState({})).toBeNull();
  });
});

describe("matchStateAndCity", () => {
  it("maps state + an exact city in that state's list", () => {
    const r = matchStateAndCity({ state_code: "KA", city: "Bengaluru" });
    expect(r.state).toBe("Karnataka");
    expect(r.city).toBe("Bengaluru");
    expect(r.cityMatched).toBe(true);
  });

  it("resolves a city alias (Bangalore → Bengaluru)", () => {
    const r = matchStateAndCity({ state: "Karnataka", city: "Bangalore" });
    expect(r.city).toBe("Bengaluru");
    expect(r.cityMatched).toBe(true);
  });

  it("returns no city when state has no match", () => {
    const r = matchStateAndCity({ state: "Nowhere", city: "Bengaluru" });
    expect(r.state).toBeNull();
    expect(r.city).toBeNull();
    expect(r.cityMatched).toBe(false);
  });

  it("returns the state but null city when no city candidate matches the list", () => {
    const r = matchStateAndCity({ state_code: "KA", city: "Zzxqplandia" });
    expect(r.state).toBe("Karnataka");
    expect(r.city).toBeNull();
    expect(r.cityMatched).toBe(false);
  });

  it("falls back to other component fields (town/suburb/village) for the city", () => {
    const r = matchStateAndCity({ state_code: "KA", town: "Mysuru" });
    expect(r.state).toBe("Karnataka");
    // Mysuru is in Karnataka's list (mapped exactly or via substring)
    expect(r.cityMatched).toBe(true);
    expect(r.city).toBeTruthy();
  });
});
