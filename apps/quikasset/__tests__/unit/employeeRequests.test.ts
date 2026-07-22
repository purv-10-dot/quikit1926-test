import { describe, it, expect } from "vitest";
import {
  normalizeRows, statusRank, matchesType, matchesSearch, rowActions,
  detailTitle, detailSubtitle, severity, requesterName, apiBase,
  type EmployeeRequestRow,
} from "@/lib/employeeRequests";
import type { AssetRequest } from "@/types/assetRequest";
import type { RepairRequest } from "@/types/repairRequest";

const asset = (o: Partial<AssetRequest>): AssetRequest =>
  ({
    id: "a1", requesterUserId: "u1", requesterName: "Alice", requesterEmployeeId: "EMP-1",
    itemType: "Laptop", baseCategoryName: "IT Equipment", priority: "High", status: "Submitted",
    createdAt: "2026-07-10T00:00:00.000Z", ...o,
  } as unknown as AssetRequest);

const repair = (o: Partial<RepairRequest>): RepairRequest =>
  ({
    id: "r1", requesterUserId: "u2", requesterName: "Bob", requesterEmployeeId: "EMP-2",
    assetName: "MacBook", assetCode: "AST-9", issueTitle: "Screen flickers", urgency: "Urgent",
    status: "Submitted", createdAt: "2026-07-11T00:00:00.000Z", ...o,
  } as unknown as RepairRequest);

describe("statusRank", () => {
  const A = (status: string): EmployeeRequestRow => ({ kind: "asset", id: "a", createdAt: "x", raw: asset({ status: status as AssetRequest["status"] }) });
  const R = (status: string): EmployeeRequestRow => ({ kind: "repair", id: "r", createdAt: "x", raw: repair({ status: status as RepairRequest["status"] }) });

  it("0 = needs a decision", () => {
    expect(statusRank(A("Submitted"))).toBe(0);
    expect(statusRank(A("PendingApproval"))).toBe(0);
    expect(statusRank(R("Submitted"))).toBe(0);
  });
  it("1 = needs fulfilment (Assign / Send to Repair)", () => {
    expect(statusRank(A("Approved"))).toBe(1);
    expect(statusRank(A("PartiallyFulfilled"))).toBe(1);
    expect(statusRank(R("Approved"))).toBe(1);
  });
  it("2 = done / no action", () => {
    for (const s of ["Fulfilled", "Rejected", "Cancelled", "Draft"]) expect(statusRank(A(s))).toBe(2);
    for (const s of ["Fulfilled", "Rejected", "Cancelled"]) expect(statusRank(R(s))).toBe(2);
  });
});

describe("normalizeRows", () => {
  it("orders by attention bucket first (decision → fulfilment → done), regardless of date", () => {
    const rows = normalizeRows(
      [
        asset({ id: "done", status: "Fulfilled", createdAt: "2026-07-31T00:00:00Z" }),   // newest, but done
        asset({ id: "approved", status: "Approved", createdAt: "2026-07-01T00:00:00Z" }), // oldest, needs fulfilment
      ],
      [
        repair({ id: "submitted", status: "Submitted", createdAt: "2026-07-15T00:00:00Z" }), // needs decision
      ],
    );
    expect(rows.map((r) => r.id)).toEqual(["submitted", "approved", "done"]);
  });

  it("within a bucket, sorts newest-first (and tags kind)", () => {
    const rows = normalizeRows(
      [asset({ id: "a1", status: "Submitted", createdAt: "2026-07-01T00:00:00Z" }), asset({ id: "a2", status: "Submitted", createdAt: "2026-07-20T00:00:00Z" })],
      [repair({ id: "r1", status: "Submitted", createdAt: "2026-07-10T00:00:00Z" })],
    );
    expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual(["asset:a2", "repair:r1", "asset:a1"]);
  });

  it("handles either list being empty", () => {
    expect(normalizeRows([], [repair({})])).toHaveLength(1);
    expect(normalizeRows([asset({})], [])).toHaveLength(1);
    expect(normalizeRows([], [])).toHaveLength(0);
  });
});

