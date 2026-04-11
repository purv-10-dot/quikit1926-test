import { describe, it, expect } from "vitest";

describe("quikscale test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("can import from @/lib alias", async () => {
    // Confirms the vitest.config.ts alias is wired correctly.
    // We import something that has zero side effects at module load.
    const mod = await import("@/lib/utils/kpiHelpers");
    expect(typeof mod.fmt).toBe("function");
  });
});
