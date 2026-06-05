/**
 * Server-side Excel builder for the Rockefeller Habits Checklist.
 *
 * The on-screen table (ChecklistTable.tsx) colour-grades each % cell with a
 * green → lime → amber → red ramp (see `pctTone` there). This export
 * reproduces the SAME colour code in the spreadsheet so the printed/shared
 * xlsx reads identically to the dashboard.
 *
 * Runs server-side (called from the export route) so `exceljs` never has to
 * be bundled into the browser — mirrors the Client Meetings export pattern.
 */
import ExcelJS from "exceljs";
import {
  HABIT_DEFINITIONS,
  type CampaignAggregate,
} from "@/lib/schemas/habitSchema";
import { workbookToBuffer } from "@/lib/exports/clientMeetingsExcel";

/**
 * ARGB equivalents of the Tailwind classes used by `pctTone` in
 * ChecklistTable.tsx. Kept in lock-step with the UI ramp:
 *
 *   >= 85  green-300 / green-900
 *   >= 75  green-200 / green-800
 *   >= 65  green-100 / green-800
 *   >= 55  lime-100  / lime-800
 *   >= 45  amber-100 / amber-800
 *    < 45  red-100   / red-700
 */
type Tone = { bg: string; text: string };

/**
 * Green → yellow-green → peach → red scale matching the reference checklist
 * design: strong green at the top fading through lime to a peach mid-band and
 * a salmon red at the bottom. The bands line up with the reference's data
 * points (100% strong green, 82–86% light green, 61% lime, 43% peach, 14% red).
 */
function pctToneArgb(pct: number): Tone {
  const v = pct * 100;
  if (v >= 95) return { bg: "FF63BE7B", text: "FF14532D" }; // strong green
  if (v >= 80) return { bg: "FFA9D08E", text: "FF1B5E20" }; // light green
  if (v >= 65) return { bg: "FFC6E0B4", text: "FF33691E" }; // pale green
  if (v >= 55) return { bg: "FFDDEAB4", text: "FF556B2F" }; // yellow-green
  if (v >= 35) return { bg: "FFF8CBAD", text: "FF7C2D12" }; // peach
  return { bg: "FFF4A8A8", text: "FF7F1D1D" }; // salmon red
}

const BORDER = "FFD0D7DE"; // soft grey grid line
const HEADER_FILL = "FFF8FAFC"; // ~ bg-gray-50 (Participation sheet header)
const TITLE_BORDER = "FF2E7D32"; // green box around the title
const BADGE_FILL = "FFF8CBAD"; // peach "No. of Participants" badge

/** Estimate a wrapped-row height for a statement at the given column width (chars). */
function wrappedHeight(text: string, colChars: number, lineH = 15, pad = 6): number {
  const lines = Math.max(1, Math.ceil(text.length / colChars));
  return lines * lineH + pad;
}

/** One participant row for the Participation sheet (mirrors the dashboard panel). */
export type ParticipationExportMember = {
  name: string;
  email: string;
  role: string | null;
  hasSubmitted: boolean;
  submittedAt: string | null;
};

export type ParticipationExport = {
  total: number;
  submitted: number;
  pending: number;
  members: ParticipationExportMember[];
};

/**
 * Build the Habits Checklist workbook and return it as an ArrayBuffer ready to
 * stream from a route handler. The layout mirrors the on-screen table: a title
 * block, a #/Habits/Count/% header, then each habit (bold parent row) with its
 * four indented sub-items, plus a colour-code legend so the ramp is
 * self-documenting in the sheet.
 */
