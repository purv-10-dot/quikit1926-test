import { describe, it, expect } from "vitest";
import {
  createKPISchema,
  updateKPISchema,
  kpiListParamsSchema,
  weeklyValueSchema,
  kpiNoteSchema,
} from "@/lib/schemas/kpiSchema";

// Valid cuid format (starts with 'c', 25 chars total). These are synthetic.
const OWNER_A = "ckabcdefghijklmnopqrstu01";
const OWNER_B = "ckabcdefghijklmnopqrstu02";
const OWNER_C = "ckabcdefghijklmnopqrstu03";
const TEAM_A = "ckteam00000000000000000001";

const baseIndividual = {
  name: "Revenue",
  quarter: "Q1" as const,
  year: 2026,
  measurementUnit: "Currency" as const,
  kpiLevel: "individual" as const,
  owner: OWNER_A,
};

const baseTeam = {
  name: "Team Revenue",
  quarter: "Q1" as const,
  year: 2026,
  measurementUnit: "Currency" as const,
  kpiLevel: "team" as const,
  teamId: TEAM_A,
  ownerIds: [OWNER_A, OWNER_B],
  ownerContributions: { [OWNER_A]: 60, [OWNER_B]: 40 },
};

describe("createKPISchema — happy paths", () => {
  it("accepts a valid individual KPI", () => {
    expect(createKPISchema.safeParse(baseIndividual).success).toBe(true);
  });

  it("accepts a valid team KPI", () => {
    expect(createKPISchema.safeParse(baseTeam).success).toBe(true);
  });

  it("accepts a team KPI with 3 owners summing to 100", () => {
    const input = {
      ...baseTeam,
      ownerIds: [OWNER_A, OWNER_B, OWNER_C],
      ownerContributions: { [OWNER_A]: 33.5, [OWNER_B]: 33.5, [OWNER_C]: 33 },
    };
    expect(createKPISchema.safeParse(input).success).toBe(true);
  });
});

describe("createKPISchema — individual invariants", () => {
  it("rejects individual without owner", () => {
    const { owner: _o, ...rest } = baseIndividual;
    expect(createKPISchema.safeParse(rest).success).toBe(false);
  });

  it("rejects individual with ownerIds set", () => {
    const input = { ...baseIndividual, ownerIds: [OWNER_B] };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects individual with invalid cuid for owner", () => {
    const input = { ...baseIndividual, owner: "not-a-cuid" };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });
});

describe("createKPISchema — team invariants", () => {
  it("rejects team without teamId", () => {
    const { teamId: _t, ...rest } = baseTeam;
    expect(createKPISchema.safeParse(rest).success).toBe(false);
  });

  it("rejects team with owner set", () => {
    const input = { ...baseTeam, owner: OWNER_A };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects team with empty ownerIds", () => {
    const input = { ...baseTeam, ownerIds: [] };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects team with contributions summing to 99", () => {
    const input = {
      ...baseTeam,
      ownerContributions: { [OWNER_A]: 60, [OWNER_B]: 39 },
    };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects team with contributions summing to 101", () => {
    const input = {
      ...baseTeam,
      ownerContributions: { [OWNER_A]: 60, [OWNER_B]: 41 },
    };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("accepts team with contributions summing to 100.5 (within ±0.5 slack)", () => {
    const input = {
      ...baseTeam,
      ownerContributions: { [OWNER_A]: 60.25, [OWNER_B]: 40.25 },
    };
    expect(createKPISchema.safeParse(input).success).toBe(true);
  });

  it("rejects team with contribution keys not matching ownerIds", () => {
    const input = {
      ...baseTeam,
      ownerContributions: { [OWNER_A]: 60, [OWNER_C]: 40 }, // C not in ownerIds
    };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });
});

describe("createKPISchema — field validation", () => {
  it("rejects empty name", () => {
    const input = { ...baseIndividual, name: "" };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects name over 200 chars", () => {
    const input = { ...baseIndividual, name: "x".repeat(201) };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects year 2019", () => {
    const input = { ...baseIndividual, year: 2019 };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects negative target", () => {
    const input = { ...baseIndividual, target: -5 };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects unknown measurementUnit", () => {
    const input = { ...baseIndividual, measurementUnit: "Widgets" as any };
    expect(createKPISchema.safeParse(input).success).toBe(false);
  });
});

describe("updateKPISchema — partial + contradictions", () => {
  it("accepts a minimal update (just name)", () => {
    expect(updateKPISchema.safeParse({ name: "New Name" }).success).toBe(true);
  });

  it("rejects update setting kpiLevel=team with owner", () => {
    const input = { name: "x", kpiLevel: "team" as const, owner: OWNER_A };
    expect(updateKPISchema.safeParse(input).success).toBe(false);
  });

  it("rejects update setting kpiLevel=individual with owner=null", () => {
    const input = { name: "x", kpiLevel: "individual" as const, owner: null };
    expect(updateKPISchema.safeParse(input).success).toBe(false);
  });
});

describe("weeklyValueSchema", () => {
  it("accepts a valid week entry", () => {
    expect(weeklyValueSchema.safeParse({ weekNumber: 5, value: 42 }).success).toBe(true);
  });

  it("accepts null value (unset)", () => {
    expect(weeklyValueSchema.safeParse({ weekNumber: 1, value: null }).success).toBe(true);
  });

  it("rejects weekNumber 0", () => {
    expect(weeklyValueSchema.safeParse({ weekNumber: 0, value: 1 }).success).toBe(false);
  });

  it("rejects weekNumber 14", () => {
    expect(weeklyValueSchema.safeParse({ weekNumber: 14, value: 1 }).success).toBe(false);
  });
});

describe("kpiNoteSchema", () => {
  it("accepts a valid note", () => {
    expect(kpiNoteSchema.safeParse({ content: "A note" }).success).toBe(true);
  });

  it("rejects empty note", () => {
    expect(kpiNoteSchema.safeParse({ content: "" }).success).toBe(false);
  });
});

describe("kpiListParamsSchema", () => {
  it("defaults page=1, pageSize=20, sortBy=createdAt", () => {
    const parsed = kpiListParamsSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.sortBy).toBe("createdAt");
    expect(parsed.sortOrder).toBe("desc");
  });

  it("accepts kpiLevel filter", () => {
    const parsed = kpiListParamsSchema.parse({ kpiLevel: "team" });
    expect(parsed.kpiLevel).toBe("team");
  });

  it("rejects pageSize > 1000", () => {
    expect(kpiListParamsSchema.safeParse({ pageSize: 1001 }).success).toBe(false);
  });
});
