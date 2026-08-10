import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFieldMapFromEnv,
  getResolvedFieldMap,
  resetFieldMapCache,
  resolveSchemaNamesFromMetadata,
  validateFieldMap,
} from "@/lib/services/leadsquared/field-map-resolver";
import { DEFAULT_FIELD_MAP_CONFIG } from "@/lib/services/leadsquared/field-map";
import { LeadSquaredClient } from "@/lib/services/leadsquared/client";

const ENV_KEYS = [
  "LEADSQUARED_SCHEMA_STAGE",
  "LEADSQUARED_SCHEMA_SUBSTAGE",
  "LEADSQUARED_SCHEMA_STATUS",
  "LEADSQUARED_SCHEMA_REMARKS",
  "LEADSQUARED_SCHEMA_COUNTRY",
  "LEADSQUARED_SCHEMA_JOBTITLE",
  "LEADSQUARED_STAGE_VALUE_MAP",
  "LEADSQUARED_METADATA_AUTORESOLVE",
  "LEADSQUARED_VALIDATE_SCHEMA",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  resetFieldMapCache();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetFieldMapCache();
});

describe("buildFieldMapFromEnv", () => {
  it("keeps standard defaults and null custom SchemaNames when nothing is configured", () => {
    const c = buildFieldMapFromEnv();
    // Standard field defaults preserved (map by default).
    expect(c.stage).toBe("ProspectStage");
    expect(c.source).toBe("Source");
    expect(c.ownerId).toBeNull(); // owner sync disabled (cross-system ids)
    // Custom (mx_) fields stay null -> skipped until configured (today's behavior).
    expect(c.status).toBeNull();
    expect(c.subStage).toBeNull();
    expect(c.statusRemarks).toBeNull();
    expect(c.country).toBeNull();
    expect(c.website).toBeNull();
    // Ambiguous fields stay null.
    expect(c.jobTitle).toBeNull();
    expect(c.area).toBeNull();
  });

  it("reads SchemaNames and a JSON value map from env", () => {
    process.env.LEADSQUARED_SCHEMA_STAGE = "mx_Stage";
    process.env.LEADSQUARED_STAGE_VALUE_MAP = '{"Won":"ClosedWon"}';
    const c = buildFieldMapFromEnv();
    expect(c.stage).toBe("mx_Stage");
    expect(c.stageValueMap).toEqual({ Won: "ClosedWon" });
  });

  it("ignores a malformed value-map JSON (no throw)", () => {
    process.env.LEADSQUARED_STAGE_VALUE_MAP = "{not json";
    expect(buildFieldMapFromEnv().stageValueMap).toBeUndefined();
  });

  it("reads the new custom + ambiguous SchemaNames from env", () => {
    process.env.LEADSQUARED_SCHEMA_COUNTRY = "mx_Country";
    process.env.LEADSQUARED_SCHEMA_JOBTITLE = "mx_JobTitle";
    const c = buildFieldMapFromEnv();
    expect(c.country).toBe("mx_Country"); // confirmed custom, enabled via env
    expect(c.jobTitle).toBe("mx_JobTitle"); // ambiguous, enabled only via env
  });
});

describe("resolveSchemaNamesFromMetadata", () => {
  it("matches SchemaName by DisplayName (case-insensitive)", () => {
    const meta = [
      { SchemaName: "mx_Custom_1", DisplayName: "Stage" },
      { SchemaName: "mx_Custom_2", DisplayName: "status" },
      { SchemaName: "EmailAddress", DisplayName: "Email" },
    ];
    const r = resolveSchemaNamesFromMetadata(meta);
    expect(r.stage).toBe("mx_Custom_1");
    expect(r.status).toBe("mx_Custom_2");
    expect(r.subStage).toBeNull();
  });
});

