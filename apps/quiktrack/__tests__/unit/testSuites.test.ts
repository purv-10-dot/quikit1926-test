import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import {
  createTestSuite,
  createTestSuiteInTransaction,
  DEFAULT_TEST_SUITE_SECTION_NAME,
} from "@/lib/services/testSuites";

const ORG = "org_1";
const PROJECT = "proj_1";
const USER = "user_1";

beforeEach(() => {
  resetMockDb();
});

describe("createTestSuiteInTransaction", () => {
  it("creates the suite and seeds a default root section in the same tx", async () => {
    mockDb.qtTestSuite.create.mockResolvedValue({ id: "suite_1", name: "Regression" } as never);
    mockDb.qtTestSection.create.mockResolvedValue({ id: "sec_1" } as never);

    const result = await createTestSuiteInTransaction(mockDb, ORG, PROJECT, USER, { name: "Regression" });

    expect(result).toMatchObject({ id: "suite_1", name: "Regression" });
    expect(mockDb.qtTestSuite.create).toHaveBeenCalledWith({
      data: { orgId: ORG, projectId: PROJECT, name: "Regression", description: null, createdBy: USER },
      select: { id: true, name: true },
    });
    expect(mockDb.qtTestSection.create).toHaveBeenCalledWith({
      data: { orgId: ORG, suiteId: "suite_1", name: DEFAULT_TEST_SUITE_SECTION_NAME, orderNo: 0 },
    });
  });

  it("passes description through when given", async () => {
    mockDb.qtTestSuite.create.mockResolvedValue({ id: "suite_1", name: "Regression" } as never);
    mockDb.qtTestSection.create.mockResolvedValue({ id: "sec_1" } as never);

    await createTestSuiteInTransaction(mockDb, ORG, PROJECT, USER, {
      name: "Regression",
      description: "Covers the login flow",
    });

    expect(mockDb.qtTestSuite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: "Covers the login flow" }) }),
    );
  });
});

describe("createTestSuite", () => {
  it("opens its own transaction", async () => {
    mockDb.$transaction.mockImplementation((cb: unknown) => (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb));
    mockDb.qtTestSuite.create.mockResolvedValue({ id: "suite_1", name: "Regression" } as never);
    mockDb.qtTestSection.create.mockResolvedValue({ id: "sec_1" } as never);

    const result = await createTestSuite(ORG, PROJECT, USER, { name: "Regression" });

    expect(result).toMatchObject({ id: "suite_1" });
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });
});
