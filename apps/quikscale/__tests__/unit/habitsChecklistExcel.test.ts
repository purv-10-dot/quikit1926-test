import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  buildHabitsChecklistWorkbook,
  type ParticipationExport,
} from "@/lib/exports/habitsChecklistExcel";
import {
  aggregateResponses,
  HABIT_KEYS,
  HABIT_DEFINITIONS,
  type CampaignAggregate,
} from "@/lib/schemas/habitSchema";

/**
 * Full-scenario coverage for the Habits Checklist export:
 *   - both worksheets present (and omitted correctly)
 *   - empty (0-respondent) campaign renders without crashing
 *   - parent Count = SUM of sub-item yes-counts (reference behaviour)
 *   - the green → peach → red colour ramp lands on the right band at each boundary
 *   - the colour-code legend is a top-right side panel
 *   - participation: submitted-first ordering, status colours, email-only names
 */

// --- helpers ---------------------------------------------------------------

async function readBack(buf: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

function fillOf(cell: ExcelJS.Cell): string | undefined {
  return (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
}

/** A one-habit aggregate whose four sub-items carry the given percentages. */
function aggWithSubPcts(subPcts: number[]): CampaignAggregate {
  const key = HABIT_KEYS[0];
  const subItems = subPcts.map((pct, i) => ({
    index: i,
    label: `sub ${i}`,
    yes: Math.round(pct * 10),
    total: 10,
    pct,
  }));
  const parentPct = subItems.reduce((s, x) => s + x.pct, 0) / 4;
  return {
    respondentCount: 10,
    overallPct: parentPct,
    habitsAtMax: 0,
    totalOutOf40: Math.round(parentPct * 40),
    perHabit: [
      { key, label: HABIT_DEFINITIONS[key].label, subItems, pct: parentPct, avgYes: 0 },
    ],
  };
}

// One respondent who answered each habit yes/no/yes/no → every habit at 50%.
const oneResp = aggregateResponses([
  { subItemBits: Object.fromEntries(HABIT_KEYS.map((k) => [k, [true, false, true, false]])) },
]);

const participation: ParticipationExport = {
  total: 3,
  submitted: 1,
  pending: 2,
  members: [
    { name: "Alok Shukla", email: "alok@x.com", role: "member", hasSubmitted: true, submittedAt: "2026-06-05T10:00:00.000Z" },
    { name: "Himanshu Pandey", email: "hp@x.com", role: "team_head", hasSubmitted: false, submittedAt: null },
    { name: "bob@x.com", email: "bob@x.com", role: null, hasSubmitted: false, submittedAt: null },
  ],
};

// --- worksheet structure ---------------------------------------------------

describe("worksheet structure", () => {
  it("includes only the checklist sheet when participation is omitted", async () => {
    const wb = await readBack(await buildHabitsChecklistWorkbook(oneResp, "Q1 2026"));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Habits Checklist"]);
  });

  it("adds a Participation sheet when participation data is passed", async () => {
    const wb = await readBack(await buildHabitsChecklistWorkbook(oneResp, "Q1 2026", participation));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Habits Checklist", "Participation"]);
  });

  it("renders the title box and peach participant badge with the respondent count", async () => {
    const wb = await readBack(await buildHabitsChecklistWorkbook(oneResp, "Q3 2026 · Round 2"));
    const ws = wb.getWorksheet("Habits Checklist")!;
    expect(ws.getCell(2, 2).value).toBe("Rockefeller Habits Checklist");
    expect(ws.getCell(2, 2).border?.top?.style).toBe("medium"); // green box
    expect(ws.getCell(2, 4).value).toBe("No. of\nParticipants");
    expect(ws.getCell(2, 5).value).toBe(oneResp.respondentCount);
    expect(fillOf(ws.getCell(2, 5))).toBe("FFF8CBAD"); // peach badge
    // Campaign label flows into the caption.
    expect(String(ws.getCell(3, 2).value)).toContain("Q3 2026 · Round 2");
  });
});

// --- empty campaign --------------------------------------------------------

describe("empty (0-respondent) campaign", () => {
  const empty = aggregateResponses([]);

  it("builds both sheets without crashing and shows em-dashes", async () => {
    const wb = await readBack(
      await buildHabitsChecklistWorkbook(empty, "Q1 2026", {
        total: 2,
        submitted: 0,
        pending: 2,
        members: [
          { name: "A", email: "a@x.com", role: "member", hasSubmitted: false, submittedAt: null },
          { name: "B", email: "b@x.com", role: "member", hasSubmitted: false, submittedAt: null },
        ],
      }),
    );
    const ws = wb.getWorksheet("Habits Checklist")!;
    expect(ws.getCell(2, 5).value).toBe(0); // badge count 0
    // Parent row (row 6): Count and % both "—", no fill on the % cell.
    expect(ws.getCell(6, 4).value).toBe("—");
    expect(ws.getCell(6, 5).value).toBe("—");
    expect(fillOf(ws.getCell(6, 5))).toBeUndefined();
  });
});

// --- parent count = sum of sub yes ----------------------------------------

describe("parent Count column", () => {
  it("equals the SUM of the four sub-item yes-counts (not the average)", async () => {
    // 1 respondent, habit1 answered yes/no/yes/no → sub yes = 1,0,1,0 → sum 2.
    const wb = await readBack(await buildHabitsChecklistWorkbook(oneResp, "Q1 2026"));
    const ws = wb.getWorksheet("Habits Checklist")!;
    expect(ws.getCell(6, 4).value).toBe(2); // parent row Count
    expect(ws.getCell(7, 4).value).toBe(1); // sub a yes
    expect(ws.getCell(8, 4).value).toBe(0); // sub b yes
  });
});

// --- colour ramp boundaries ------------------------------------------------

describe("colour ramp boundaries", () => {
  // Sub-item rows for the single habit are rows 7,8,9,10 (parent is row 6).
  const cases: Array<[number, string, string]> = [
    [0.97, "FF63BE7B", "≥95 strong green"],
    [0.95, "FF63BE7B", "95 boundary → strong green"],
    [0.94, "FFA9D08E", "94 → light green"],
    [0.8, "FFA9D08E", "80 boundary → light green"],
    [0.72, "FFC6E0B4", "65–79 → pale green"],
    [0.6, "FFDDEAB4", "55–64 → yellow-green"],
    [0.45, "FFF8CBAD", "35–54 → peach"],
    [0.35, "FFF8CBAD", "35 boundary → peach"],
    [0.34, "FFF4A8A8", "below 35 → red"],
    [0, "FFF4A8A8", "0 → red"],
  ];

  it.each(cases)("pct %f → %s (%s)", async (pct, expected) => {
    const wb = await readBack(
      await buildHabitsChecklistWorkbook(aggWithSubPcts([pct, pct, pct, pct]), "Q1 2026"),
    );
    const ws = wb.getWorksheet("Habits Checklist")!;
    expect(fillOf(ws.getCell(7, 5))).toBe(expected); // first sub-item % cell
  });
});

// --- legend side panel -----------------------------------------------------

describe("colour-code legend", () => {
  it("is a top-right side panel (col G/H), not at the bottom-left", async () => {
    const wb = await readBack(await buildHabitsChecklistWorkbook(oneResp, "Q1 2026"));
    const ws = wb.getWorksheet("Habits Checklist")!;
    expect(ws.getCell(2, 7).value).toBe("Colour code (% agreement)");
    expect(fillOf(ws.getCell(3, 7))).toBe("FF63BE7B"); // top swatch
    expect(ws.getCell(3, 8).value).toBe("95–100%");
    expect(fillOf(ws.getCell(8, 7))).toBe("FFF4A8A8"); // bottom swatch
    expect(ws.getCell(8, 8).value).toBe("Below 35%");
    // Column B at those rows holds nothing legend-related (it's table/blank).
    expect(ws.getCell(3, 2).value).not.toBe("95–100%");
  });
});

// --- participation sheet ---------------------------------------------------

describe("Participation sheet", () => {
  it("lists submitted first, colours status, and humanizes roles", async () => {
    const wb = await readBack(await buildHabitsChecklistWorkbook(oneResp, "Q1 2026", participation));
    const ws = wb.getWorksheet("Participation")!;

    // Rows: title, sub, spacer, header = 1..4 → data starts row 5.
    const r5 = ws.getRow(5);
    expect(r5.getCell(1).value).toBe("Alok Shukla");
    expect(r5.getCell(4).value).toBe("Submitted");
    expect(fillOf(r5.getCell(4))).toBe("FFDCFCE7"); // green-100

    const r6 = ws.getRow(6);
    expect(r6.getCell(4).value).toBe("Pending");
    expect(fillOf(r6.getCell(4))).toBe("FFFEF3C7"); // amber-100
    expect(r6.getCell(3).value).toBe("Team Head"); // role humanized

    // Email-only member: name falls back to the email, role "—".
    const r7 = ws.getRow(7);
    expect(r7.getCell(1).value).toBe("bob@x.com");
    expect(r7.getCell(3).value).toBe("—");
  });
});
