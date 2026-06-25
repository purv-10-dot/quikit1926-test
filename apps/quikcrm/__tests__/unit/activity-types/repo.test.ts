/**
 * T5 — RED-first repo test for the activity-types read service.
 *
 * Written BEFORE lib/services/activity-types/repo.ts exists, so it is RED for
 * one reason: the module doesn't resolve. The lock this test exists for:
 * ORG-SCOPING ON THE READ. Unlike the lead/product field repos (which read a
 * per-org JSON blob keyed by orgId already), this repo reads the real
 * CrmActivityType / CrmActivityFieldDefinition tables — so every read MUST
 * carry orgId in its `where`, or one org could pull another org's types.
 *
 * Uses the prisma-unit-mock helper (vi.mock of @/lib/db/prisma) rather than
 * the API mockDb (which also mocks auth). This is a pure service test.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import {
  listActivityTypes,
  getActivityTypeWithFields,
} from "@/lib/services/activity-types/repo";

beforeEach(() => {
  prismaMock.crmActivityType.findMany.mockReset();
  prismaMock.crmActivityType.findFirst.mockReset();
});

describe("listActivityTypes", () => {
  it("scopes the read to the caller's orgId (a read cannot pull another org's types)", async () => {
    prismaMock.crmActivityType.findMany.mockResolvedValue([] as never);

    await listActivityTypes("org-A");

    expect(prismaMock.crmActivityType.findMany).toHaveBeenCalled();
    const arg = prismaMock.crmActivityType.findMany.mock.calls[0]?.[0] as {
      where: { orgId?: string };
    };
    expect(arg.where.orgId).toBe("org-A");
  });

  it("returns the rows the query produces", async () => {
    prismaMock.crmActivityType.findMany.mockResolvedValue([
      { id: "at1", orgId: "org-A", code: "upwork_connect", label: "Upwork Connect" },
    ] as never);

    const result = await listActivityTypes("org-A");
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("upwork_connect");
  });
});

describe("getActivityTypeWithFields", () => {
  it("scopes the lookup to BOTH id and orgId (no cross-tenant read)", async () => {
    prismaMock.crmActivityType.findFirst.mockResolvedValue({
      id: "at1",
      orgId: "org-A",
      code: "upwork_connect",
      label: "Upwork Connect",
      fieldDefinitions: [],
    } as never);

    await getActivityTypeWithFields("org-A", "at1");

    const arg = prismaMock.crmActivityType.findFirst.mock.calls[0]?.[0] as {
      where: { id?: string; orgId?: string };
    };
    expect(arg.where.orgId).toBe("org-A");
    expect(arg.where.id).toBe("at1");
  });

  it("returns null when the type is not found in the caller's org", async () => {
    prismaMock.crmActivityType.findFirst.mockResolvedValue(null as never);

    const result = await getActivityTypeWithFields("org-A", "missing");
    expect(result).toBeNull();
  });

  it("includes the type's field definitions when present", async () => {
    prismaMock.crmActivityType.findFirst.mockResolvedValue({
      id: "at1",
      orgId: "org-A",
      code: "upwork_connect",
      label: "Upwork Connect",
      fieldDefinitions: [{ id: "fd1", key: "bid_amount", label: "Bid Amount", fieldType: "Number" }],
    } as never);

    const result = await getActivityTypeWithFields("org-A", "at1");
    expect(result?.fieldDefinitions).toHaveLength(1);
    expect(result?.fieldDefinitions[0]?.key).toBe("bid_amount");
  });
});
