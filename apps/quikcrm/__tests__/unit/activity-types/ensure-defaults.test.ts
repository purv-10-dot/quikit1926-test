/**
 * Tests for the default activity-type seed.
 *
 * Two halves:
 *  1. Pure-data validation of DEFAULT_ACTIVITY_TYPES against the supported
 *     field-definition contract (no Prisma) — guards the seed can always be
 *     created via the same rules the admin field-editor enforces.
 *  2. ensureDefaultActivityTypes behavior with a mocked db — seeds on an empty
 *     org, no-ops when types already exist (count guard), and writes fields
 *     with skipDuplicates.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { DEFAULT_ACTIVITY_TYPES } from "@/lib/activities/activity-types-defaults";

const db = mockDb();

// The field types the platform supports for activity fields (Phone excluded).
const SUPPORTED_FIELD_TYPES = new Set([
  "Text",
  "TextArea",
  "Number",
  "Email",
  "Date",
  "Boolean",
  "Select",
  "MultiSelect",
]);
const KEY_RE = /^[a-z0-9_]+$/;
const CODE_RE = /^[a-z0-9_]+$/;

describe("DEFAULT_ACTIVITY_TYPES — data contract", () => {
  it("defines exactly the 12 requested default types", () => {
    expect(DEFAULT_ACTIVITY_TYPES).toHaveLength(12);
    expect(DEFAULT_ACTIVITY_TYPES.map((t) => t.label)).toEqual([
      "Call",
      "Meeting",
      "Email",
      "Task",
      "Note",
      "WhatsApp",
      "Demo",
      "Site Visit",
      "Proposal Sent",
      "Quote Sent",
      "Document Shared",
      "Follow-up",
    ]);
  });

  it("uses unique, regex-valid type codes", () => {
    const codes = DEFAULT_ACTIVITY_TYPES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(CODE_RE);
  });

  it("every field uses a supported type, valid key, and Select/MultiSelect have options", () => {
    for (const type of DEFAULT_ACTIVITY_TYPES) {
      const keys = type.fields.map((f) => f.key);
      // keys unique within the type
      expect(new Set(keys).size).toBe(keys.length);
      for (const f of type.fields) {
        expect(SUPPORTED_FIELD_TYPES.has(f.fieldType), `${type.code}.${f.key} → ${f.fieldType}`).toBe(true);
        expect(f.fieldType).not.toBe("Phone");
        expect(f.key).toMatch(KEY_RE);
        expect(["Required", "Optional"]).toContain(f.requirement);
        if (f.fieldType === "Select" || f.fieldType === "MultiSelect") {
          expect((f.options?.length ?? 0)).toBeGreaterThan(0);
        }
      }
    }
  });

  it("Note has no custom fields (the generic Notes box covers it)", () => {
    const note = DEFAULT_ACTIVITY_TYPES.find((t) => t.code === "note");
    expect(note?.fields).toEqual([]);
  });

  it("Call exposes Direction with Incoming/Outgoing options", () => {
    const call = DEFAULT_ACTIVITY_TYPES.find((t) => t.code === "call");
    const direction = call?.fields.find((f) => f.key === "direction");
    expect(direction?.fieldType).toBe("Select");
    expect(direction?.options).toEqual(["Incoming", "Outgoing"]);
  });

  it("Call includes Contact Name + Phone Number as Text (Phone type is unsupported for activities)", () => {
    const call = DEFAULT_ACTIVITY_TYPES.find((t) => t.code === "call");
    const contact = call?.fields.find((f) => f.key === "contact_name");
    const phone = call?.fields.find((f) => f.key === "phone_number");
    expect(contact?.fieldType).toBe("Text");
    // Phone Number MUST be Text — the Phone field type is rejected by
    // writeActivityFieldValues, so seeding it as Phone would break Call logging.
    expect(phone?.fieldType).toBe("Text");
  });

  it("Call includes the optional telephony metadata fields", () => {
    const call = DEFAULT_ACTIVITY_TYPES.find((t) => t.code === "call");
    const keys = new Set(call?.fields.map((f) => f.key));
    for (const k of ["call_status", "dialed_number", "recording_url", "telephony_provider", "call_id"]) {
      expect(keys.has(k), `call is missing field "${k}"`).toBe(true);
    }
    const status = call?.fields.find((f) => f.key === "call_status");
    expect(status?.fieldType).toBe("Select");
    expect(status?.options).toEqual(["Completed", "Missed", "Busy", "No Answer"]);
  });

  it("existing Call fields keep their original leading positions (no sortOrder shift on re-seed)", () => {
    // ensure-defaults derives sortOrder from array index; the original four
    // fields must stay at indexes 0-3 so already-seeded orgs don't collide.
    const call = DEFAULT_ACTIVITY_TYPES.find((t) => t.code === "call");
    expect(call?.fields.slice(0, 4).map((f) => f.key)).toEqual([
      "direction",
      "duration_minutes",
      "outcome",
      "call_date_time",
    ]);
  });
});

describe("ensureDefaultActivityTypes", () => {
  const ALL_FIELDS = DEFAULT_ACTIVITY_TYPES.reduce((n, t) => n + t.fields.length, 0);

  beforeEach(() => {
    db.crmActivityType.createMany.mockReset();
    db.crmActivityType.findMany.mockReset();
    db.crmActivityFieldDefinition.findMany.mockReset();
    db.crmActivityFieldDefinition.createMany.mockReset();
    db.crmActivityType.createMany.mockResolvedValue({ count: 0 });
    db.crmActivityFieldDefinition.createMany.mockResolvedValue({ count: 0 });
  });

  /** Helper: read the `data` array passed to a createMany mock call. */
  function createdData(mock: { mock: { calls: unknown[][] } }): { code?: string; key?: string; activityTypeId?: string }[] {
    const call = mock.mock.calls[0]?.[0] as { data?: { code?: string; key?: string; activityTypeId?: string }[] } | undefined;
    return call?.data ?? [];
  }

  it("seeds all 12 types and their fields on an empty org", async () => {
    // No existing types; the re-fetch after create returns the 12 new ones.
    db.crmActivityType.findMany
      .mockResolvedValueOnce([] as never) // load existing → none
      .mockResolvedValueOnce(
        DEFAULT_ACTIVITY_TYPES.map((t, i) => ({ id: `type-${i}`, code: t.code })) as never,
      ); // re-resolve created ids
    db.crmActivityFieldDefinition.findMany.mockResolvedValue([] as never);

    const { ensureDefaultActivityTypes } = await import(
      "@/lib/services/activity-types/ensure-defaults"
    );
    await ensureDefaultActivityTypes("t1");

    const typeData = createdData(db.crmActivityType.createMany);
    expect(typeData).toHaveLength(12);
    expect(new Set(typeData.map((d) => d.code))).toEqual(
      new Set(DEFAULT_ACTIVITY_TYPES.map((t) => t.code)),
    );
    expect(createdData(db.crmActivityFieldDefinition.createMany)).toHaveLength(ALL_FIELDS);
  });

  it("BUG REPRO: org with only custom types (Linkedin/Upwork) backfills the 12 defaults and leaves customs untouched", async () => {
    // Existing org state: two admin-created custom types, none of the defaults.
    db.crmActivityType.findMany
      .mockResolvedValueOnce([
        { id: "li", code: "linkedin" },
        { id: "uw", code: "upwork" },
      ] as never) // load existing
      .mockResolvedValueOnce(
        DEFAULT_ACTIVITY_TYPES.map((t, i) => ({ id: `type-${i}`, code: t.code })) as never,
      ); // re-resolve the just-created defaults
    db.crmActivityFieldDefinition.findMany.mockResolvedValue([] as never);

    const { ensureDefaultActivityTypes } = await import(
      "@/lib/services/activity-types/ensure-defaults"
    );
    await ensureDefaultActivityTypes("t1");

    const typeData = createdData(db.crmActivityType.createMany);
    // Exactly the 12 defaults are created — NOT the existing customs.
    expect(typeData).toHaveLength(12);
    const createdCodes = new Set(typeData.map((d) => d.code));
    expect(createdCodes).toEqual(new Set(DEFAULT_ACTIVITY_TYPES.map((t) => t.code)));
    expect(createdCodes.has("linkedin")).toBe(false);
    expect(createdCodes.has("upwork")).toBe(false);
  });

  it("no-ops writes when every default type and field already exists", async () => {
    // All 12 defaults present, each with all its default field keys.
    const existing = DEFAULT_ACTIVITY_TYPES.map((t, i) => ({ id: `type-${i}`, code: t.code }));
    db.crmActivityType.findMany.mockResolvedValueOnce(existing as never);
    db.crmActivityFieldDefinition.findMany.mockResolvedValue(
      DEFAULT_ACTIVITY_TYPES.flatMap((t, i) =>
        t.fields.map((f) => ({ activityTypeId: `type-${i}`, key: f.key })),
      ) as never,
    );

    const { ensureDefaultActivityTypes } = await import(
      "@/lib/services/activity-types/ensure-defaults"
    );
    await ensureDefaultActivityTypes("t1");

    // Nothing missing → no type creates and no field creates.
    expect(db.crmActivityType.createMany).not.toHaveBeenCalled();
    expect(db.crmActivityFieldDefinition.createMany).not.toHaveBeenCalled();
  });

  it("backfills only the MISSING field definitions on an existing default type", async () => {
    // "call" already exists but is missing its fields; everything else is fully present.
    const existing = DEFAULT_ACTIVITY_TYPES.map((t, i) => ({ id: `type-${i}`, code: t.code }));
    const callIndex = DEFAULT_ACTIVITY_TYPES.findIndex((t) => t.code === "call");
    const callType = DEFAULT_ACTIVITY_TYPES[callIndex]!;
    db.crmActivityType.findMany.mockResolvedValueOnce(existing as never);
    // Every type has all its fields EXCEPT "call" (id type-<callIndex>), which has none.
    db.crmActivityFieldDefinition.findMany.mockResolvedValue(
      DEFAULT_ACTIVITY_TYPES.flatMap((t, i) =>
        i === callIndex ? [] : t.fields.map((f) => ({ activityTypeId: `type-${i}`, key: f.key })),
      ) as never,
    );

    const { ensureDefaultActivityTypes } = await import(
      "@/lib/services/activity-types/ensure-defaults"
    );
    await ensureDefaultActivityTypes("t1");

    // No new types (all 12 codes present).
    expect(db.crmActivityType.createMany).not.toHaveBeenCalled();
    // Only call's missing fields are created — keyed to its id, matching its field keys.
    const fieldData = createdData(db.crmActivityFieldDefinition.createMany);
    expect(fieldData).toHaveLength(callType.fields.length);
    expect(fieldData.every((d) => d.activityTypeId === `type-${callIndex}`)).toBe(true);
    expect(new Set(fieldData.map((d) => d.key))).toEqual(
      new Set(callType.fields.map((f) => f.key)),
    );
  });
});
