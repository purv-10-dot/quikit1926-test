import { describe, expect, it } from "vitest";
import { listTasksQuerySchema } from "@/lib/validators/task";

describe("listTasksQuerySchema", () => {
  it("accepts limit=200 for lead detail tab fetches", () => {
    const parsed = listTasksQuerySchema.safeParse({
      leadId: "lead_1",
      status: "Open",
      limit: 200,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(200);
    }
  });

  it("rejects pageSize=200 (not in allow-list)", () => {
    const parsed = listTasksQuerySchema.safeParse({
      leadId: "lead_1",
      pageSize: 200,
    });
    expect(parsed.success).toBe(false);
  });
});
