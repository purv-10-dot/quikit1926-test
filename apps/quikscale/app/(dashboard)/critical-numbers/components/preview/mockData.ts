/**
 * Mock data backing the "Preview — sample data" section embedded in the real
 * critical-numbers/page.tsx. Delete this whole `components/preview/` folder
 * once that section is wired to the real API and no longer needed.
 *
 * Shaped like the real record ({...CriticalNumber, category/subCategory name,
 * history: CriticalNumberUpdate[]}) so swapping in `useCriticalNumbers` +
 * a real history hook later is a drop-in, not a rewrite.
 */

import type { CriticalNumberFrequency, MeasurementUnit } from "@/lib/schemas/criticalNumberSchema";

export interface MockUpdate {
  date: string; // ISO date, oldest-first — same order the real GET returns
  value: number;
  comment?: string | null;
  /** Display name only in this mock — the real column is a User id. */
  createdBy?: string;
}

export interface MockCriticalNumber {
  id: string;
  title: string;
  categoryName: string;
  subCategoryName: string | null;
  frequency: CriticalNumberFrequency;
  measurementUnit: MeasurementUnit;
  unit: string | null;
  currency: string | null;
  targetScale: string | null;
  targetValue: number;
  currentValue: number;
  /** Oldest-first, mirrors the real `[id]/updates` GET response shape. */
  history: MockUpdate[];
  // Only populated for the record used by the view/edit popup preview — the
  // rest of the mock set never needs to resolve to a real FK.
  ownerId?: string;
  teamId?: string;
  categoryId?: string;
  subCategoryId?: string | null;
}

/** Fake option lists for the popup's pickers — same shape as the real
 *  UserPicker/FilterPicker `options`/`users` props, just hand-rolled. */
export interface MockUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}
export const MOCK_USERS: MockUser[] = [
  { id: "u1", firstName: "Riya", lastName: "Nair", email: "riya.nair@example.com" },
  { id: "u2", firstName: "Karan", lastName: "Mehta", email: "karan.mehta@example.com" },
  { id: "u3", firstName: "Aarav", lastName: "Shah", email: "aarav.shah@example.com" },
];

export interface MockTeam {
  id: string;
  name: string;
}
export const MOCK_TEAMS: MockTeam[] = [
  { id: "t1", name: "Growth" },
  { id: "t2", name: "Revenue" },
];

export interface MockCategory {
  id: string;
  name: string;
}
export const MOCK_CATEGORIES: MockCategory[] = [
  { id: "c1", name: "Sales" },
  { id: "c2", name: "Marketing" },
  { id: "c3", name: "Customer Success" },
  { id: "c4", name: "Operations" },
];

export interface MockSubCategory {
  id: string;
  categoryId: string;
  name: string;
}
export const MOCK_SUB_CATEGORIES: MockSubCategory[] = [
  { id: "sc1", categoryId: "c1", name: "Enterprise" },
  { id: "sc2", categoryId: "c2", name: "Paid" },
  { id: "sc3", categoryId: "c3", name: "Tier 1" },
];

/** Weekly Monday dates going back from a fixed anchor — no `Date.now()`. */
function weeks(anchorIso: string, count: number): string[] {
  const anchor = new Date(anchorIso).getTime();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(anchor - i * 7 * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

function months(anchorIso: string, count: number): string[] {
  const anchor = new Date(anchorIso);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(anchor.getFullYear(), anchor.getMonth() - i, 1).toISOString().slice(0, 10));
  }
  return out;
}

const ANCHOR = "2026-08-04";

function series(dates: string[], values: number[]): MockUpdate[] {
  return dates.map((date, i) => ({ date, value: values[i] }));
}

