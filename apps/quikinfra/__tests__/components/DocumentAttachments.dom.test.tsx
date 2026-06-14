// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentAttachments } from "@/components/documents/DocumentAttachments";

// DocumentAttachments fetches `/api/documents` on mount (plain fetch, no
// React Query) so it doesn't need TestProviders — just a stubbed fetch.

const docs = [
  {
    id: "d1",
    fileName: "drawing.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("DocumentAttachments", () => {
  it("shows a loading state, then the attachment list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ data: docs }) })),
    );
    render(<DocumentAttachments refType="po" refId="po-1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText("drawing.pdf")).toBeInTheDocument();
    // Count badge reflects the loaded list.
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("requests the right refType/refId query params", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
    vi.stubGlobal("fetch", f);
    render(<DocumentAttachments refType="grn" refId="grn-9" />);
    await screen.findByText(/no attachments/i);
    const url = String((f.mock.calls as any)[0][0]);
    expect(url).toContain("refType=grn");
    expect(url).toContain("refId=grn-9");
  });

  it("shows the empty state with upload hint when there are no docs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
    );
    render(<DocumentAttachments refType="po" refId="po-1" />);
    expect(
      await screen.findByText(/no attachments yet — click upload to add one/i),
    ).toBeInTheDocument();
  });

  it("renders the Upload button by default, hides it in readOnly mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
    );
    const { unmount } = render(<DocumentAttachments refType="po" refId="po-1" />);
    expect(await screen.findByRole("button", { name: /upload/i })).toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
    );
    render(<DocumentAttachments refType="po" refId="po-1" readOnly />);
    await screen.findByText(/no attachments\.$/i);
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
  });

  it("renders a download link and a delete button per doc (writeable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ data: docs }) })),
    );
    render(<DocumentAttachments refType="po" refId="po-1" />);
    await screen.findByText("drawing.pdf");
    const dl = screen.getByTitle("Download");
    expect(dl).toHaveAttribute("href", "/api/documents/d1/download");
    expect(screen.getByTitle("Delete")).toBeInTheDocument();
  });

  it("surfaces a load error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ success: false, error: "boom" }),
      })),
    );
    render(<DocumentAttachments refType="po" refId="po-1" />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
