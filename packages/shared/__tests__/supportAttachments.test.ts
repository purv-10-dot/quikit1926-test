import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for support-request attachments.
 *
 * The GCS layer is mocked — these assert the DECISIONS (which keys are
 * accepted, what gets rejected, what is cleaned up), not that Google's SDK
 * works. The tenant-isolation cases are the important ones: `keyBelongsToOrg`
 * is the single predicate standing between one tenant's screenshots and
 * another's.
 */

const { storage } = vi.hoisted(() => ({
  storage: {
    putObject: vi.fn(),
    headObject: vi.fn(),
    getSignedDownloadUrl: vi.fn(),
    deleteObject: vi.fn(),
  },
}));

vi.mock("../lib/storage", () => ({
  putObject: storage.putObject,
  headObject: storage.headObject,
  getSignedDownloadUrl: storage.getSignedDownloadUrl,
  deleteObject: storage.deleteObject,
  isStorageConfigured: () => true,
}));

import {
  attachmentViewUrl,
  buildSupportObjectKey,
  handleSupportAttachmentView,
  keyBelongsToOrg,
  resolveSupportAttachmentUrl,
  sanitizeSegment,
  uploadSupportAttachments,
  validateSupportFile,
  verifySupportAttachments,
} from "../lib/supportAttachments";

const ORG = "org-abc123";

beforeEach(() => {
  vi.clearAllMocks();
  storage.putObject.mockResolvedValue(undefined);
  storage.deleteObject.mockResolvedValue(undefined);
  storage.headObject.mockResolvedValue({
    exists: true,
    contentType: "image/png",
    contentLength: 2048,
  });
  storage.getSignedDownloadUrl.mockResolvedValue({
    url: "https://storage.googleapis.com/signed",
    expiresIn: 300,
  });
});

function fakeFile(over: Partial<{ name: string; type: string; size: number }> = {}) {
  return {
    name: over.name ?? "screenshot.png",
    type: over.type ?? "image/png",
    size: over.size ?? 2048,
    bytes: async () => new ArrayBuffer(8),
  };
}

/* ── Key layout ──────────────────────────────────────────────────────────── */

