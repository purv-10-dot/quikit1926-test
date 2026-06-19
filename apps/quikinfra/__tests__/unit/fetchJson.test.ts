import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJson, mutateJson, HttpError } from "@/lib/react-query/fetch-json";

afterEach(() => vi.unstubAllGlobals());

describe("fetchJson", () => {
  it("parses JSON on ok and passes cache:no-store + init", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ value: 42 }),
      text: async () => "{}",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchJson<{ value: number }>("/api/x", {
      headers: { "x-test": "1" },
    });
    expect(data).toEqual({ value: 42 });

    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe("/api/x");
    expect((init as any).cache).toBe("no-store");
    expect((init as any).headers).toEqual({ "x-test": "1" });
  });

  it("throws HttpError carrying status + body text on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => "Not Found",
      json: async () => ({}),
    })));

    await expect(fetchJson("/api/missing")).rejects.toMatchObject({
      name: "HttpError",
      status: 404,
      message: "Not Found",
    });
    await expect(fetchJson("/api/missing")).rejects.toBeInstanceOf(HttpError);
  });
});

describe("mutateJson", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ id: "new" }),
      text: async () => "{}",
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends method + JSON body + Content-Type header when a body is given", async () => {
    const res = await mutateJson<{ id: string }>("/api/items", "POST", { name: "a" });
    expect(res).toEqual({ id: "new" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/items");
    expect((init as any).method).toBe("POST");
    expect((init as any).cache).toBe("no-store");
    expect((init as any).headers).toEqual({ "Content-Type": "application/json" });
    expect((init as any).body).toBe(JSON.stringify({ name: "a" }));
  });

  it("omits headers + body when no body is provided (empty body)", async () => {
    await mutateJson("/api/items/1", "DELETE");
    const [, init] = fetchMock.mock.calls[0];
    expect((init as any).headers).toBeUndefined();
    expect((init as any).body).toBeUndefined();
    expect((init as any).method).toBe("DELETE");
  });

  it("throws HttpError using the parsed error field on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ error: "Validation failed" }),
      text: async () => "{}",
    })));
    await expect(mutateJson("/api/x", "POST", { a: 1 })).rejects.toMatchObject({
      status: 422,
      message: "Validation failed",
    });
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "boom",
    })));
    await expect(mutateJson("/api/x", "POST")).rejects.toMatchObject({
      status: 500,
      message: "Server Error",
    });
  });
});
