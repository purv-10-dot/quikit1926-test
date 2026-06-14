import { describe, it, expect } from "vitest";
import {
  INDIAN_STATES,
  CITIES_BY_STATE,
  citiesForState,
  isCityInState,
  defaultPincodeFor,
} from "@/lib/data/india-geo";

describe("INDIAN_STATES dataset", () => {
  it("lists all 28 states + 8 UTs (36 entries)", () => {
    expect(INDIAN_STATES).toHaveLength(36);
  });
  it("every state has a corresponding cities list", () => {
    for (const s of INDIAN_STATES) {
      expect(Array.isArray(CITIES_BY_STATE[s.name])).toBe(true);
      expect(CITIES_BY_STATE[s.name].length).toBeGreaterThan(0);
    }
  });
});

describe("citiesForState", () => {
  it("returns a non-empty list for a known state", () => {
    const cities = citiesForState("Madhya Pradesh");
    expect(cities).toContain("Indore");
    expect(cities.length).toBeGreaterThan(0);
  });
  it("returns empty array for an unknown state", () => {
    expect(citiesForState("Atlantis")).toEqual([]);
  });
  it("returns empty array for empty input", () => {
    expect(citiesForState("")).toEqual([]);
  });
});

describe("isCityInState", () => {
  it("true when the city is under the state", () => {
    expect(isCityInState("Maharashtra", "Mumbai")).toBe(true);
  });
  it("false when the city is not under the state", () => {
    expect(isCityInState("Maharashtra", "Indore")).toBe(false);
  });
  it("false for blank inputs", () => {
    expect(isCityInState("", "Mumbai")).toBe(false);
    expect(isCityInState("Maharashtra", "")).toBe(false);
  });
});

describe("defaultPincodeFor", () => {
  it("returns the mapped PIN for a known state+city", () => {
    expect(defaultPincodeFor("Madhya Pradesh", "Indore")).toBe("452001");
  });
  it("returns empty string when the city has no mapping", () => {
    expect(defaultPincodeFor("Madhya Pradesh", "Nowhere")).toBe("");
  });
  it("returns empty string for blank inputs", () => {
    expect(defaultPincodeFor("", "Indore")).toBe("");
    expect(defaultPincodeFor("Madhya Pradesh", "")).toBe("");
  });
});
