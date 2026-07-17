import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKbDocs, ingestDocument } from "./api";

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

afterEach(() => vi.restoreAllMocks());

describe("ingestDocument", () => {
  it("POSTs the ingest body and returns the result", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonResponse({ sourceFileId: "quikchat/o/c/x.pdf", chunksStored: 5, contentHash: "h" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ingestDocument("c1", {
      storageKey: "quikchat/o/c/x.pdf",
      filename: "x.pdf",
      visibility: "PRIVATE",
    });
    expect(result).toEqual({ sourceFileId: "quikchat/o/c/x.pdf", chunksStored: 5, contentHash: "h" });

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/channels/c1/ingest");
    expect(opts!.method).toBe("POST");
    expect(JSON.parse(opts!.body as string)).toEqual({
      storageKey: "quikchat/o/c/x.pdf",
      filename: "x.pdf",
      visibility: "PRIVATE",
    });
  });

  it("throws an Error carrying the server code on a non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "extract failed", code: "extract_failed" }, false, 422)),
    );
    await expect(
      ingestDocument("c1", {
        storageKey: "quikchat/o/c/x.pdf",
        filename: "x.pdf",
        visibility: "ORG",
      }),
    ).rejects.toMatchObject({ message: "extract failed", code: "extract_failed" });
  });

  it("forwards the optional messageId (Option-B marker anchor)", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonResponse({ sourceFileId: "quikchat/o/c/x.pdf", chunksStored: 1, contentHash: "h" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await ingestDocument("c1", {
      storageKey: "quikchat/o/c/x.pdf",
      filename: "x.pdf",
      visibility: "PRIVATE",
      messageId: "msg-1",
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).messageId).toBe("msg-1");
  });
});

describe("fetchKbDocs", () => {
  it("GETs the channel's persisted KB source-file ids", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonResponse({ sourceFileIds: ["quikchat/o/c/a.pdf", "quikchat/o/c/b.pdf"] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ids = await fetchKbDocs("c1");
    expect(ids).toEqual(["quikchat/o/c/a.pdf", "quikchat/o/c/b.pdf"]);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/channels/c1/kb-docs");
  });
});
