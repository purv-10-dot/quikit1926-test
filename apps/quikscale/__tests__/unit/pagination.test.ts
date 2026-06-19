import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  parsePagination,
  paginatedResponse,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "@/lib/api/pagination";

function req(qs: string = ""): NextRequest {
  return new NextRequest(`http://localhost/api/test${qs}`);
}

describe("parsePagination", () => {
  it("returns defaults when no params are present", () => {
    const { page, limit, skip, take } = parsePagination(req());
    expect(page).toBe(1);
    expect(limit).toBe(DEFAULT_LIMIT);
    expect(skip).toBe(0);
    expect(take).toBe(DEFAULT_LIMIT);
  });

  it("parses explicit page and limit", () => {
    const { page, limit, skip, take } = parsePagination(req("?page=3&limit=20"));
    expect(page).toBe(3);
    expect(limit).toBe(20);
    expect(skip).toBe(40); // (3-1) * 20
    expect(take).toBe(20);
  });

  it("computes skip correctly for page=1", () => {
    expect(parsePagination(req("?page=1&limit=10")).skip).toBe(0);
  });

  it("computes skip correctly for page=5, limit=50", () => {
    expect(parsePagination(req("?page=5&limit=50")).skip).toBe(200);
  });

  it("clamps page below 1 to 1", () => {
    expect(parsePagination(req("?page=0")).page).toBe(1);
    expect(parsePagination(req("?page=-5")).page).toBe(1);
  });

  it("clamps limit below 1 to 1", () => {
    expect(parsePagination(req("?limit=0")).limit).toBe(1);
    expect(parsePagination(req("?limit=-10")).limit).toBe(1);
  });

  it("clamps limit above MAX_LIMIT to MAX_LIMIT", () => {
    expect(parsePagination(req("?limit=9999")).limit).toBe(MAX_LIMIT);
  });

  it("falls back to default on non-numeric page", () => {
    expect(parsePagination(req("?page=abc")).page).toBe(1);
  });

  it("falls back to default on non-numeric limit", () => {
    expect(parsePagination(req("?limit=abc")).limit).toBe(DEFAULT_LIMIT);
  });

  it("handles empty string params by falling back to defaults", () => {
    expect(parsePagination(req("?page=&limit=")).page).toBe(1);
    expect(parsePagination(req("?page=&limit=")).limit).toBe(DEFAULT_LIMIT);
  });

  it("accepts numeric string edge cases", () => {
    // "1e2" parses as 1 via parseInt
    expect(parsePagination(req("?page=1e2")).page).toBe(1);
    expect(parsePagination(req("?limit=1.5")).limit).toBe(1);
  });
});

describe("paginatedResponse", () => {
  it("wraps data in the standard envelope", () => {
    const res = paginatedResponse([{ id: "a" }, { id: "b" }], 2, 1, 20);
    expect(res).toEqual({
      success: true,
      data: [{ id: "a" }, { id: "b" }],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
  });

  it("computes totalPages via ceil", () => {
    expect(paginatedResponse([], 25, 1, 10).meta.totalPages).toBe(3);
    expect(paginatedResponse([], 30, 1, 10).meta.totalPages).toBe(3);
    expect(paginatedResponse([], 31, 1, 10).meta.totalPages).toBe(4);
  });

  it("returns totalPages=1 when total is 0 (never 0 pages)", () => {
    expect(paginatedResponse([], 0, 1, 20).meta.totalPages).toBe(1);
  });

  it("preserves the passed page number even beyond totalPages", () => {
    // If a caller asks for page 5 of an empty result set, echo it back
    // so the UI can show "Page 5 (no results)" instead of silently resetting.
    const res = paginatedResponse([], 0, 5, 20);
    expect(res.meta.page).toBe(5);
    expect(res.meta.total).toBe(0);
  });

  it("handles large result sets", () => {
    const res = paginatedResponse([], 12_500, 50, 100);
    expect(res.meta.totalPages).toBe(125);
    expect(res.meta.page).toBe(50);
  });

  it("keeps the generic type parameter working", () => {
    const typed = paginatedResponse<{ id: string; name: string }>(
      [{ id: "a", name: "Alice" }],
      1,
      1,
      20
    );
    // Compile-time only: the data array is typed
    expect(typed.data[0].name).toBe("Alice");
  });
});