describe("matchesType", () => {
  const a: EmployeeRequestRow = { kind: "asset", id: "a1", createdAt: "x", raw: asset({}) };
  const r: EmployeeRequestRow = { kind: "repair", id: "r1", createdAt: "x", raw: repair({}) };
  it("all shows both; asset/repair filter to their kind", () => {
    expect(matchesType(a, "all")).toBe(true);
    expect(matchesType(r, "all")).toBe(true);
    expect(matchesType(a, "asset")).toBe(true);
    expect(matchesType(a, "repair")).toBe(false);
    expect(matchesType(r, "repair")).toBe(true);
    expect(matchesType(r, "asset")).toBe(false);
  });
});

describe("matchesSearch", () => {
  const a: EmployeeRequestRow = { kind: "asset", id: "a1", createdAt: "x", raw: asset({ requesterName: "Alice", itemType: "Laptop", baseCategoryName: "IT" }) };
  const r: EmployeeRequestRow = { kind: "repair", id: "r1", createdAt: "x", raw: repair({ requesterName: "Bob", assetName: "MacBook", assetCode: "AST-9", issueTitle: "Screen" }) };

  it("empty query matches everything", () => {
    expect(matchesSearch(a, "")).toBe(true);
    expect(matchesSearch(a, "   ")).toBe(true);
  });
  it("matches requester name (case-insensitive)", () => {
    expect(matchesSearch(a, "alice")).toBe(true);
    expect(matchesSearch(r, "BOB")).toBe(true);
  });
  it("matches asset item text and repair asset/issue text", () => {
    expect(matchesSearch(a, "lapt")).toBe(true);
    expect(matchesSearch(r, "macbook")).toBe(true);
    expect(matchesSearch(r, "screen")).toBe(true);
    expect(matchesSearch(r, "ast-9")).toBe(true);
  });
  it("returns false when nothing matches", () => {
    expect(matchesSearch(a, "zzz")).toBe(false);
  });
});

describe("rowActions", () => {
  const A = (status: string): EmployeeRequestRow => ({ kind: "asset", id: "a", createdAt: "x", raw: asset({ status: status as AssetRequest["status"] }) });
  const R = (status: string): EmployeeRequestRow => ({ kind: "repair", id: "r", createdAt: "x", raw: repair({ status: status as RepairRequest["status"] }) });

  it("asset: pending → decide", () => {
    expect(rowActions(A("Submitted"))).toEqual(["decide"]);
    expect(rowActions(A("PendingApproval"))).toEqual(["decide"]);
  });
  it("asset: approved → assign + reject back-out; partial → assign only", () => {
    expect(rowActions(A("Approved"))).toEqual(["asset-assign", "reject-backout"]);
    expect(rowActions(A("PartiallyFulfilled"))).toEqual(["asset-assign"]);
  });
  it("asset: terminal/draft → no actions", () => {
    for (const s of ["Draft", "Fulfilled", "Rejected", "Cancelled"]) expect(rowActions(A(s))).toEqual([]);
  });
  it("repair: submitted → decide; approved → send + reject back-out", () => {
    expect(rowActions(R("Submitted"))).toEqual(["decide"]);
    expect(rowActions(R("Approved"))).toEqual(["repair-send", "reject-backout"]);
  });
  it("repair: terminal → no actions", () => {
    for (const s of ["Fulfilled", "Rejected", "Cancelled"]) expect(rowActions(R(s))).toEqual([]);
  });
});

describe("display accessors + apiBase", () => {
  const a: EmployeeRequestRow = { kind: "asset", id: "a1", createdAt: "x", raw: asset({}) };
  const r: EmployeeRequestRow = { kind: "repair", id: "r1", createdAt: "x", raw: repair({}) };
  it("title/subtitle are type-appropriate", () => {
    expect(detailTitle(a)).toBe("Laptop");
    expect(detailSubtitle(a)).toBe("IT Equipment");
    expect(detailTitle(r)).toBe("MacBook");
    expect(detailSubtitle(r)).toBe("Screen flickers");
  });
  it("severity reads priority for asset, urgency for repair", () => {
    expect(severity(a)).toBe("High");
    expect(severity(r)).toBe("Urgent");
  });
  it("requesterName falls back to userId when name missing", () => {
    expect(requesterName({ kind: "asset", id: "a", createdAt: "x", raw: asset({ requesterName: null, requesterUserId: "u9" }) })).toBe("u9");
  });
  it("apiBase routes by type", () => {
    expect(apiBase(a)).toBe("/api/asset-requests");
    expect(apiBase(r)).toBe("/api/repair-requests");
  });
});
