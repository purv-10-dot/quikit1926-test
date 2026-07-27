import { describe, it, expect } from "vitest";
import { apiErrorMessage } from "@/lib/apiError";

describe("apiErrorMessage — surface the real API error, not a generic string", () => {
  it("returns the server-provided error message when present", () => {
    // The exact scenario behind the assign bug: the API's specific reason must show.
    expect(apiErrorMessage({ success: false, error: "Asset is not Available (status InRepair)" }, "Failed to assign asset"))
      .toBe("Asset is not Available (status InRepair)");
  });

  it("falls back when there is no error field", () => {
    expect(apiErrorMessage({ success: true, data: {} }, "Failed to assign asset")).toBe("Failed to assign asset");
    expect(apiErrorMessage({}, "fallback")).toBe("fallback");
  });

  it("falls back on a blank/whitespace error", () => {
    expect(apiErrorMessage({ error: "" }, "fallback")).toBe("fallback");
    expect(apiErrorMessage({ error: "   " }, "fallback")).toBe("fallback");
  });

  it("falls back on a non-string error or non-object body", () => {
    expect(apiErrorMessage({ error: 500 }, "fallback")).toBe("fallback");
    expect(apiErrorMessage(null, "fallback")).toBe("fallback");
    expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(apiErrorMessage("oops", "fallback")).toBe("fallback");
  });
});
