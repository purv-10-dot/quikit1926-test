import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

const row = (id: string) => ({ id });

describe("paginate", () => {
  it("returns all rows and a null cursor when there is no extra row", () => {
    const rows = [row("a"), row("b"), row("c")];
    const page = paginate(rows, 3, (r) => r.id);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it("trims the sentinel row and reports nextCursor when more remain", () => {
    // Caller fetched limit + 1 (= 3) to detect a further page.
    const rows = [row("a"), row("b"), row("c")];
    const page = paginate(rows, 2, (r) => r.id);
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe("b");
  });

  it("handles an empty result set", () => {
    const page = paginate([], 10, (r: { id: string }) => r.id);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("throws when limit < 1", () => {
    expect(() => paginate([row("a")], 0, (r) => r.id)).toThrow(RangeError);
  });
});
