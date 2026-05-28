/**
 * Deterministic test data factories.
 *
 * Every factory returns a fresh object seeded with a unique suffix so runs
 * don't collide with each other. Keep these pure — no network, no state.
 */

let counter = 0;
// Short, unique, alphanumeric. Max 6 chars — leaves headroom for prefixes
// and respects typical `code` column length limits (2-10 chars).
const shortId = () => {
  const t = Date.now().toString(36).slice(-4);
  const n = (++counter).toString(36).padStart(2, "0");
  return (t + n).toUpperCase();
};
// Full suffix for longer fields (names, emails, descriptions).
const longSuffix = () => `${Date.now().toString(36)}-${(++counter).toString(36)}`;

export function makeProject(overrides: Partial<any> = {}) {
  const id = shortId();
  return {
    // `T` + 6 chars = 7 total, well within the 2-10 validator range
    code: `T${id}`,
    name: `E2E Test Project ${longSuffix()}`,
    city: "Pune",
    state: "Maharashtra",
    startDate: "2026-01-01",
    expectedEndDate: "2027-12-31",
    projectValue: "10000000",
    ...overrides,
  };
}

export function makeVendor(overrides: Partial<any> = {}) {
  const id = shortId();
  return {
    code: `V${id}`,
    name: `Test Vendor ${longSuffix()}`,
    gstin: "27AABCV1234M1Z5",
    pan: "AABCV1234M",
    address: "Industrial Area, Pune",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    phone: "9000000000",
    email: `vendor-${id}@test.local`,
    ...overrides,
  };
}

export function makeItem(overrides: Partial<any> = {}) {
  const id = shortId();
  return {
    code: `I${id}`,
    name: `Test Cement ${longSuffix()}`,
    groupName: "Cement",
    uomCode: "BAG",
    hsnCode: "25232930",
    gstRate: "28",
    standardRate: "400",
    ...overrides,
  };
}

/**
 * Minimal BOQ workbook — one category (Civil Building), one group with two
 * leaves. Shape matches `MultiSheetInput` from `src/lib/boq/parser.ts`.
 */
export function makeBOQWorkbook() {
  // ExcelRow tuple: [S.No, SOR, SubSOR, Name, Description, Unit, Qty, Rate, Amount]
  const rows = [
    // Header row (ignored by parser)
    [null, null, null, null, null, null, null, null, null],
    // Top-level group — 1
    [1, "1", null, "Site Work", "Site preparation and earthwork", null, null, null, null],
    // Leaf — 1.1
    [2, "1.1", null, "Excavation", "Excavation in all types of soil", "CUM", "1000", "150", "150000"],
    // Leaf — 1.2
    [3, "1.2", null, "Filling", "Backfilling with earth", "CUM", "500", "80", "40000"],
    // Top-level group — 2
    [4, "2", null, "Concrete", "RCC works", null, null, null, null],
    // Leaf — 2.1
    [5, "2.1", null, "M25 Concrete", "RCC M25 for foundation", "CUM", "200", "6500", "1300000"],
  ];

  return {
    sheets: [
      {
        sheetName: "Civil_Building",
        rows,
      },
    ],
  };
}

/**
 * DPR line that references a BOQ leaf by its canonical ref number.
 */
export function makeDPRLine(boqNo: string, qty: number | string, workType: "self" | "subcontractor" = "self") {
  return {
    boqNo,
    todayQty: String(qty),
    workType,
    remarks: `E2E test posting for ${boqNo}`,
  };
}

/**
 * RAB line billing a BOQ leaf.
 */
export function makeRABLine(boqNo: string, qty: number | string) {
  return {
    boqNo,
    qty: String(qty),
    remarks: `E2E test billing for ${boqNo}`,
  };
}
