import { describe, expect, it, vi } from "vitest";
import {
  buildLeadSquaredAttributes,
  DEFAULT_FIELD_MAP_CONFIG,
  reverseValueMap,
  type LeadPayloadInput,
  type LeadSquaredFieldMapConfig,
} from "@/lib/services/leadsquared/field-map";

/** Minimal lead payload — nulls for the columns a test doesn't exercise. */
function lead(overrides: Partial<LeadPayloadInput> = {}): LeadPayloadInput {
  return {
    name: null,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    mobile: null,
    company: null,
    stage: null,
    status: null,
    substatus: null,
    statusRemarks: null,
    ...overrides,
  };
}

/** Turn the attribute array into a lookup for concise assertions. */
function asMap(attrs: { Attribute: string; Value: string }[]) {
  return Object.fromEntries(attrs.map((a) => [a.Attribute, a.Value]));
}

describe("buildLeadSquaredAttributes — standard fields", () => {
  it("maps name/email/phone to LSQ standard SchemaNames", () => {
    const attrs = buildLeadSquaredAttributes(
      lead({ name: "Ada Lovelace", email: "ada@x.com", phone: "+919876543210" }),
    );
    const m = asMap(attrs);
    expect(m.FirstName).toBe("Ada");
    expect(m.LastName).toBe("Lovelace");
    expect(m.EmailAddress).toBe("ada@x.com");
    expect(m.Phone).toBe("+919876543210");
  });

  it("prefers explicit firstName/lastName over splitting name", () => {
    const m = asMap(
      buildLeadSquaredAttributes(
        lead({ name: "Ignored Name", firstName: "Grace", lastName: "Hopper" }),
      ),
    );
    expect(m.FirstName).toBe("Grace");
    expect(m.LastName).toBe("Hopper");
  });

  it("handles a single-token name (no LastName emitted)", () => {
    const m = asMap(buildLeadSquaredAttributes(lead({ name: "Cher" })));
    expect(m.FirstName).toBe("Cher");
    expect(m).not.toHaveProperty("LastName");
  });

  it("skips empty, whitespace-only, and null values", () => {
    const attrs = buildLeadSquaredAttributes(
      lead({ name: "  ", email: "", phone: null, company: "   " }),
    );
    expect(attrs).toEqual([]);
  });

  it("returns attributes sorted by Attribute for deterministic hashing", () => {
    const attrs = buildLeadSquaredAttributes(
      lead({ name: "Ada Lovelace", email: "ada@x.com", company: "Analytical" }),
    );
    const names = attrs.map((a) => a.Attribute);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("buildLeadSquaredAttributes — custom fields (mx_) gating", () => {
  it("skips ALL picklist fields (incl. ProspectStage) when no value map is configured", () => {
    const attrs = buildLeadSquaredAttributes(
      lead({
        name: "Ada",
        stage: "Qualified",
        substatus: "Hot",
        status: "Open",
        statusRemarks: "called, interested",
      }),
    );
    // With no value maps, every picklist (stage/status/substatus) is skipped so an
    // unknown value can't 500 the lead; only non-picklist fields survive.
    // (status/substatus custom SchemaNames are also unconfigured here.)
    expect(asMap(attrs)).toEqual({ FirstName: "Ada" });
  });

  it("emits custom fields once their mx_ SchemaNames + value maps are injected", () => {
    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      stage: "mx_Stage",
      subStage: "mx_SubStage",
      status: "mx_Status",
      statusRemarks: "mx_Status_Remarks",
      // Picklists need a value map (allowlist) to emit; identity maps here.
      stageValueMap: { Qualified: "Qualified" },
      subStageValueMap: { Hot: "Hot" },
      statusValueMap: { Open: "Open" },
    };
    const m = asMap(
      buildLeadSquaredAttributes(
        lead({
          stage: "Qualified",
          substatus: "Hot",
          status: "Open",
          statusRemarks: "called, interested",
        }),
        config,
      ),
    );
    expect(m.mx_Stage).toBe("Qualified");
    expect(m.mx_SubStage).toBe("Hot");
    expect(m.mx_Status).toBe("Open");
    expect(m.mx_Status_Remarks).toBe("called, interested"); // remarks is not a picklist
  });

  it("translates picklist values CRM -> LSQ via value maps", () => {
    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      stage: "mx_Stage",
      status: "mx_Status",
      stageValueMap: { Won: "ClosedWon" },
      statusValueMap: { Open: "Active" },
    };
    const m = asMap(buildLeadSquaredAttributes(lead({ stage: "Won", status: "Open" }), config));
    expect(m.mx_Stage).toBe("ClosedWon"); // mapped
    expect(m.mx_Status).toBe("Active"); // mapped
  });

  it("SKIPS an out-of-picklist value when a value map is configured (allowlist), calling onSkip", () => {
    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      stage: "mx_Stage",
      stageValueMap: { Won: "ClosedWon" }, // allowlist: only Won -> ClosedWon
    };
    const onSkip = vi.fn();
    const m = asMap(
      buildLeadSquaredAttributes(lead({ stage: "Prospecting" }), config, { onSkip }),
    );
    // "Prospecting" is neither a CRM key nor a known LSQ value -> dropped, warned.
    expect(Object.keys(m)).not.toContain("mx_Stage");
    expect(onSkip).toHaveBeenCalledWith("stage", "Prospecting");
  });

  it("still sends the rest of the lead when one picklist value is dropped (no 500)", () => {
    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      status: "mx_Status",
      statusValueMap: { Open: "Active" },
    };
    // status "Weird" is out-of-list -> dropped; email/name still sent.
    const m = asMap(
      buildLeadSquaredAttributes(lead({ name: "Ada Lovelace", email: "ada@x.com", status: "Weird" }), config),
    );
    expect(Object.keys(m)).not.toContain("mx_Status");
    expect(m.EmailAddress).toBe("ada@x.com");
    expect(m.FirstName).toBe("Ada");
  });

  it("SKIPS a picklist value when NO value map is configured (default), calling onSkip", () => {
    // The reported bug: no value map -> unknown value must NOT be sent (would 500).
    const config: LeadSquaredFieldMapConfig = { ...DEFAULT_FIELD_MAP_CONFIG, stage: "mx_Stage" };
    const onSkip = vi.fn();
    const m = asMap(buildLeadSquaredAttributes(lead({ stage: "Proposal" }), config, { onSkip }));
    expect(Object.keys(m)).not.toContain("mx_Stage");
    expect(onSkip).toHaveBeenCalledWith("stage", "Proposal");
  });

  it("opt-out (skipUnknownPicklist=false) sends an unmapped picklist value as-is", () => {
    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      stage: "mx_Stage",
      skipUnknownPicklist: false,
    };
    const m = asMap(buildLeadSquaredAttributes(lead({ stage: "Proposal" }), config));
    expect(m.mx_Stage).toBe("Proposal"); // legacy pass-through
  });

  it("an unknown status/stage is omitted while the rest of the lead still syncs", () => {
    // End-to-end shape of the fix: default config (no value maps). Unknown
    // status/stage/substatus are dropped; name/email/phone/city still sent.
    const config: LeadSquaredFieldMapConfig = { ...DEFAULT_FIELD_MAP_CONFIG, status: "mx_Status", cityName: "mx_City" };
    const onSkip = vi.fn();
    const m = asMap(
      buildLeadSquaredAttributes(
        lead({
          name: "Ada Lovelace",
          email: "ada@x.com",
          phone: "+919876543210",
          cityName: "Indore",
          stage: "Proposal", // unknown picklist -> skipped
          status: "Could Not Connect", // unknown picklist -> skipped
        }),
        config,
        { onSkip },
      ),
    );
    // Picklists omitted...
    expect(Object.keys(m)).not.toContain("ProspectStage");
    expect(Object.keys(m)).not.toContain("mx_Status");
    // ...rest of the lead intact (would sync HTTP 200).
    expect(m.FirstName).toBe("Ada");
    expect(m.EmailAddress).toBe("ada@x.com");
    expect(m.Phone).toBe("+919876543210");
    expect(m.mx_City).toBe("Indore");
    expect(onSkip).toHaveBeenCalledWith("stage", "Proposal");
    expect(onSkip).toHaveBeenCalledWith("status", "Could Not Connect");
  });

  it("does NOT send owner (ownerId->OwnerId disabled, both directions)", () => {
    const m = asMap(buildLeadSquaredAttributes(lead({ ownerId: "crm-user-1", email: "a@b.co" })));
    expect(Object.keys(m)).not.toContain("OwnerId");
    expect(m.EmailAddress).toBe("a@b.co"); // rest still syncs
  });

  it("does NOT send country by default (mx_Country is actually 'Demo Taken By')", () => {
    const m = asMap(buildLeadSquaredAttributes(lead({ country: "India", email: "a@b.co" })));
    // config.country defaults null -> country never sent unless a real field is configured.
    expect(Object.values(m)).not.toContain("India");
  });
});

