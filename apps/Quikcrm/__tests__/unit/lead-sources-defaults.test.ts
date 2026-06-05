import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_SOURCES,
  defaultLeadSourceOptions,
} from "@/lib/leads/lead-sources-defaults";

describe("DEFAULT_LEAD_SOURCES", () => {
  it("includes the standard marketing and outreach sources", () => {
    expect(DEFAULT_LEAD_SOURCES).toContain("Marketing Lead");
    expect(DEFAULT_LEAD_SOURCES).toContain("LinkedIn");
    expect(DEFAULT_LEAD_SOURCES).toContain("Existing Client Reference");
    expect(DEFAULT_LEAD_SOURCES).toHaveLength(11);
  });

  it("maps to client fallback options", () => {
    const options = defaultLeadSourceOptions();
    expect(options[0]?.name).toBe("Marketing Lead");
    expect(options).toHaveLength(11);
  });
});
