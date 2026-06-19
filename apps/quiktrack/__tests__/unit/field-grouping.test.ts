import { describe, it, expect } from "vitest";
import {
  decodeFieldPatch,
  deriveFieldGroups,
  encodeVirtualGroupId,
  isFieldMode,
} from "@/app/(dashboard)/spaces/[id]/grouped-kanban/_lib/field-grouping";
import type {
  BoardMemberLite,
  GroupedBoardStatus,
  GroupedBoardTask,
} from "@/app/(dashboard)/spaces/[id]/grouped-kanban/_types";

function task(overrides: Partial<GroupedBoardTask>): GroupedBoardTask {
  return {
    id: "t1",
    key: "QT-1",
    title: "Task",
    type: "TASK",
    priority: "MEDIUM",
    statusId: "s1",
    sprintId: null,
    assigneeId: null,
    reporterId: null,
    groupId: null,
    orderInGroup: 0,
    startDate: null,
    dueDate: null,
    storyPoints: null,
    eta: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const STATUSES: GroupedBoardStatus[] = [
  { id: "s1", name: "To Do", color: "#aaa", category: "TODO", orderIndex: 0 },
  { id: "s2", name: "In Progress", color: "#bbb", category: "IN_PROGRESS", orderIndex: 1 },
  { id: "s3", name: "Done", color: "#ccc", category: "DONE", orderIndex: 2 },
];

const MEMBERS: BoardMemberLite[] = [
  {
    userId: "u1",
    user: { id: "u1", email: "a@x.com", firstName: "Ann", lastName: null },
  },
  {
    userId: "u2",
    user: { id: "u2", email: "b@x.com", firstName: "Bob", lastName: "Lee" },
  },
];

describe("isFieldMode", () => {
  it("is false only for manual", () => {
    expect(isFieldMode("manual")).toBe(false);
    expect(isFieldMode("status")).toBe(true);
    expect(isFieldMode("priority")).toBe(true);
    expect(isFieldMode("assignee")).toBe(true);
    expect(isFieldMode("type")).toBe(true);
  });
});

describe("deriveFieldGroups — manual", () => {
  it("returns no derived groups in manual mode", () => {
    expect(deriveFieldGroups("manual", [task({})], { statuses: STATUSES, members: MEMBERS })).toEqual([]);
  });
});

describe("deriveFieldGroups — status", () => {
  it("emits one group per status in order, even when empty, and buckets tasks", () => {
    const tasks = [
      task({ id: "a", key: "QT-2", statusId: "s2" }),
      task({ id: "b", key: "QT-1", statusId: "s2" }),
      task({ id: "c", key: "QT-3", statusId: "s1" }),
    ];
    const groups = deriveFieldGroups("status", tasks, { statuses: STATUSES, members: MEMBERS });
    expect(groups.map((g) => g.name)).toEqual(["To Do", "In Progress", "Done"]);
    expect(groups[0].taskCount).toBe(1); // s1
    expect(groups[1].taskCount).toBe(2); // s2
    expect(groups[2].taskCount).toBe(0); // s3 empty but present
    // tasks within a group are sorted by key
    expect(groups[1].tasks.map((t) => t.key)).toEqual(["QT-1", "QT-2"]);
    // ids round-trip through decodeFieldPatch
    expect(decodeFieldPatch(groups[1].id)).toEqual({ statusId: "s2" });
  });
});

describe("deriveFieldGroups — priority", () => {
  it("emits all five priority buckets in canonical order", () => {
    const groups = deriveFieldGroups("priority", [task({ priority: "HIGH" })], {
      statuses: STATUSES,
      members: MEMBERS,
    });
    expect(groups.map((g) => g.name)).toEqual(["Highest", "High", "Medium", "Low", "Lowest"]);
    expect(groups.find((g) => g.name === "High")!.taskCount).toBe(1);
  });
});

describe("deriveFieldGroups — type", () => {
  it("emits TASK/BUG/STORY buckets", () => {
    const groups = deriveFieldGroups("type", [task({ type: "BUG" })], {
      statuses: STATUSES,
      members: MEMBERS,
    });
    expect(groups.map((g) => g.name)).toEqual(["Task", "Bug", "Story"]);
    expect(decodeFieldPatch(groups[1].id)).toEqual({ type: "BUG" });
  });
});

describe("deriveFieldGroups — assignee", () => {
  it("only surfaces members who own work, plus an Unassigned catch-all", () => {
    const tasks = [
      task({ id: "a", assigneeId: "u1" }),
      task({ id: "b", assigneeId: null }),
    ];
    const groups = deriveFieldGroups("assignee", tasks, { statuses: STATUSES, members: MEMBERS });
    // u1 has work, u2 does not → u2 omitted; Unassigned bucket appended
    const names = groups.map((g) => g.name);
    expect(names).toContain("Ann");
    expect(names).not.toContain("Bob Lee");
    expect(names).toContain("Unassigned");
    const unassigned = groups.find((g) => g.name === "Unassigned")!;
    expect(decodeFieldPatch(unassigned.id)).toEqual({ assigneeId: null });
    expect(decodeFieldPatch(groups.find((g) => g.name === "Ann")!.id)).toEqual({
      assigneeId: "u1",
    });
  });
});

describe("decodeFieldPatch", () => {
  it("returns null for manual / unparseable ids", () => {
    expect(decodeFieldPatch("manual::")).toBeNull();
    expect(decodeFieldPatch("no-delimiter")).toBeNull();
  });
  it("returns null for empty status/priority/type values but null assignee is valid", () => {
    expect(decodeFieldPatch(encodeVirtualGroupId("status", ""))).toBeNull();
    expect(decodeFieldPatch(encodeVirtualGroupId("assignee", ""))).toEqual({
      assigneeId: null,
    });
  });
});
