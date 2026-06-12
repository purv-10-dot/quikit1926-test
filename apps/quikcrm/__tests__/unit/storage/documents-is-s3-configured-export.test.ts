import { describe, expect, it } from "vitest";
import { isS3Configured } from "@/lib/storage/documents";

describe("lib/storage/documents exports", () => {
  it("exports isS3Configured as a function", () => {
    expect(typeof isS3Configured).toBe("function");
  });
});