describe("reverseValueMap", () => {
  it("inverts a CRM->LSQ map into LSQ->CRM", () => {
    expect(reverseValueMap({ Won: "ClosedWon", Lost: "ClosedLost" })).toEqual({
      ClosedWon: "Won",
      ClosedLost: "Lost",
    });
  });
  it("returns {} for undefined", () => {
    expect(reverseValueMap(undefined)).toEqual({});
  });
});

describe("buildLeadSquaredAttributes — expanded confirmed fields", () => {
  it("emits non-picklist STANDARD fields to their LSQ SchemaNames", () => {
    const m = asMap(
      buildLeadSquaredAttributes(
        lead({ source: "Website", linkedinUrl: "in/ada", ownerId: "owner-1", lat: 12.34, long: 56.78 }),
      ),
    );
    expect(m.LinkedInId).toBe("in/ada");
    expect(m.Latitude).toBe("12.34");
    expect(m.Longitude).toBe("56.78");
    // owner sync is disabled — OwnerId must never be emitted.
    expect(Object.keys(m)).not.toContain("OwnerId");
    // Source is a picklist; with no sourceValueMap it is skipped (not sent).
    expect(Object.keys(m)).not.toContain("Source");
  });

  it("emits Source once a sourceValueMap is configured", () => {
    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      sourceValueMap: { Website: "Website" },
    };
    const m = asMap(buildLeadSquaredAttributes(lead({ source: "Website" }), config));
    expect(m.Source).toBe("Website");
  });

  it("skips confirmed CUSTOM (mx_) fields until their SchemaName is configured", () => {
    const m = asMap(
      buildLeadSquaredAttributes(lead({ country: "India", cityName: "Indore", website: "x.com" })),
    );
    // Only the standard fields present in the lead survive; customs are null -> skipped.
    expect(Object.keys(m)).not.toContain("mx_Country");
    expect(Object.keys(m)).not.toContain("mx_City");
    expect(Object.keys(m)).not.toContain("mx_URL");
  });

  it("emits confirmed CUSTOM fields once their mx_ SchemaNames are configured", () => {
    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      country: "mx_Country",
      cityName: "mx_City",
      website: "mx_URL",
      addressLine1: "mx_Street1",
      postalCode: "mx_Zip",
    };
    const m = asMap(
      buildLeadSquaredAttributes(
        lead({ country: "India", cityName: "Indore", website: "x.com", addressLine1: "1 Main", postalCode: "452001" }),
        config,
      ),
    );
    expect(m.mx_Country).toBe("India");
    expect(m.mx_City).toBe("Indore");
    expect(m.mx_URL).toBe("x.com");
    expect(m.mx_Street1).toBe("1 Main");
    expect(m.mx_Zip).toBe("452001");
  });

  it("skips AMBIGUOUS fields by default and emits them only when configured", () => {
    const plain = asMap(buildLeadSquaredAttributes(lead({ jobTitle: "CTO", area: "South" })));
    expect(Object.keys(plain)).not.toContain("mx_JobTitle");

    const config: LeadSquaredFieldMapConfig = {
      ...DEFAULT_FIELD_MAP_CONFIG,
      jobTitle: "mx_JobTitle",
      area: "mx_Area",
    };
    const m = asMap(buildLeadSquaredAttributes(lead({ jobTitle: "CTO", area: "South" }), config));
    expect(m.mx_JobTitle).toBe("CTO");
    expect(m.mx_Area).toBe("South");
  });
});