export async function buildHabitsChecklistWorkbook(
  aggregate: CampaignAggregate,
  campaignLabel: string,
  participation?: ParticipationExport,
): Promise<ArrayBuffer> {
  const hasData = aggregate.respondentCount > 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "QuikScale";
  const ws = wb.addWorksheet("Habits Checklist");

  // Columns: A = left margin, B = #, C = Habits, D = Count, E = %.
  // The habit text column (C) is wide; the rest are narrow like the reference.
  const HABIT_COL_CHARS = 95;
  ws.columns = [
    { width: 3 }, // A — margin
    { width: 6 }, // B — #
    { width: HABIT_COL_CHARS }, // C — Habits
    { width: 12 }, // D — Count
    { width: 12 }, // E — %
  ];

  const thinAll = {
    top: { style: "thin" as const, color: { argb: BORDER } },
    bottom: { style: "thin" as const, color: { argb: BORDER } },
    left: { style: "thin" as const, color: { argb: BORDER } },
    right: { style: "thin" as const, color: { argb: BORDER } },
  };

  ws.addRow([]); // row 1 — top margin
  ws.getRow(1).height = 6;

  // --- Title block (row 2): bordered title + peach participant badge -------
  const titleRow = ws.addRow(["", "Rockefeller Habits Checklist", "", "No. of Participants", aggregate.respondentCount]);
  titleRow.height = 40;
  ws.mergeCells(titleRow.number, 2, titleRow.number, 3); // B:C title
  const titleCell = titleRow.getCell(2);
  titleCell.font = { bold: true, size: 18, color: { argb: "FF111827" } };
  titleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  const greenBox = {
    top: { style: "medium" as const, color: { argb: TITLE_BORDER } },
    bottom: { style: "medium" as const, color: { argb: TITLE_BORDER } },
    left: { style: "medium" as const, color: { argb: TITLE_BORDER } },
    right: { style: "medium" as const, color: { argb: TITLE_BORDER } },
  };
  titleRow.getCell(2).border = greenBox;
  titleRow.getCell(3).border = greenBox;

  const badgeLabel = titleRow.getCell(4);
  badgeLabel.value = "No. of\nParticipants";
  badgeLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BADGE_FILL } };
  badgeLabel.font = { bold: true, size: 10, color: { argb: "FF7C2D12" } };
  badgeLabel.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  const badgeNum = titleRow.getCell(5);
  badgeNum.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BADGE_FILL } };
  badgeNum.font = { bold: true, size: 22, color: { argb: "FF111827" } };
  badgeNum.alignment = { horizontal: "center", vertical: "middle" };

  // Sub-caption row (which campaign / how many responses).
  const respLabel = `${aggregate.respondentCount} ${
    aggregate.respondentCount === 1 ? "submitted response" : "submitted responses"
  }`;
  const subRow = ws.addRow(["", `Aggregate of ${respLabel} · ${campaignLabel}`]);
  ws.mergeCells(subRow.number, 2, subRow.number, 5);
  subRow.getCell(2).font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };

  ws.addRow([]).height = 4; // spacer

  // --- Header row (# / Habits) --------------------------------------------
  const header = ws.addRow(["", "#", "Habits"]);
  [2, 3].forEach((col) => {
    const cell = header.getCell(col);
    cell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
    cell.alignment = { horizontal: col === 2 ? "center" : "left", vertical: "middle", indent: col === 3 ? 1 : 0 };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER } } };
  });
  header.height = 20;

  const pctText = (pct: number) => `${Math.round(pct * 100)}%`;

  // --- Habit + sub-item rows ----------------------------------------------
  aggregate.perHabit.forEach((h, idx) => {
    const label = `${HABIT_DEFINITIONS[h.key].label}.`;
    // Parent Count = SUM of the four sub-item yes-counts (matches reference,
    // e.g. 7+6+3+7 = 23), not the rounded average shown on screen.
    const parentCount = h.subItems.reduce((s, x) => s + x.yes, 0);

    const parent = ws.addRow([
      "",
      idx + 1,
      label,
      hasData ? parentCount : "—",
      hasData ? pctText(h.pct) : "—",
    ]);
    parent.height = wrappedHeight(label, HABIT_COL_CHARS, 16, 8);
    parent.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    parent.getCell(2).font = { bold: true, size: 12, color: { argb: "FF111827" } };
    parent.getCell(3).font = { bold: true, size: 12, color: { argb: "FF111827" } };
    parent.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
    parent.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    parent.getCell(4).font = { bold: true, size: 12, color: { argb: "FF111827" } };
    [2, 3, 4].forEach((c) => (parent.getCell(c).border = thinAll));
    applyPctCell(parent.getCell(5), hasData ? h.pct : null);

    // Sub-item rows (a, b, c, d)
    h.subItems.forEach((s) => {
      const letter = ["a", "b", "c", "d"][s.index] ?? "?";
      const text = `${s.label}.`;
      const row = ws.addRow(["", letter, text, hasData ? s.yes : "—", hasData ? pctText(s.pct) : "—"]);
      row.height = wrappedHeight(text, HABIT_COL_CHARS, 15, 6);
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(2).font = { color: { argb: "FF6B7280" }, size: 11 };
      row.getCell(3).font = { color: { argb: "FF374151" }, size: 11 };
      row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(4).font = { color: { argb: "FF374151" }, size: 11 };
      [2, 3, 4].forEach((c) => (row.getCell(c).border = thinAll));
      applyPctCell(row.getCell(5), hasData ? s.pct : null);
    });

    ws.addRow([]).height = 6; // gap between habit groups
  });

  // --- Colour-code legend (side panel, top-right of the table) -------------
  // Placed in the empty columns beside the checklist (starting col G) and
  // anchored to the top so it's visible the moment the sheet opens — not
  // marooned in the bottom-left corner.
  const LG = 7; // column G
  ws.getColumn(6).width = 3; // F — gap before the legend
  ws.getColumn(LG).width = 7; // G — colour swatch
  ws.getColumn(LG + 1).width = 16; // H — label

  const legend: Array<[string, number]> = [
    ["95–100%", 0.97],
    ["80–94%", 0.87],
    ["65–79%", 0.72],
    ["55–64%", 0.6],
    ["35–54%", 0.45],
    ["Below 35%", 0.2],
  ];

  // Title bar across the swatch + label columns.
  ws.mergeCells(2, LG, 2, LG + 1);
  const legTitle = ws.getCell(2, LG);
  legTitle.value = "Colour code (% agreement)";
  legTitle.font = { bold: true, size: 10, color: { argb: "FF374151" } };
  legTitle.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  legTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  ws.getCell(2, LG).border = thinAll;
  ws.getCell(2, LG + 1).border = thinAll;

  legend.forEach(([label, sample], i) => {
    const r = 3 + i;
    const tone = pctToneArgb(sample);
    const swatch = ws.getCell(r, LG);
    swatch.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone.bg } };
    swatch.border = thinAll;
    const lab = ws.getCell(r, LG + 1);
    lab.value = label;
    lab.font = { bold: true, size: 10, color: { argb: tone.text } };
    lab.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    lab.border = thinAll;
  });

  // --- Participation sheet -------------------------------------------------
  if (participation) {
    addParticipationSheet(wb, participation, campaignLabel);
  }

  return workbookToBuffer(wb);
}

