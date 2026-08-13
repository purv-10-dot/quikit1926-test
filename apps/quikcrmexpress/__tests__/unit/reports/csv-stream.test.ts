import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { escapeCsvCell, streamCsv } from "@/lib/services/reports/csv-stream";

// Read CSV body keeping the leading UTF-8 BOM intact. Response.text()
// silently drops it during UTF-8 decode (it's treated as a signature),
// which would mask the very thing the BOM test is checking.
async function readBodyWithBom(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  return decoder.decode(buf);
}

const BOM = "﻿";

async function* fromArray<T>(arr: T[]): AsyncIterable<T> {
  for (const item of arr) yield item;
}

describe("escapeCsvCell", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("returns plain values unchanged when safe", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("wraps + escapes values containing comma, quote, CR, or LF", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell("line1\rline2")).toBe('"line1\rline2"');
  });

  it("formats Date as ISO 8601", () => {
    const d = new Date("2025-01-15T10:00:00Z");
    expect(escapeCsvCell(d)).toBe("2025-01-15T10:00:00.000Z");
  });
});

describe("streamCsv", () => {
  beforeEach(() => {
    delete process.env.REPORTS_CSV_MAX_ROWS;
  });

  afterEach(() => {
    delete process.env.REPORTS_CSV_MAX_ROWS;
  });

  it("emits BOM as the first 3 bytes and a header row", async () => {
    const res = streamCsv(
      fromArray([{ id: "1", name: "Alice" }]),
      [
        { key: "id", label: "Id" },
        { key: "name", label: "Name" },
      ],
      "test",
    );
    const body = await readBodyWithBom(res as unknown as Response);
    expect(body.startsWith(BOM)).toBe(true);
    expect(body.slice(BOM.length).split("\r\n")[0]).toBe("Id,Name");
  });

  it("sets text/csv content type and attachment header", async () => {
    const res = streamCsv(fromArray([]), [{ key: "x", label: "X" }], "my file");
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="my_file.csv"');
  });

  it("escapes special characters in row values", async () => {
    const res = streamCsv(
      fromArray([{ name: 'A,B "C"' }]),
      [{ key: "name", label: "Name" }],
      "x",
    );
    const body = await readBodyWithBom(res as unknown as Response);
    const lines = body.slice(BOM.length).split("\r\n");
    expect(lines[1]).toBe('"A,B ""C"""');
  });

  it("uses the format() function on a column when provided", async () => {
    const res = streamCsv(
      fromArray([{ amount: 1234 }]),
      [{ key: "amount", label: "Amount", format: (r) => Number(r.amount) * 2 }],
      "x",
    );
    const body = await readBodyWithBom(res as unknown as Response);
    expect(body.slice(BOM.length).split("\r\n")[1]).toBe("2468");
  });

  it("honors REPORTS_CSV_MAX_ROWS env cap", async () => {
    process.env.REPORTS_CSV_MAX_ROWS = "10";
    const fifty = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }));
    const res = streamCsv(fromArray(fifty), [{ key: "id", label: "Id" }], "x");
    const body = await readBodyWithBom(res as unknown as Response);
    const dataLines = body.slice(BOM.length).split("\r\n").filter(Boolean);
    // header + 10 data rows
    expect(dataLines.length).toBe(11);
  });

  it("honors explicit maxRows option (trumps env)", async () => {
    process.env.REPORTS_CSV_MAX_ROWS = "100";
    const fifty = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }));
    const res = streamCsv(
      fromArray(fifty),
      [{ key: "id", label: "Id" }],
      "x",
      { maxRows: 5 },
    );
    const body = await readBodyWithBom(res as unknown as Response);
    const dataLines = body.slice(BOM.length).split("\r\n").filter(Boolean);
    expect(dataLines.length).toBe(6);
  });

  it("streams large inputs without exhausting memory (smoke)", async () => {
    const big = Array.from({ length: 2500 }, (_, i) => ({ id: String(i), value: i }));
    const res = streamCsv(
      fromArray(big),
      [
        { key: "id", label: "Id" },
        { key: "value", label: "Value" },
      ],
      "x",
    );
    const body = await readBodyWithBom(res as unknown as Response);
    const dataLines = body.slice(BOM.length).split("\r\n").filter(Boolean);
    expect(dataLines.length).toBe(2501);
    expect(dataLines[1]).toBe("0,0");
    expect(dataLines[2500]).toBe("2499,2499");
  });
});