export const MOCK_CRITICAL_NUMBERS: MockCriticalNumber[] = [
  // ── Sales ────────────────────────────────────────────────────────────
  {
    id: "cn-1",
    title: "New Enterprise Leads",
    categoryName: "Sales",
    subCategoryName: "Enterprise",
    frequency: "weekly",
    measurementUnit: "Number",
    unit: "leads",
    currency: null,
    targetScale: null,
    targetValue: 100,
    currentValue: 132,
    // FKs only needed here — this is the one record the view/edit popup preview opens.
    ownerId: "u1",
    teamId: "t1",
    categoryId: "c1",
    subCategoryId: "sc1",
    history: weeks(ANCHOR, 6).map((date, i) => {
      const rows = [
        { value: 70, comment: "Slow start to the quarter — pipeline still ramping.", createdBy: "Riya Nair" },
        { value: 78, comment: null, createdBy: "Riya Nair" },
        { value: 85, comment: "Outbound campaign starting to convert.", createdBy: "Karan Mehta" },
        { value: 95, comment: null, createdBy: "Riya Nair" },
        { value: 110, comment: "Crossed target — enterprise webinar drove a spike.", createdBy: "Riya Nair" },
        { value: 132, comment: "Best week this quarter.", createdBy: "Aarav Shah" },
      ];
      return { date, ...rows[i] };
    }),
  },
  {
    id: "cn-2",
    title: "Deals Closed",
    categoryName: "Sales",
    subCategoryName: null,
    frequency: "monthly",
    measurementUnit: "Number",
    unit: "deals",
    currency: null,
    targetScale: null,
    targetValue: 50,
    currentValue: 46,
    history: series(months(ANCHOR, 5), [39, 44, 41, 48, 46]),
  },
  {
    id: "cn-3",
    title: "Average Deal Size",
    categoryName: "Sales",
    subCategoryName: null,
    frequency: "monthly",
    measurementUnit: "Currency",
    unit: null,
    currency: "USD",
    targetScale: "Thousand",
    targetValue: 20000,
    currentValue: 12000,
    history: series(months(ANCHOR, 5), [17500, 15800, 14200, 13000, 12000]),
  },

  // ── Marketing ────────────────────────────────────────────────────────
  {
    id: "cn-4",
    title: "MQLs Generated",
    categoryName: "Marketing",
    subCategoryName: "Paid",
    frequency: "monthly",
    measurementUnit: "Number",
    unit: "MQLs",
    currency: null,
    targetScale: null,
    targetValue: 300,
    currentValue: 315,
    history: series(months(ANCHOR, 5), [260, 275, 290, 300, 315]),
  },
  {
    id: "cn-5",
    title: "Website Conversion Rate",
    categoryName: "Marketing",
    subCategoryName: null,
    frequency: "weekly",
    measurementUnit: "Percentage",
    unit: null,
    currency: null,
    targetScale: null,
    targetValue: 4,
    currentValue: 4.9,
    history: series(weeks(ANCHOR, 6), [2.8, 3.1, 3.6, 4.0, 4.4, 4.9]),
  },
  {
    id: "cn-6",
    title: "Content Downloads",
    categoryName: "Marketing",
    subCategoryName: null,
    frequency: "monthly",
    measurementUnit: "Number",
    unit: "downloads",
    currency: null,
    targetScale: null,
    targetValue: 500,
    currentValue: 340,
    history: series(months(ANCHOR, 5), [480, 430, 390, 360, 340]),
  },

  // ── Customer Success ─────────────────────────────────────────────────
  {
    id: "cn-7",
    title: "NPS Score",
    categoryName: "Customer Success",
    subCategoryName: null,
    frequency: "quarterly",
    measurementUnit: "Number",
    unit: "pts",
    currency: null,
    targetScale: null,
    targetValue: 60,
    currentValue: 63,
    history: series(months(ANCHOR, 4), [51, 55, 58, 63]),
  },
  {
    id: "cn-8",
    title: "Renewals Closed",
    categoryName: "Customer Success",
    subCategoryName: null,
    frequency: "monthly",
    measurementUnit: "Number",
    unit: "renewals",
    currency: null,
    targetScale: null,
    targetValue: 40,
    currentValue: 50,
    history: series(months(ANCHOR, 5), [30, 34, 38, 44, 50]),
  },
  {
    id: "cn-9",
    title: "Support CSAT",
    categoryName: "Customer Success",
    subCategoryName: "Tier 1",
    frequency: "weekly",
    measurementUnit: "Percentage",
    unit: null,
    currency: null,
    targetScale: null,
    targetValue: 90,
    currentValue: 74,
    history: series(weeks(ANCHOR, 6), [88, 85, 81, 79, 76, 74]),
  },

  // ── Operations ───────────────────────────────────────────────────────
  {
    id: "cn-10",
    title: "On-Time Delivery",
    categoryName: "Operations",
    subCategoryName: null,
    frequency: "weekly",
    measurementUnit: "Percentage",
    unit: null,
    currency: null,
    targetScale: null,
    targetValue: 95,
    currentValue: 96,
    history: series(weeks(ANCHOR, 6), [90, 91, 93, 94, 95, 96]),
  },
  {
    id: "cn-11",
    title: "Process Automation Coverage",
    categoryName: "Operations",
    subCategoryName: null,
    frequency: "monthly",
    measurementUnit: "Percentage",
    unit: null,
    currency: null,
    targetScale: null,
    targetValue: 50,
    currentValue: 61,
    history: series(months(ANCHOR, 5), [32, 40, 47, 54, 61]),
  },
  {
    id: "cn-12",
    title: "Inventory Accuracy",
    categoryName: "Operations",
    subCategoryName: null,
    frequency: "monthly",
    measurementUnit: "Percentage",
    unit: null,
    currency: null,
    targetScale: null,
    targetValue: 98,
    currentValue: 70,
    history: series(months(ANCHOR, 5), [89, 84, 79, 74, 70]),
  },
];

/**
 * Every row needs to open its own correctly-prefilled detail popup, not just
 * "cn-1" — fill in the FK fields the rest of the set never needed until now,
 * derived from the display-only names already on each record. `??` leaves
 * cn-1's explicit values untouched (they already agree with this mapping).
 */
const CATEGORY_NAME_TO_ID: Record<string, string> = {
  Sales: "c1",
  Marketing: "c2",
  "Customer Success": "c3",
  Operations: "c4",
};
const SUB_CATEGORY_NAME_TO_ID: Record<string, string> = {
  Enterprise: "sc1",
  Paid: "sc2",
  "Tier 1": "sc3",
};
let historyEntryIndex = 0;
MOCK_CRITICAL_NUMBERS.forEach((r, i) => {
  r.categoryId = r.categoryId ?? CATEGORY_NAME_TO_ID[r.categoryName];
  r.subCategoryId =
    r.subCategoryId ?? (r.subCategoryName ? SUB_CATEGORY_NAME_TO_ID[r.subCategoryName] : null);
  r.teamId = r.teamId ?? MOCK_TEAMS[i % MOCK_TEAMS.length].id;
  r.ownerId = r.ownerId ?? MOCK_USERS[i % MOCK_USERS.length].id;
  // Only cn-1's history was hand-written with real names — backfill the rest
  // (round-robin, deterministic) so the Recent Updates feed always has a name.
  r.history.forEach((h) => {
    if (!h.createdBy) {
      const u = MOCK_USERS[historyEntryIndex % MOCK_USERS.length];
      h.createdBy = `${u.firstName} ${u.lastName}`;
    }
    historyEntryIndex++;
  });
});

/** The record the combo chart focuses on — its history spans all 4 tiers. */
export const COMBO_CHART_RECORD_ID = "cn-1";