describe("getResolvedFieldMap", () => {
  it("is env-only (no network) when auto-resolve AND validation are both off", async () => {
    process.env.LEADSQUARED_SCHEMA_STAGE = "mx_Stage";
    process.env.LEADSQUARED_VALIDATE_SCHEMA = "false"; // disable the validation fetch too
    const client = { getLeadMetaData: vi.fn() };
    const c = await getResolvedFieldMap({ client });
    expect(c.stage).toBe("mx_Stage");
    expect(client.getLeadMetaData).not.toHaveBeenCalled();
  });

  it("fetches metadata to VALIDATE configured SchemaNames (default on) and warns on mismatch", async () => {
    process.env.LEADSQUARED_METADATA_AUTORESOLVE = "false";
    process.env.LEADSQUARED_SCHEMA_COUNTRY = "mx_Country"; // the wrong guess
    const client = {
      getLeadMetaData: vi
        .fn()
        .mockResolvedValue([{ SchemaName: "mx_Country", DisplayName: "Demo Taken By" }]),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await getResolvedFieldMap({ client });
    expect(client.getLeadMetaData).toHaveBeenCalled();
    // A structured warning naming the mismatched field is emitted.
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("fieldmap.schema.mismatch");
    expect(logged).toContain("mx_Country");
    warn.mockRestore();
  });

  it("auto-resolves missing custom SchemaNames from metadata when enabled", async () => {
    process.env.LEADSQUARED_METADATA_AUTORESOLVE = "true";
    const client = {
      getLeadMetaData: vi
        .fn()
        .mockResolvedValue([{ SchemaName: "mx_Status_X", DisplayName: "Status" }]),
    };
    const c = await getResolvedFieldMap({ client });
    expect(client.getLeadMetaData).toHaveBeenCalled();
    expect(c.status).toBe("mx_Status_X");
  });

  it("lets env SchemaNames win over metadata", async () => {
    process.env.LEADSQUARED_METADATA_AUTORESOLVE = "true";
    process.env.LEADSQUARED_SCHEMA_STAGE = "mx_env_wins";
    const client = {
      getLeadMetaData: vi
        .fn()
        .mockResolvedValue([{ SchemaName: "mx_meta", DisplayName: "Stage" }]),
    };
    const c = await getResolvedFieldMap({ client });
    expect(c.stage).toBe("mx_env_wins");
  });

  it("never throws when metadata resolution fails — falls back to env", async () => {
    process.env.LEADSQUARED_METADATA_AUTORESOLVE = "true";
    const client = { getLeadMetaData: vi.fn().mockRejectedValue(new Error("boom")) };
    const c = await getResolvedFieldMap({ client });
    expect(c.status).toBeNull(); // custom field unresolved, but no throw
  });
});

describe("LeadSquaredClient.getLeadMetaData", () => {
  function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
  }

  it("parses a bare array response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ SchemaName: "mx_A", DisplayName: "A" }]));
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });
    const meta = await client.getLeadMetaData();
    expect(meta).toEqual([{ SchemaName: "mx_A", DisplayName: "A" }]);
    // GET, keys in headers, correct path
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toContain("/v2/LeadManagement.svc/LeadsMetaData.Get");
    expect(opts.method).toBe("GET");
    expect(opts.headers["x-LSQ-AccessKey"]).toBe("AK");
  });

  it("parses a { List: [...] } envelope and drops entries without a SchemaName", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ List: [{ SchemaName: "mx_A", DisplayName: "A" }, { DisplayName: "no schema" }] }),
    );
    const client = new LeadSquaredClient({ host: "https://h", accessKey: "AK", secretKey: "SK", fetchImpl });
    expect(await client.getLeadMetaData()).toEqual([{ SchemaName: "mx_A", DisplayName: "A" }]);
  });
});

describe("validateFieldMap (safety check)", () => {
  const meta = [
    { SchemaName: "mx_Status", DisplayName: "Status" },
    { SchemaName: "mx_City", DisplayName: "City" },
    { SchemaName: "mx_Country", DisplayName: "Demo Taken By" },
    { SchemaName: "ProspectStage", DisplayName: "Contact Stage" },
  ];

  it("returns no warnings for correct mappings", () => {
    const config = { ...DEFAULT_FIELD_MAP_CONFIG, status: "mx_Status", cityName: "mx_City" };
    expect(validateFieldMap(config, meta)).toEqual([]);
  });

  it("warns when a SchemaName's DisplayName does not match the logical field", () => {
    // The exact bug: mx_Country is really "Demo Taken By", not country.
    const config = { ...DEFAULT_FIELD_MAP_CONFIG, country: "mx_Country" };
    const warnings = validateFieldMap(config, meta);
    expect(warnings).toContainEqual({
      field: "country",
      schemaName: "mx_Country",
      displayName: "Demo Taken By",
      reason: "displayname-mismatch",
    });
  });

  it("warns when a configured SchemaName does not exist in the metadata", () => {
    const config = { ...DEFAULT_FIELD_MAP_CONFIG, industry: "mx_DoesNotExist" };
    expect(validateFieldMap(config, meta)).toContainEqual({
      field: "industry",
      schemaName: "mx_DoesNotExist",
      reason: "not-found",
    });
  });

  it("ignores unmapped (null) fields", () => {
    // DEFAULT has all customs null -> nothing to validate -> no warnings.
    expect(validateFieldMap(DEFAULT_FIELD_MAP_CONFIG, meta)).toEqual([]);
  });
});
