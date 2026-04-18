/**
 * previewExport — pure helpers for OPSP export actions.
 *
 * Extracted from the inline `handleDownloadWord` handler in
 * `app/(dashboard)/opsp/page.tsx` (previously lines 163–322).
 *
 * The PDF handler is intentionally NOT extracted here: it relies on a live
 * DOM ref into the preview modal, so it cannot be made pure without
 * threading the ref through. The Word exporter only needs `form` + `users`,
 * which fits the "≤ 3 parameters" rule.
 *
 * These functions are pure (no side effects, no DOM access) except
 * `triggerBlobDownload`, which is a thin wrapper over the standard
 * anchor-download pattern. Kept separate so the blob-builder can be
 * unit-tested without jsdom's URL/anchor quirks.
 */

import type { OPSPFormData } from "../types";
import type { FileChild } from "docx";

export interface OPSPWordUser {
  id: string;
  firstName: string;
  lastName: string;
}

/** Strip HTML tags from a rich-text string, collapse to plain text. */
export function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").trim() || " ";
}

/** Resolve a user id to "First Last". Returns "" for empty id, id itself if unknown. */
export function resolveOwnerName(id: string, users: OPSPWordUser[]): string {
  if (!id) return "";
  const u = users.find((x) => x.id === id);
  return u ? `${u.firstName} ${u.lastName}` : id;
}

/** Produce the filename for an OPSP Word download. */
export function wordFilename(form: Pick<OPSPFormData, "year" | "quarter">): string {
  return `OPSP_${form.year}_${form.quarter}.docx`;
}

/**
 * Build a Word (.docx) Blob from the OPSP form data.
 *
 * Pure function: dynamically imports `docx` so this module stays cheap
 * outside the export path. Returns a Blob ready for download.
 */
