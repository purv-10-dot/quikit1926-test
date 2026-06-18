// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadCsv } from "@/lib/csv";
import type { CsvColumn } from "@/lib/csv";

/**
 * downloadCsv has no return value — it builds a Blob and triggers a browser
 * download. We capture the CSV text by spying on the Blob constructor (which
 * receives the joined lines) and stub the DOM/URL plumbing jsdom doesn't
 * implement.
 */

let blobParts: string[] = [];
let createdAnchors: HTMLAnchorElement[] = [];

// Capture the genuine createElement ONCE, before any spy is installed, so the
// spy implementation never re-enters itself (clearMocks wipes the impl between
// tests but leaves the spy wrapper in place — re-binding to it would recurse).
const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  blobParts = [];
  createdAnchors = [];
  // override for capture — must be a real constructor
  global.Blob = class {
    constructor(parts: string[]) {
      blobParts = parts;
    }
  } as unknown as typeof Blob;
  // jsdom doesn't implement createObjectURL / revokeObjectURL
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
  // anchor.click is a no-op in jsdom but ensure it doesn't navigate
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreateElement(tag);
    if (tag === "a") createdAnchors.push(el as HTMLAnchorElement);
    return el as any;
  });
});

function csvText(): string {
  return blobParts.join("");
}

interface Row {
  name: string;
  qty: number;
  note: string | null;
}

const columns: CsvColumn<Row>[] = [
  { header: "Name", get: (r) => r.name },
  { header: "Qty", get: (r) => r.qty },
  { header: "Note", get: (r) => r.note },
];

describe("downloadCsv", () => {
  it("writes a header row followed by data rows", () => {
    downloadCsv("out", [{ name: "Cement", qty: 5, note: "ok" }], columns);
    expect(csvText()).toBe("Name,Qty,Note\nCement,5,ok");
  });

  it("emits an empty value for null/undefined cells", () => {
    downloadCsv("out", [{ name: "Sand", qty: 0, note: null }], columns);
    expect(csvText()).toBe("Name,Qty,Note\nSand,0,");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    downloadCsv(
      "out",
      [{ name: 'A,B "C"', qty: 1, note: "line1\nline2" }],
      columns,
    );
    // comma+quote field → wrapped in quotes with doubled inner quotes;
    // newline field → wrapped in quotes
    expect(csvText()).toBe('Name,Qty,Note\n"A,B ""C""",1,"line1\nline2"');
  });

  it("produces only the header row for an empty dataset", () => {
    downloadCsv("out", [], columns);
    expect(csvText()).toBe("Name,Qty,Note");
  });

  it("appends .csv to the download filename when missing", () => {
    downloadCsv("report", [{ name: "x", qty: 1, note: "y" }], columns);
    expect(createdAnchors[0].download).toBe("report.csv");
  });

  it("keeps an existing .csv extension as-is", () => {
    downloadCsv("report.csv", [], columns);
    expect(createdAnchors[0].download).toBe("report.csv");
  });
});
