/**
 * Upwork Connects pricing math.
 *
 * Pure-function coverage of `computeConnectsCost` — the single place the
 * Connects cost is derived — plus the tool-name matching that decides when
 * Connects behaviour turns on at all.
 *
 * The worked examples in the requirement (19, 29, 100 and 250 Connects; a $15→
 * $20 price change; a 95→90 rate change) are asserted directly so a regression
 * in the formula fails loudly rather than shifting a cost by a few rupees.
 */
import { describe, it, expect } from "vitest";
import { computeConnectsCost } from "@/lib/services/sales-cost/connects-usage";
import {
  DEFAULT_UPWORK_CONNECTS_CONFIG,
  UPWORK_CONNECTS_TOOL_NAME,
  isUpworkConnectsTool,
  type UpworkConnectsConfig,
} from "@/lib/services/sales-cost/connects-shared";

const base: UpworkConnectsConfig = DEFAULT_UPWORK_CONNECTS_CONFIG;

describe("Upwork Connects tool-name matching", () => {
  it("matches the exact preset name", () => {
    expect(isUpworkConnectsTool(UPWORK_CONNECTS_TOOL_NAME)).toBe(true);
  });

  it("tolerates case and surrounding whitespace", () => {
    expect(isUpworkConnectsTool("upwork connects")).toBe(true);
    expect(isUpworkConnectsTool("  Upwork Connects  ")).toBe(true);
  });

  it("does not match near-misses or custom tools", () => {
    // The singular form is a DIFFERENT tool — matching it would silently price
    // a custom tool as Connects.
    expect(isUpworkConnectsTool("Upwork Connect")).toBe(false);
    expect(isUpworkConnectsTool("LinkedIn Sales Navigator")).toBe(false);
    expect(isUpworkConnectsTool("")).toBe(false);
    expect(isUpworkConnectsTool(null)).toBe(false);
    expect(isUpworkConnectsTool(undefined)).toBe(false);
  });
});

describe("computeConnectsCost — default pricing (100 Connects = $15, ₹95/$)", () => {
  it("prices a full package", () => {
    expect(computeConnectsCost(100, base)).toEqual({ costUsd: 15, costInr: 1425 });
  });

  it("prices 19 Connects", () => {
    // 19/100 * 15 = 2.85 USD; 2.85 * 95 = 270.75 INR
    expect(computeConnectsCost(19, base)).toEqual({ costUsd: 2.85, costInr: 270.75 });
  });

  it("prices 29 Connects (base 19 + 10 boost)", () => {
    // 29/100 * 15 = 4.35 USD; 4.35 * 95 = 413.25 INR
    expect(computeConnectsCost(29, base)).toEqual({ costUsd: 4.35, costInr: 413.25 });
  });

  it("prices more than one package", () => {
    // 250/100 * 15 = 37.50 USD; 37.50 * 95 = 3562.50 INR
    expect(computeConnectsCost(250, base)).toEqual({ costUsd: 37.5, costInr: 3562.5 });
  });
});

describe("computeConnectsCost — configuration changes flow through", () => {
  it("uses a changed package price ($15 → $20)", () => {
    const cfg = { ...base, packagePriceUsd: 20 };
    // 100/100 * 20 = 20 USD; 20 * 95 = 1900 INR
    expect(computeConnectsCost(100, cfg)).toEqual({ costUsd: 20, costInr: 1900 });
  });

  it("uses a changed USD→INR rate (95 → 90)", () => {
    const cfg = { ...base, usdToInr: 90 };
    expect(computeConnectsCost(100, cfg)).toEqual({ costUsd: 15, costInr: 1350 });
  });

  it("uses a changed package size", () => {
    const cfg = { ...base, packageConnects: 50 };
    // 100/50 * 15 = 30 USD
    expect(computeConnectsCost(100, cfg)).toEqual({ costUsd: 30, costInr: 2850 });
  });

  it("never hard-codes the defaults", () => {
    const cfg: UpworkConnectsConfig = {
      packageConnects: 200,
      packagePriceUsd: 30,
      currency: "USD",
      usdToInr: 80,
    };
    // 100/200 * 30 = 15 USD; 15 * 80 = 1200 INR
    expect(computeConnectsCost(100, cfg)).toEqual({ costUsd: 15, costInr: 1200 });
  });
});

describe("computeConnectsCost — degenerate inputs", () => {
  it("returns zero for no consumption", () => {
    expect(computeConnectsCost(0, base)).toEqual({ costUsd: 0, costInr: 0 });
  });

  it("returns zero rather than a negative cost", () => {
    expect(computeConnectsCost(-5, base)).toEqual({ costUsd: 0, costInr: 0 });
  });

  it("returns zero rather than Infinity when the package size is 0", () => {
    // Guards a hand-edited settings blob: a 0 divisor must not reach the DB as
    // an Infinity cost.
    const cfg = { ...base, packageConnects: 0 };
    expect(computeConnectsCost(100, cfg)).toEqual({ costUsd: 0, costInr: 0 });
  });

  it("returns zero for non-finite consumption", () => {
    expect(computeConnectsCost(Number.NaN, base)).toEqual({ costUsd: 0, costInr: 0 });
  });
});
