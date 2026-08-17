import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { parseQql } from "@/lib/services/qql/parser";
import { buildQqlWhere } from "@/lib/services/qql/buildWhere";
import { QqlParseError } from "@/lib/services/qql/tokenizer";

/**
 * Regression: QQL resolved `status` / `sprint` names and `epic` keys with an
 * exact `{ in: [...] }` match, so a query typed in a different case than the
 * stored row threw "Unknown status/sprint/epic" instead of matching.
 */
const CTX = { orgId: "org1", projectId: "proj1", userId: "user1" };

beforeEach(() => {
  resetMockDb();
  // The resolver only ever sees rows the DB returned, so these stand for the
  // canonically-cased rows stored in the project.
  mockDb.qtIssueStatus.findMany.mockResolvedValue([
    { id: "status-inprog", name: "In Progress" },
  ] as never);
  mockDb.qtSprint.findMany.mockResolvedValue([
    { id: "sprint-1", name: "Sprint One" },
  ] as never);
  mockDb.qtIssue.findMany.mockResolvedValue([
    { id: "epic-1", key: "QUIKTR-12" },
  ] as never);
});

describe("buildQqlWhere — case-insensitive value resolution", () => {
  it.each(["In Progress", "in progress", "IN PROGRESS", "In ProGRESS"])(
    "resolves status %j to the same id",
    async (typed) => {
      const { where } = parseQql(`status = "${typed}"`);
      await expect(buildQqlWhere(where!, CTX)).resolves.toEqual({ statusId: "status-inprog" });
    },
  );

  it.each(["Sprint One", "sprint one", "SPRINT ONE"])(
    "resolves sprint %j to the same id",
    async (typed) => {
      const { where } = parseQql(`sprint = "${typed}"`);
      await expect(buildQqlWhere(where!, CTX)).resolves.toEqual({ sprintId: "sprint-1" });
    },
  );

  it.each(["QUIKTR-12", "quiktr-12", "QuikTr-12"])(
    "resolves epic key %j to the same id",
    async (typed) => {
      const { where } = parseQql(`epic = "${typed}"`);
      await expect(buildQqlWhere(where!, CTX)).resolves.toEqual({ epicId: "epic-1" });
    },
  );

  it("sends an ILIKE-equality per value rather than a case-sensitive IN", async () => {
    const { where } = parseQql('status = "in progress"');
    await buildQqlWhere(where!, CTX);
    expect(mockDb.qtIssueStatus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "proj1",
          OR: [{ name: { equals: "in progress", mode: "insensitive" } }],
        },
      }),
    );
  });

  it("still rejects a value that genuinely has no row", async () => {
    mockDb.qtIssueStatus.findMany.mockResolvedValue([] as never);
    const { where } = parseQql('status = "nope"');
    await expect(buildQqlWhere(where!, CTX)).rejects.toBeInstanceOf(QqlParseError);
  });

  it("matches every member of an IN list regardless of case", async () => {
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "status-inprog", name: "In Progress" },
      { id: "status-done", name: "Done" },
    ] as never);
    const { where } = parseQql('status IN ("in progress", "DONE")');
    await expect(buildQqlWhere(where!, CTX)).resolves.toEqual({
      statusId: { in: ["status-inprog", "status-done"] },
    });
  });
});