describe("buildSupportObjectKey", () => {
  it("namespaces by org and month, and never reuses the client's filename", () => {
    const key = buildSupportObjectKey({
      orgId: ORG,
      originalName: "my screenshot.png",
      mimeType: "image/png",
      now: new Date("2026-08-05T00:00:00Z"),
    });

    expect(key).toMatch(/^support\/org-abc123\/2026-08\/[0-9a-f]{32}\.png$/);
    expect(key).not.toContain("my screenshot");
  });

  it("cannot be steered out of its prefix by a hostile filename", () => {
    const key = buildSupportObjectKey({
      orgId: ORG,
      originalName: "../../../../etc/passwd",
      mimeType: "image/png",
      now: new Date("2026-08-05T00:00:00Z"),
    });

    expect(key.startsWith(`support/${ORG}/2026-08/`)).toBe(true);
    expect(key).not.toContain("..");
    expect(keyBelongsToOrg(key, ORG)).toBe(true);
  });

  it("falls back to a MIME-derived extension when the name has none", () => {
    const key = buildSupportObjectKey({
      orgId: ORG,
      originalName: "clipboard",
      mimeType: "application/pdf",
      now: new Date("2026-08-05T00:00:00Z"),
    });
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("sanitises an exotic orgId into one path segment", () => {
    // Runs of unsafe characters collapse to a single underscore, so slashes
    // and dots can't survive into the key as separate segments.
    expect(sanitizeSegment("a/b/../c")).toBe("a_b_c");
    expect(sanitizeSegment("")).toBe("org");
  });
});

/* ── Tenant isolation ────────────────────────────────────────────────────── */

describe("keyBelongsToOrg", () => {
  const good = `support/${ORG}/2026-08/${"a".repeat(32)}.png`;

  it("accepts a well-formed key under the caller's own org", () => {
    expect(keyBelongsToOrg(good, ORG)).toBe(true);
  });

  it("rejects another tenant's key", () => {
    expect(keyBelongsToOrg(`support/org-other/2026-08/x.png`, ORG)).toBe(false);
  });

  it("rejects traversal, doubled slashes and wrong depth", () => {
    expect(keyBelongsToOrg(`support/${ORG}/../other/2026-08/x.png`, ORG)).toBe(false);
    expect(keyBelongsToOrg(`support/${ORG}//2026-08/x.png`, ORG)).toBe(false);
    expect(keyBelongsToOrg(`support/${ORG}/2026-08/nested/x.png`, ORG)).toBe(false);
    expect(keyBelongsToOrg(`support/${ORG}/2026-08`, ORG)).toBe(false);
  });

  it("rejects keys belonging to another feature's prefix", () => {
    // QuikInfra's generic uploader writes `uploads/<tenant>/...`; the support
    // viewer must never sign one of those.
    expect(keyBelongsToOrg(`uploads/${ORG}/2026-08/x.png`, ORG)).toBe(false);
  });

  it("rejects a malformed date segment", () => {
    expect(keyBelongsToOrg(`support/${ORG}/august/x.png`, ORG)).toBe(false);
  });
});

/* ── Validation ──────────────────────────────────────────────────────────── */

describe("validateSupportFile", () => {
  it("accepts images and PDF", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "application/pdf"]) {
      expect(validateSupportFile({ fileName: "f", mimeType: type, sizeBytes: 100 }).ok).toBe(true);
    }
  });

  it("rejects archives and Office docs — a support form is not a file drop", () => {
    for (const type of [
      "application/zip",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/html",
      "application/x-msdownload",
    ]) {
      const res = validateSupportFile({ fileName: "f", mimeType: type, sizeBytes: 100 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(415);
    }
  });

  it("rejects an oversized file with 413", () => {
    const res = validateSupportFile({
      fileName: "huge.png",
      mimeType: "image/png",
      sizeBytes: 11 * 1024 * 1024,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(413);
  });

  it("rejects an empty file", () => {
    expect(
      validateSupportFile({ fileName: "e.png", mimeType: "image/png", sizeBytes: 0 }).ok,
    ).toBe(false);
  });
});

/* ── Upload ──────────────────────────────────────────────────────────────── */

describe("uploadSupportAttachments", () => {
  it("stores each file and returns a viewer URL, not a bucket path", async () => {
    const res = await uploadSupportAttachments({
      orgId: ORG,
      files: [fakeFile({ name: "a.png" }), fakeFile({ name: "b.png" })],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect(res.data[0].url).toBe(attachmentViewUrl(res.data[0].objectKey));
      expect(res.data[0].url.startsWith("/api/support/uploads/view/")).toBe(true);
    }
    expect(storage.putObject).toHaveBeenCalledTimes(2);
  });

  it("uploads nothing when any file in the batch is invalid", async () => {
    const res = await uploadSupportAttachments({
      orgId: ORG,
      files: [fakeFile({ name: "ok.png" }), fakeFile({ name: "bad.zip", type: "application/zip" })],
    });

    expect(res.ok).toBe(false);
    // All-or-nothing: a partial batch leaves files silently missing.
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("enforces the file-count cap", async () => {
    const res = await uploadSupportAttachments({
      orgId: ORG,
      files: Array.from({ length: 6 }, (_, i) => fakeFile({ name: `f${i}.png` })),
    });
    expect(res.ok).toBe(false);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("rolls back already-stored objects when a later upload throws", async () => {
    storage.putObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"));

    const res = await uploadSupportAttachments({
      orgId: ORG,
      files: [fakeFile({ name: "a.png" }), fakeFile({ name: "b.png" })],
    });

    expect(res.ok).toBe(false);
    // The first object landed; it must not be left orphaned.
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });
});

/* ── Verification at ticket-create time ──────────────────────────────────── */

describe("verifySupportAttachments", () => {
  const key = `support/${ORG}/2026-08/${"a".repeat(32)}.png`;

  it("accepts a key the caller owns that exists in the bucket", async () => {
    const res = await verifySupportAttachments({
      orgId: ORG,
      attachments: [{ objectKey: key, fileName: "a.png", mimeType: "image/png", sizeBytes: 2048 }],
    });
    expect(res.ok).toBe(true);
  });

  it("refuses a key belonging to another org — attachment stealing", async () => {
    const res = await verifySupportAttachments({
      orgId: ORG,
      attachments: [
        {
          objectKey: `support/org-victim/2026-08/${"b".repeat(32)}.png`,
          fileName: "stolen.png",
          mimeType: "image/png",
          sizeBytes: 2048,
        },
      ],
    });
    expect(res.ok).toBe(false);
    // Rejected on key shape alone — the bucket is never even consulted.
    expect(storage.headObject).not.toHaveBeenCalled();
  });

  it("refuses a key that does not exist in the bucket", async () => {
    storage.headObject.mockResolvedValue({ exists: false });
    const res = await verifySupportAttachments({
      orgId: ORG,
      attachments: [{ objectKey: key, fileName: "a.png", mimeType: "image/png", sizeBytes: 1 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("re-reads size and MIME from object metadata rather than trusting the body", async () => {
    storage.headObject.mockResolvedValue({
      exists: true,
      contentType: "image/png",
      contentLength: 4096,
    });

    const res = await verifySupportAttachments({
      orgId: ORG,
      attachments: [
        // Client lies: claims a tiny PDF.
        { objectKey: key, fileName: "a.png", mimeType: "application/pdf", sizeBytes: 10 },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data[0].mimeType).toBe("image/png");
      expect(res.data[0].sizeBytes).toBe(4096);
    }
  });

  it("rejects an object whose REAL type is not allowed, even if the body claims otherwise", async () => {
    storage.headObject.mockResolvedValue({
      exists: true,
      contentType: "application/zip",
      contentLength: 2048,
    });

    const res = await verifySupportAttachments({
      orgId: ORG,
      attachments: [{ objectKey: key, fileName: "a.png", mimeType: "image/png", sizeBytes: 2048 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(415);
  });

  it("rejects the same key submitted twice", async () => {
    const one = { objectKey: key, fileName: "a.png", mimeType: "image/png", sizeBytes: 2048 };
    const res = await verifySupportAttachments({ orgId: ORG, attachments: [one, { ...one }] });
    expect(res.ok).toBe(false);
  });

  it("is a no-op for a ticket with no attachments", async () => {
    const res = await verifySupportAttachments({ orgId: ORG, attachments: [] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
    expect(storage.headObject).not.toHaveBeenCalled();
  });
});

/* ── Viewing ─────────────────────────────────────────────────────────────── */

describe("resolveSupportAttachmentUrl", () => {
  const key = `support/${ORG}/2026-08/${"a".repeat(32)}.png`;

  it("signs a URL for the owning tenant", async () => {
    const res = await resolveSupportAttachmentUrl({ objectKey: key, orgId: ORG });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBe("https://storage.googleapis.com/signed");
  });

  it("gives 404 (not 403) for another tenant's key — no existence oracle", async () => {
    const res = await resolveSupportAttachmentUrl({
      objectKey: `support/org-victim/2026-08/${"b".repeat(32)}.png`,
      orgId: ORG,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.error).toBe("Not found");
    }
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("allows a cross-org read only when orgId is explicitly null (super admin)", async () => {
    const res = await resolveSupportAttachmentUrl({
      objectKey: `support/org-other/2026-08/${"b".repeat(32)}.png`,
      orgId: null,
    });
    expect(res.ok).toBe(true);
  });

  it("still refuses a non-support prefix even for a super admin", async () => {
    const res = await resolveSupportAttachmentUrl({
      objectKey: `uploads/org-other/2026-08/secret.png`,
      orgId: null,
    });
    expect(res.ok).toBe(false);
    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("handleSupportAttachmentView", () => {
  it("rejoins catch-all segments into the key", async () => {
    const res = await handleSupportAttachmentView({
      orgId: ORG,
      keySegments: ["support", ORG, "2026-08", "a.png"],
    });
    expect(res.ok).toBe(true);
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ key: `support/${ORG}/2026-08/a.png` }),
    );
  });

  it("404s on an empty path", async () => {
    const res = await handleSupportAttachmentView({ orgId: ORG, keySegments: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });
});
