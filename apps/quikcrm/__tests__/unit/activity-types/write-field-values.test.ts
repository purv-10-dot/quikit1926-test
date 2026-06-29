/**
 * T-P2.2 — RED-first unit test for the activity custom-field write-values
 * service. Written BEFORE lib/services/activity-types/write-field-values.ts
 * exists, so it is RED for one reason: the module doesn't resolve.
 *
 * Contract pinned here:
 *  1. Typed-column routing WITH coercion-type assertions — each fieldType lands
 *     in the right column with the right JS type (Number→number not string,
 *     Date→Date not ISO string [guards the re-hydration seam], Boolean→bool,
 *     Select→string, MultiSelect→array). Non-target columns stay null/undefined.
 *  2. Required-field validation rejects missing — no rows written.
 *  3. Org-scoping — every written row carries the arg orgId; defs loaded scoped
 *     to (orgId, activityTypeId).
 *  4. Per-field uniqueness intent — one row per (activityId, fieldDefinitionId).
 *  5. Unknown key is DROPPED silently (matches lib/services/fields/validate.ts).
 *  6. Phone is UNSUPPORTED in v1 — the service throws (no half-support).
 *
 * Reuse: the service is expected to call validateDynamicFields (lead path's
 * proven validator) for coercion + unknown-key-drop + required-field errors,
 * then route the coerced values into typed columns. We mock the repo's
 * getActivityTypeWithFields (so this tests the service, not the repo query)
 * and assert on what gets written via the tx mock.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@quikit/database";

// Mock the repo so the service's def-loading is controllable + observable.
vi.mock("@/lib/services/activity-types/repo", () => ({
  getActivityTypeWithFields: vi.fn(),
}));

import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";
import { writeActivityFieldValues } from "@/lib/services/activity-types/write-field-values";

// A transaction-client stand-in: the service runs inside the activity-create tx.
const tx = mockDeep<PrismaClient>();

function def(partial: Record<string, unknown>) {
  return {
    id: `fd_${partial.key}`,
    activityTypeId: "at1",
    key: partial.key,
    label: partial.label ?? String(partial.key),
    fieldType: partial.fieldType,
    requirement: partial.requirement ?? "Optional",
    options: partial.options ?? null,
    visible: true,
    sortOrder: 0,
  };
}

function mockType(fieldDefs: Array<ReturnType<typeof def>>) {
  vi.mocked(getActivityTypeWithFields).mockResolvedValue({
    id: "at1",
    code: "upwork_connect",
    label: "Upwork Connect",
    category: null,
    config: null,
    sortOrder: 0,
    isActive: true,
    fieldDefinitions: fieldDefs,
  } as never);
}

// Pull the `data` object out of each tx.crmActivityFieldValue.create call.
function createdRows() {
  return tx.crmActivityFieldValue.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
}
function rowFor(key: string) {
  return createdRows().find((d) => d.fieldKey === key);
}

beforeEach(() => {
  vi.mocked(getActivityTypeWithFields).mockReset();
  tx.crmActivityFieldValue.create.mockReset();
  tx.crmActivityFieldValue.create.mockResolvedValue({} as never);
});

describe("writeActivityFieldValues — typed-column routing (coercion-type asserted)", () => {
  it("routes each fieldType to its typed column with the correct JS type", async () => {
    mockType([
      def({ key: "notes", fieldType: "Text" }),
      def({ key: "bid", fieldType: "Number" }),
      def({ key: "follow_up", fieldType: "Date" }),
      def({ key: "replied", fieldType: "Boolean" }),
      def({ key: "channel", fieldType: "Select", options: ["Upwork", "LinkedIn"] }),
      def({ key: "tags", fieldType: "MultiSelect", options: ["a", "b", "c"] }),
    ]);

    await writeActivityFieldValues(tx, {
      orgId: "org-A",
      activityId: "act1",
      activityTypeId: "at1",
      values: {
        notes: "  hello  ",
        bid: "250",
        follow_up: "2026-07-01T00:00:00.000Z",
        replied: "true",
        channel: "Upwork",
        tags: ["a", "c"],
      },
    });

    const text = rowFor("notes");
    expect(typeof text?.valueText).toBe("string");
    expect(text?.valueText).toBe("hello"); // trimmed
    expect(text?.valueNumber ?? null).toBeNull();

    const num = rowFor("bid");
    expect(typeof num?.valueNumber).toBe("number"); // NOT a string
    expect(num?.valueNumber).toBe(250);
    expect(num?.valueText ?? null).toBeNull();

    const date = rowFor("follow_up");
    expect(date?.valueDate).toBeInstanceOf(Date); // re-hydrated, NOT an ISO string
    expect(date?.valueText ?? null).toBeNull();

    const bool = rowFor("replied");
    expect(typeof bool?.valueBoolean).toBe("boolean"); // NOT "true" string
    expect(bool?.valueBoolean).toBe(true);

    const sel = rowFor("channel");
    expect(sel?.valueText).toBe("Upwork");

    const multi = rowFor("tags");
    expect(Array.isArray(multi?.valueJson)).toBe(true);
    expect(multi?.valueJson).toEqual(["a", "c"]);
  });
});

describe("writeActivityFieldValues — validation + scoping", () => {
  it("rejects a missing Required field and writes NO rows", async () => {
    mockType([
      def({ key: "bid", fieldType: "Number", requirement: "Required" }),
      def({ key: "notes", fieldType: "Text" }),
    ]);

    // validateDynamicFields returns an { errors } record (it does NOT throw);
    // the service must convert that into a rejection whose message reflects the
    // required-field failure. Assert the SHAPE of the failure, not just "threw".
    await expect(
      writeActivityFieldValues(tx, {
        orgId: "org-A",
        activityId: "act1",
        activityTypeId: "at1",
        values: { notes: "no bid provided" }, // bid (Required) missing
      }),
    ).rejects.toThrow(/required/i);

    expect(tx.crmActivityFieldValue.create).not.toHaveBeenCalled();
  });

  it("stamps every written row with the arg orgId and loads defs scoped to (orgId, activityTypeId)", async () => {
    mockType([def({ key: "notes", fieldType: "Text" })]);

    await writeActivityFieldValues(tx, {
      orgId: "org-A",
      activityId: "act1",
      activityTypeId: "at1",
      values: { notes: "x" },
    });

    expect(getActivityTypeWithFields).toHaveBeenCalledWith("org-A", "at1");
    for (const row of createdRows()) {
      expect(row.orgId).toBe("org-A");
      expect(row.activityId).toBe("act1");
    }
  });

  it("writes exactly one row per field (per-field uniqueness intent)", async () => {
    mockType([
      def({ key: "notes", fieldType: "Text" }),
      def({ key: "bid", fieldType: "Number" }),
    ]);

    await writeActivityFieldValues(tx, {
      orgId: "org-A",
      activityId: "act1",
      activityTypeId: "at1",
      values: { notes: "x", bid: 5 },
    });

    expect(createdRows()).toHaveLength(2);
    expect(new Set(createdRows().map((r) => r.fieldDefinitionId)).size).toBe(2);
  });

  it("drops an unknown key silently — no row, no throw (matches validate.ts)", async () => {
    mockType([def({ key: "notes", fieldType: "Text" })]);

    await writeActivityFieldValues(tx, {
      orgId: "org-A",
      activityId: "act1",
      activityTypeId: "at1",
      values: { notes: "x", bogus_key: "should be ignored" },
    });

    expect(rowFor("bogus_key")).toBeUndefined();
    expect(rowFor("notes")).toBeTruthy();
  });
});

describe("writeActivityFieldValues — Phone unsupported in v1", () => {
  it("throws when a field definition has fieldType Phone", async () => {
    mockType([def({ key: "contact_phone", fieldType: "Phone" })]);

    // Must reject SPECIFICALLY because Phone is unsupported — not because of
    // some unrelated throw (a loose toBeTruthy would mask the wrong error).
    await expect(
      writeActivityFieldValues(tx, {
        orgId: "org-A",
        activityId: "act1",
        activityTypeId: "at1",
        values: { contact_phone: "9876543210" },
      }),
    ).rejects.toThrow(/phone|unsupported/i);
    expect(tx.crmActivityFieldValue.create).not.toHaveBeenCalled();
  });
});
