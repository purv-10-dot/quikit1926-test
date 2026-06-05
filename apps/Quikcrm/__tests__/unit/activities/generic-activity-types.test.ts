import { describe, expect, it } from "vitest";
import {
  GENERIC_ACTIVITY_TYPES,
  isGenericActivityType,
} from "@/lib/services/activities/generic-activity-types";

describe("generic-activity-types", () => {
  it("includes standard CRM touchpoint types", () => {
    expect(GENERIC_ACTIVITY_TYPES).toEqual([
      "Note",
      "Call",
      "Email",
      "Meeting",
      "Task",
    ]);
  });

  it("isGenericActivityType narrows known values", () => {
    expect(isGenericActivityType("Call")).toBe(true);
    expect(isGenericActivityType("Custom")).toBe(false);
  });
});
