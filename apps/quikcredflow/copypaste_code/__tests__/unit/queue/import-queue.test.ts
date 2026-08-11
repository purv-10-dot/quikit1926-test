import { describe, expect, it } from "vitest";
import { buildImportBullJobId } from "@/lib/queue/import-queue";

describe("buildImportBullJobId", () => {
  it("uses a hyphen separator (BullMQ forbids colons in custom ids)", () => {
    const id = buildImportBullJobId("leads", "clxyz123");
    expect(id).toBe("leads-clxyz123");
    expect(id).not.toContain(":");
  });
});
