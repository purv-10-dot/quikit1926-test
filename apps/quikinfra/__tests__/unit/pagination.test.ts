import { describe, it, expect } from "vitest";
import {
  parsePagination,
  paginatedResponse,
  paginateInMemory,
  paginateDb,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/http/pagination";

function url(qs: string) {
  return new URL(`http://localhost/api/x${qs}`);
}

describe("parsePagination", () => {
  it("defaults to paginated=false when no params present", () => {
    const p = parsePagination(url(""));
    expect(p.paginated).toBe(false);
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(p.skip).toBe(0);
    expect(p.take).toBe(DEFAULT_PAGE_SIZE);
  });

  it("marks paginated=true when page OR pageSize present", () => {
    expect(parsePagination(url("?page=2")).paginated).toBe(true);
    expect(parsePagination(url("?pageSize=10")).paginated).toBe(true);
  });

  it("computes skip from page and pageSize", () => {
    const p = parsePagination(url("?page=3&pageSize=20"));
    expect(p.page).toBe(3);
    expect(p.pageSize).toBe(20);
    expect(p.skip).toBe(40);
    expect(p.take).toBe(20);
  });

  it("clamps invalid page to 1 and invalid size to default", () => {
    const p = parsePagination(url("?page=0&pageSize=-5"));
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("caps pageSize at MAX_PAGE_SIZE", () => {
    expect(parsePagination(url("?pageSize=99999")).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("accepts a NextRequest-like { url } and a URLSearchParams", () => {
    expect(parsePagination({ url: "http://localhost/api/x?page=2" }).page).toBe(2);
    expect(parsePagination(new URLSearchParams("page=4")).page).toBe(4);
  });
});

describe("paginatedResponse", () => {
  it("wraps rows + total with hasMore computed from skip", () => {
    const p = parsePagination(url("?page=1&pageSize=2"));
    const res = paginatedResponse([{ id: 1 }, { id: 2 }], 5, p);
    expect(res.data).toHaveLength(2);
    expect(res.total).toBe(5);
    expect(res.hasMore).toBe(true);
  });

  it("hasMore is false on the last page", () => {
    const p = parsePagination(url("?page=3&pageSize=2"));
    const res = paginatedResponse([{ id: 5 }], 5, p);
    expect(res.hasMore).toBe(false);
  });
});

describe("paginateInMemory", () => {
  const rows = Array.from({ length: 10 }, (_, i) => i);

  it("returns the legacy {data,total} shape when not paginated", () => {
    const res = paginateInMemory(rows, parsePagination(url("")));
    expect(res.data).toHaveLength(10);
    expect(res.total).toBe(10);
    expect(res.page).toBeUndefined();
  });

  it("slices the requested page when paginated", () => {
    const res = paginateInMemory(rows, parsePagination(url("?page=2&pageSize=3")));
    expect(res.data).toEqual([3, 4, 5]);
    expect(res.total).toBe(10);
    expect(res.hasMore).toBe(true);
  });
});

describe("paginateDb", () => {
  it("skips the count query and returns data.length when not paginated", async () => {
    let countCalled = false;
    const res = await paginateDb(
      parsePagination(url("")),
      async () => [{ id: 1 }, { id: 2 }],
      async () => {
        countCalled = true;
        return 99;
      },
    );
    expect(res.total).toBe(2);
    expect(res.page).toBeUndefined();
    expect(countCalled).toBe(false);
  });

  it("runs list + count in parallel and returns the paginated envelope", async () => {
    const res = await paginateDb(
      parsePagination(url("?page=1&pageSize=2")),
      async (paging) => {
        expect(paging.take).toBe(2);
        expect(paging.skip).toBe(0);
        return [{ id: 1 }, { id: 2 }];
      },
      async () => 7,
    );
    expect(res.total).toBe(7);
    expect(res.page).toBe(1);
    expect(res.hasMore).toBe(true);
  });
});