const SUBMITTED_FILL = "FFDCFCE7"; // green-100
const SUBMITTED_TEXT = "FF166534"; // green-800
const PENDING_FILL = "FFFEF3C7"; // amber-100
const PENDING_TEXT = "FF92400E"; // amber-800

/**
 * Second worksheet: who has submitted vs. who is still pending. Mirrors the
 * Participation panel — submitted rows tinted green, pending rows amber.
 * Submitted members are listed first (matching the panel's ordering).
 */
function addParticipationSheet(
  wb: ExcelJS.Workbook,
  participation: ParticipationExport,
  campaignLabel: string,
): void {
  const ws = wb.addWorksheet("Participation");
  ws.columns = [
    { width: 32 }, // Name
    { width: 34 }, // Email
    { width: 22 }, // Role
    { width: 14 }, // Status
    { width: 22 }, // Submitted at
  ];

  const pct =
    participation.total === 0
      ? 0
      : Math.round((participation.submitted / participation.total) * 100);

  const titleRow = ws.addRow(["Participation"]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 5);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 22;

  const subRow = ws.addRow([
    `${participation.submitted} of ${participation.total} submitted · ${pct}% · ${campaignLabel}`,
  ]);
  ws.mergeCells(subRow.number, 1, subRow.number, 5);
  subRow.getCell(1).font = { color: { argb: "FF6B7280" }, size: 10 };

  ws.addRow([]); // spacer

  const header = ws.addRow(["Name", "Email", "Role", "Status", "Submitted At"]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF6B7280" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
    };
  });

  // Submitted first, then pending — same order as the dashboard panel.
  const ordered = [
    ...participation.members.filter((m) => m.hasSubmitted),
    ...participation.members.filter((m) => !m.hasSubmitted),
  ];

  ordered.forEach((m) => {
    const submittedAt = m.submittedAt
      ? new Date(m.submittedAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";
    const row = ws.addRow([
      m.name,
      m.email,
      m.role ? humanizeRole(m.role) : "—",
      m.hasSubmitted ? "Submitted" : "Pending",
      submittedAt,
    ]);
    row.getCell(1).font = { color: { argb: "FF111827" }, bold: true };
    row.getCell(2).font = { color: { argb: "FF374151" } };
    row.getCell(3).font = { color: { argb: "FF374151" } };

    const statusCell = row.getCell(4);
    statusCell.alignment = { horizontal: "center", vertical: "middle" };
    statusCell.font = {
      bold: true,
      color: { argb: m.hasSubmitted ? SUBMITTED_TEXT : PENDING_TEXT },
    };
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: m.hasSubmitted ? SUBMITTED_FILL : PENDING_FILL },
    };

    row.getCell(5).font = { color: { argb: "FF6B7280" } };
  });
}

/** "super_admin" → "Super Admin" — matches the dashboard panel's role label. */
function humanizeRole(role: string): string {
  return role
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Colour a single % cell with the same ramp as the UI. `null` pct (no data
 * yet) renders a plain greyed "—" — matching the dashboard's empty state.
 */
function applyPctCell(cell: ExcelJS.Cell, pct: number | null): void {
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = {
    top: { style: "thin", color: { argb: BORDER } },
    bottom: { style: "thin", color: { argb: BORDER } },
    left: { style: "thin", color: { argb: BORDER } },
    right: { style: "thin", color: { argb: BORDER } },
  };
  if (pct === null) {
    cell.value = "—";
    cell.font = { color: { argb: "FF9CA3AF" } };
    return;
  }
  const tone = pctToneArgb(pct);
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone.bg } };
  cell.font = { bold: true, size: 12, color: { argb: tone.text } };
}
