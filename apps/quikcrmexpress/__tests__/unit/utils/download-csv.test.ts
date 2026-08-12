// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { downloadCsvFile } from "@/lib/utils/download-csv";

describe("downloadCsvFile", () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let appended: HTMLAnchorElement | null;

  beforeEach(() => {
    clickSpy = vi.fn();
    appended = null;
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:mock"),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      appended = node as HTMLAnchorElement;
      appended.click = clickSpy;
      return node;
    });
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets .csv filename and text/csv blob type", () => {
    downloadCsvFile("name,email\nA,a@b.com", "leads-import-example.csv");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(appended?.download).toBe("leads-import-example.csv");
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8;");
  });

  it("appends .csv when filename has no extension", () => {
    downloadCsvFile("a", "leads-import-example");
    expect(appended?.download).toBe("leads-import-example.csv");
  });
});
