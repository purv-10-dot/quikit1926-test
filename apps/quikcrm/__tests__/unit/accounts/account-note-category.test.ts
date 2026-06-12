import { describe, expect, it } from "vitest";
import {
  decodeAccountNoteContent,
  encodeAccountNoteContent,
} from "@/lib/accounts/account-note-category";

describe("account note category", () => {
  it("round-trips category in content", () => {
    const raw = encodeAccountNoteContent("strategy", "Expand APAC");
    const decoded = decodeAccountNoteContent(raw);
    expect(decoded.category).toBe("strategy");
    expect(decoded.body).toBe("Expand APAC");
  });
});