export async function buildOPSPWordBlob(
  form: OPSPFormData,
  users: OPSPWordUser[],
): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    HeadingLevel,
    PageOrientation,
  } = await import("docx");

  const ownerName = (id: string) => resolveOwnerName(id, users);

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text, bold: true })],
    });
  const subheading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text, bold: true })],
    });
  const para = (text: string) =>
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun(text || " ")] });
  const numbered = (items: string[]) =>
    items
      .filter(Boolean)
      .map(
        (t, i) =>
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun(`${i + 1}. ${t}`)],
          }),
      );

  const simpleBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const cellBorders = {
    top: simpleBorder,
    bottom: simpleBorder,
    left: simpleBorder,
    right: simpleBorder,
  };

  function makeTable(headers: string[], dataRows: string[][]) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: headers.map(
            (h) =>
              new TableCell({
                borders: cellBorders,
                children: [
                  new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] }),
                ],
              }),
          ),
        }),
        ...dataRows.map(
          (cells) =>
            new TableRow({
              children: cells.map(
                (c) =>
                  new TableCell({
                    borders: cellBorders,
                    children: [
                      new Paragraph({ children: [new TextRun({ text: c || " ", size: 18 })] }),
                    ],
                  }),
              ),
            }),
        ),
      ],
    });
  }

  // docx runtime values are dynamically imported above, but the FileChild
  // type is a pure type import so TypeScript can give us a proper element type.
  const sections: FileChild[] = [];

  // Title
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `One-Page Strategic Plan (OPSP) \u2014 ${form.year} ${form.quarter}`,
          bold: true,
        }),
      ],
    }),
  );

  // PEOPLE
  sections.push(heading("PEOPLE (Reputation Drivers)"));
  sections.push(subheading("Employees"));
  sections.push(...numbered(form.employees));
  sections.push(subheading("Customers"));
  sections.push(...numbered(form.customers));
  sections.push(subheading("Shareholders"));
  sections.push(...numbered(form.shareholders));

  // Core Values / Purpose / Actions
  sections.push(heading("CORE VALUES / BELIEFS"));
  sections.push(para(stripHtml(form.coreValues)));
  sections.push(heading("PURPOSE"));
  sections.push(para(stripHtml(form.purpose)));
  sections.push(subheading("Actions \u2014 To Live Values, Purposes, BHAG"));
  sections.push(...numbered(form.actions));
  sections.push(subheading("Profit per X"));
  sections.push(para(stripHtml(form.profitPerX)));
  sections.push(subheading("BHAG"));
  sections.push(para(stripHtml(form.bhag)));

  // Targets
  sections.push(heading("TARGETS (3-5 YRS.)"));
  sections.push(
    makeTable(
      ["Category", "Projected"],
      form.targetRows.filter((r) => r.category).map((r) => [r.category, r.projected]),
    ),
  );
  sections.push(subheading("Sandbox"));
  sections.push(para(stripHtml(form.sandbox)));
  sections.push(subheading("Key Thrusts / Capabilities"));
  sections.push(
    ...form.keyThrusts
      .filter((r) => r.desc)
      .map(
        (r, i) =>
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun(`${i + 1}. ${r.desc}${r.owner ? ` \u2014 ${ownerName(r.owner)}` : ""}`),
            ],
          }),
      ),
  );
  sections.push(subheading("Brand Promise KPIs"));
  sections.push(para(stripHtml(form.brandPromiseKPIs)));
  sections.push(subheading("Brand Promise"));
  sections.push(para(stripHtml(form.brandPromise)));

  // Goals
  sections.push(heading("GOALS (1 YR.)"));
  sections.push(
    makeTable(
      ["Category", "Projected"],
      form.goalRows.filter((r) => r.category).map((r) => [r.category, r.projected]),
    ),
  );
  sections.push(subheading("Key Initiatives"));
  sections.push(
    ...form.keyInitiatives
      .filter((r) => r.desc)
      .map(
        (r, i) =>
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun(`${i + 1}. ${r.desc}${r.owner ? ` \u2014 ${ownerName(r.owner)}` : ""}`),
            ],
          }),
      ),
  );

  // Strengths / Weaknesses
  sections.push(heading("Strengths / Core Competencies"));
  sections.push(...numbered(form.processItems));
  sections.push(heading("Weaknesses"));
  sections.push(...numbered(form.weaknesses));

  // Process
  sections.push(heading("PROCESS (Productivity Drivers)"));
  sections.push(subheading("Make/Buy"));
  sections.push(...numbered(form.makeBuy));
  sections.push(subheading("Sell"));
  sections.push(...numbered(form.sell));
  sections.push(subheading("Record Keeping"));
  sections.push(...numbered(form.recordKeeping));

  // Actions QTR
  sections.push(heading("ACTIONS (QTR)"));
  sections.push(
    makeTable(
      ["Category", "Projected"],
      form.actionsQtr.filter((r) => r.category).map((r) => [r.category, r.projected]),
    ),
  );
  sections.push(subheading("Rocks \u2014 Quarterly Priorities"));
  sections.push(
    ...form.rocks
      .filter((r) => r.desc)
      .map(
        (r, i) =>
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun(`${i + 1}. ${r.desc}${r.owner ? ` \u2014 ${ownerName(r.owner)}` : ""}`),
            ],
          }),
      ),
  );

  // Theme
  sections.push(heading("THEME"));
  sections.push(para(stripHtml(form.theme)));
  sections.push(subheading("Scoreboard Design"));
  sections.push(para(stripHtml(form.scoreboardDesign)));
  sections.push(subheading("Celebration"));
  sections.push(para(stripHtml(form.celebration)));
  sections.push(subheading("Reward"));
  sections.push(para(stripHtml(form.reward)));

  // Your Accountability
  sections.push(heading("YOUR ACCOUNTABILITY"));
  sections.push(
    makeTable(
      ["S.no.", "KPIs", "Goal"],
      form.kpiAccountability
        .filter((r) => r.kpi)
        .map((r, i) => [String(i + 1).padStart(2, "0"), r.kpi, r.goal]),
    ),
  );
  sections.push(subheading("Quarterly Priorities"));
  sections.push(
    makeTable(
      ["S.no.", "Priority", "Due"],
      form.quarterlyPriorities
        .filter((r) => r.priority)
        .map((r, i) => [String(i + 1).padStart(2, "0"), r.priority, r.dueDate || ""]),
    ),
  );

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
        children: sections,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/**
 * Trigger a browser download of a Blob. Side-effecting wrapper kept
 * separate so tests can unit-test the pure builder without jsdom.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
