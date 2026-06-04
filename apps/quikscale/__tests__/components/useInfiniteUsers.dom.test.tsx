// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: [{ id: "u1", firstName: "Shubham", lastName: "Giri", email: "s@test.com" }],
      meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function firstUrl(): string {
  return String(fetchMock.mock.calls[0][0]);
}

describe("useInfiniteUsers", () => {
  it("requests /api/users with no search param when no term is given", async () => {
    const { result } = renderHook(() => useInfiniteUsers(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    const url = firstUrl();
    expect(url).toContain("/api/users?");
    expect(url).toContain("sortBy=firstName");
    expect(url).not.toContain("search=");
  });

  it("forwards the search term as a query param", async () => {
    const { result } = renderHook(() => useInfiniteUsers(undefined, "shubham"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    expect(firstUrl()).toContain("search=shubham");
  });

  it("includes teamId and search together", async () => {
    const { result } = renderHook(() => useInfiniteUsers("team-1", "giri"), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    const url = firstUrl();
    expect(url).toContain("teamId=team-1");
    expect(url).toContain("search=giri");
  });

  it("treats a whitespace-only term as no search (shares the browse cache key)", async () => {
    const { result } = renderHook(() => useInfiniteUsers(undefined, "   "), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    expect(firstUrl()).not.toContain("search=");
  });
});
