import { describe, it, expect } from "vitest";
import { parseRelativeOrIsoDate } from "@/lib/services/qql/dates";

const NOW = new Date("2026-06-24T12:00:00.000Z");

describe("parseRelativeOrIsoDate", () => {
  it("resolves '-7d' to 7 days before now", () => {
    const result = parseRelativeOrIsoDate("-7d", NOW);
    expect(result).toEqual(new Date("2026-06-17T12:00:00.000Z"));
  });

  it("resolves '-1w' to 7 days before now", () => {
    const result = parseRelativeOrIsoDate("-1w", NOW);
    expect(result).toEqual(new Date("2026-06-17T12:00:00.000Z"));
  });

  it("resolves '-3h' to 3 hours before now", () => {
    const result = parseRelativeOrIsoDate("-3h", NOW);
    expect(result).toEqual(new Date("2026-06-24T09:00:00.000Z"));
  });

  it("resolves '-30m' to 30 minutes before now", () => {
    const result = parseRelativeOrIsoDate("-30m", NOW);
    expect(result).toEqual(new Date("2026-06-24T11:30:00.000Z"));
  });

  it("accepts a full ISO datetime", () => {
    const result = parseRelativeOrIsoDate("2026-01-01T00:00:00.000Z", NOW);
    expect(result).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("accepts a bare ISO date", () => {
    const result = parseRelativeOrIsoDate("2026-01-01", NOW);
    expect(result?.getUTCFullYear()).toBe(2026);
    expect(result?.getUTCMonth()).toBe(0);
    expect(result?.getUTCDate()).toBe(1);
  });

  it("returns null for an unparseable string", () => {
    expect(parseRelativeOrIsoDate("not a date", NOW)).toBeNull();
  });

  it("returns null for an unsupported relative unit", () => {
    expect(parseRelativeOrIsoDate("-7x", NOW)).toBeNull();
  });
});
