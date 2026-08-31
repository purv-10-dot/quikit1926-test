import { describe, it, expect } from "vitest";
import { parse } from "@/lib/tql/parser";
import { translate } from "@/lib/tql/translator";
import { TqlUnsupportedFieldError, TqlUnsupportedOperatorError, TqlParseError } from "@/lib/tql/errors";

const CTX = { userId: "user-1", now: new Date("2026-06-24T12:00:00.000Z") };

function whereOf(tql: string) {
  return translate(parse(tql), CTX).where;
}

describe("translate — supported native fields", () => {
  it("project =", () => {
    expect(whereOf('project = "proj-1"')).toEqual({ projectId: "proj-1" });
  });

  it("assignee = currentUser()", () => {
    expect(whereOf("assignee = currentUser()")).toEqual({ assigneeId: "user-1" });
  });

  it("assignee != value", () => {
    expect(whereOf('assignee != "u2"')).toEqual({ assigneeId: { not: "u2" } });
  });

  it("reporter = value ORs reporterId and createdBy", () => {
    expect(whereOf('reporter = "u1"')).toEqual({ OR: [{ reporterId: "u1" }, { createdBy: "u1" }] });
  });

  it("status = value (case-insensitive name match)", () => {
    expect(whereOf('status = "Done"')).toEqual({ status: { name: { equals: "Done", mode: "insensitive" } } });
  });

  it("status != value", () => {
    expect(whereOf('status != "Done"')).toEqual({ NOT: { status: { name: { equals: "Done", mode: "insensitive" } } } });
  });

  it("priority = value", () => {
    expect(whereOf('priority = "high"')).toEqual({ priority: "HIGH" });
  });

  it("type IN (...)", () => {
    expect(whereOf('type IN ("bug", "task")')).toEqual({ type: { in: ["BUG", "TASK"] } });
  });

  it("created >= a literal ISO date", () => {
    expect(whereOf('created >= "2026-01-01"')).toEqual({ createdAt: { gte: new Date("2026-01-01") } });
  });

  it("updated < now()", () => {
    expect(whereOf("updated < now()")).toEqual({ updatedAt: { lt: CTX.now } });
  });

  it("due >= startOfDay()", () => {
    const { where } = translate(parse("due >= startOfDay()"), CTX);
    expect(where).toEqual({ dueDate: { gte: new Date("2026-06-24T00:00:00.000Z") } });
  });

  it("resolution IS EMPTY", () => {
    expect(whereOf("resolution IS EMPTY")).toEqual({ resolutionId: null });
  });

  it("resolution IS NOT EMPTY", () => {
    expect(whereOf("resolution IS NOT EMPTY")).toEqual({ resolutionId: { not: null } });
  });

  it("summary ~ text", () => {
    expect(whereOf('summary ~ "login bug"')).toEqual({ title: { contains: "login bug", mode: "insensitive" } });
  });

  it("description !~ text", () => {
    expect(whereOf('description !~ "todo"')).toEqual({
      NOT: { description: { contains: "todo", mode: "insensitive" } },
    });
  });

  it("text ~ searches title/description/key", () => {
    expect(whereOf('text ~ "foo"')).toEqual({
      OR: [
        { title: { contains: "foo", mode: "insensitive" } },
        { description: { contains: "foo", mode: "insensitive" } },
        { key: { contains: "foo", mode: "insensitive" } },
      ],
    });
  });

  it("parent = value", () => {
    expect(whereOf('parent = "issue-1"')).toEqual({ parentId: "issue-1" });
  });

  it("sprint = value", () => {
    expect(whereOf('sprint = "sprint-1"')).toEqual({ sprintId: "sprint-1" });
  });

  it("key = value", () => {
    expect(whereOf('key = "QT-1"')).toEqual({ key: "QT-1" });
  });

  it("attachments IS EMPTY / IS NOT EMPTY", () => {
    expect(whereOf("attachments IS EMPTY")).toEqual({ attachments: { none: {} } });
    expect(whereOf("attachments IS NOT EMPTY")).toEqual({ attachments: { some: {} } });
  });

  it("AND / OR / NOT compose structurally", () => {
    expect(whereOf('status = "Done" AND NOT (priority = "LOW" OR assignee IS EMPTY)')).toEqual({
      AND: [
        { status: { name: { equals: "Done", mode: "insensitive" } } },
        { NOT: { OR: [{ priority: "LOW" }, { assigneeId: null }] } },
      ],
    });
  });
});

describe("translate — IN on additional native fields", () => {
  it("status IN (...) is case-insensitive", () => {
    expect(whereOf('status IN ("Done", "In Progress")')).toEqual({
      status: { name: { in: ["Done", "In Progress"], mode: "insensitive" } },
    });
  });

  it("status NOT IN (...)", () => {
    expect(whereOf('status NOT IN ("Done")')).toEqual({
      NOT: { status: { name: { in: ["Done"], mode: "insensitive" } } },
    });
  });

  it("priority NOT IN (...)", () => {
    expect(whereOf('priority NOT IN ("low", "lowest")')).toEqual({ priority: { notIn: ["LOW", "LOWEST"] } });
  });

  it("reporter IN (...) ORs reporterId and createdBy across all values", () => {
    expect(whereOf('reporter IN ("u1", "u2")')).toEqual({
      OR: [{ reporterId: { in: ["u1", "u2"] } }, { createdBy: { in: ["u1", "u2"] } }],
    });
  });

  it("reporter NOT IN (...) negates the OR", () => {
    expect(whereOf('reporter NOT IN ("u1")')).toEqual({
      NOT: { OR: [{ reporterId: { in: ["u1"] } }, { createdBy: { in: ["u1"] } }] },
    });
  });

  it("sprint IN (...) uses the plain equality column", () => {
    expect(whereOf('sprint IN ("s1", "s2")')).toEqual({ sprintId: { in: ["s1", "s2"] } });
  });
});

describe("translate — IS EMPTY on additional fields", () => {
  it("due IS EMPTY / IS NOT EMPTY", () => {
    expect(whereOf("due IS EMPTY")).toEqual({ dueDate: null });
    expect(whereOf("due IS NOT EMPTY")).toEqual({ dueDate: { not: null } });
  });

  it("startDate IS EMPTY / IS NOT EMPTY", () => {
    expect(whereOf("startDate IS EMPTY")).toEqual({ startDate: null });
    expect(whereOf("startDate IS NOT EMPTY")).toEqual({ startDate: { not: null } });
  });

  it("parent IS EMPTY uses the equality column", () => {
    expect(whereOf("parent IS EMPTY")).toEqual({ parentId: null });
  });
});

describe("translate — function value used where a scalar is required", () => {
  it("throws when openSprints() (a non-scalar function) is used as a plain comparison value", () => {
    expect(() => whereOf("sprint = openSprints()")).toThrow(TqlParseError);
  });
});

describe("translate — cf[...] delegates to the custom-field engine", () => {
  it("cf[id] = value maps to a valueText equals", () => {
    expect(whereOf('cf[42] = "Gold"')).toEqual({
      fieldValues: { some: { fieldId: "42", valueText: { equals: "Gold", mode: "insensitive" } } },
    });
  });

  it("cf[id] ~ value maps to contains", () => {
    expect(whereOf('cf[42] ~ "Gol"')).toEqual({
      fieldValues: { some: { fieldId: "42", valueText: { contains: "Gol", mode: "insensitive" } } },
    });
  });

  it("cf[id] IN (...) maps to valueText in", () => {
    expect(whereOf('cf[42] IN ("Gold", "Silver")')).toEqual({
      fieldValues: { some: { fieldId: "42", valueText: { in: ["Gold", "Silver"] } } },
    });
  });

  it("cf[id] IS EMPTY maps to a none clause", () => {
    expect(whereOf("cf[42] IS EMPTY")).toEqual({ fieldValues: { none: { fieldId: "42" } } });
  });

  it("cf[id] > value throws a clear error when no field resolver is available", () => {
    expect(() => whereOf('cf[42] > "5"')).toThrow(TqlParseError);
  });

  it("cf[\"Name\"] resolves through the field resolver to the real fieldId for =", () => {
    const { where } = translate(parse('cf["Customer Tier"] = "Gold"'), {
      ...CTX,
      resolveCustomField: (ref) => (ref === "Customer Tier" ? { id: "field-1", type: "SHORT_TEXT" } : undefined),
    });
    expect(where).toEqual({
      fieldValues: { some: { fieldId: "field-1", valueText: { equals: "Gold", mode: "insensitive" } } },
    });
  });

  it("cf[id] > value on a NUMBER field maps to valueNumber gt via the resolver", () => {
    const { where } = translate(parse('cf[42] > "5"'), {
      ...CTX,
      resolveCustomField: (ref) => (ref === "42" ? { id: "42", type: "NUMBER" } : undefined),
    });
    expect(where).toEqual({ fieldValues: { some: { fieldId: "42", valueNumber: { gt: 5 } } } });
  });

  it("cf[id] >= value on a DATE field maps to valueDate gte via the resolver", () => {
    const { where } = translate(parse('cf[42] >= "2026-01-01"'), {
      ...CTX,
      resolveCustomField: (ref) => (ref === "42" ? { id: "42", type: "DATE" } : undefined),
    });
    expect(where).toEqual({ fieldValues: { some: { fieldId: "42", valueDate: { gte: new Date("2026-01-01") } } } });
  });

  it("cf[id] > value on a non-numeric/date field throws TqlUnsupportedOperatorError", () => {
    expect(() =>
      translate(parse('cf[42] > "5"'), {
        ...CTX,
        resolveCustomField: () => ({ id: "42", type: "SHORT_TEXT" }),
      }),
    ).toThrow(TqlUnsupportedOperatorError);
  });

  it("cf[id] IN (...) resolves the field via the resolver too", () => {
    const { where } = translate(parse('cf["Tier"] IN ("Gold")'), {
      ...CTX,
      resolveCustomField: (ref) => (ref === "Tier" ? { id: "field-2", type: "DROPDOWN_SINGLE" } : undefined),
    });
    expect(where).toEqual({ fieldValues: { some: { fieldId: "field-2", valueText: { in: ["Gold"] } } } });
  });

  it("cf[id] IS EMPTY resolves the field via the resolver too", () => {
    const { where } = translate(parse('cf["Tier"] IS EMPTY'), {
      ...CTX,
      resolveCustomField: (ref) => (ref === "Tier" ? { id: "field-2", type: "DROPDOWN_SINGLE" } : undefined),
    });
    expect(where).toEqual({ fieldValues: { none: { fieldId: "field-2" } } });
  });
});

describe("translate — unsupported fields", () => {
  it.each(["labels", "hierarchyLevel", "resolutionDate", "watcher", "watchers", "voter", "votes", "comment"])(
    "throws TqlUnsupportedFieldError for %s",
    (field) => {
      expect(() => whereOf(`${field} = "x"`)).toThrow(TqlUnsupportedFieldError);
    },
  );

  it("gives an actionable reason for labels pointing at cf[...]", () => {
    try {
      whereOf('labels = "x"');
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TqlUnsupportedFieldError);
      expect((e as Error).message).toMatch(/cf\[/);
    }
  });

  it("throws a generic TqlParseError (not Unsupported) for a totally unknown field", () => {
    try {
      whereOf('notarealfield = "x"');
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TqlParseError);
      expect(e).not.toBeInstanceOf(TqlUnsupportedFieldError);
    }
  });
});

describe("translate — comparison value validation errors", () => {
  it("throws TqlParseError for an unknown type value", () => {
    expect(() => whereOf('type = "notarealtype"')).toThrow(TqlParseError);
  });

  it("throws TqlParseError for an unknown priority value", () => {
    expect(() => whereOf('priority = "notarealpriority"')).toThrow(TqlParseError);
  });
});

describe("translate — IS EMPTY on a field with no equality column", () => {
  it("throws TqlUnsupportedOperatorError for type IS EMPTY", () => {
    expect(() => whereOf("type IS EMPTY")).toThrow(TqlUnsupportedOperatorError);
  });

  it("throws TqlUnsupportedOperatorError for priority IS EMPTY", () => {
    expect(() => whereOf("priority IS EMPTY")).toThrow(TqlUnsupportedOperatorError);
  });
});

describe("translate — unsupported operators on supported fields", () => {
  it("project doesn't support ~ ", () => {
    expect(() => whereOf('project ~ "x"')).toThrow(TqlUnsupportedOperatorError);
  });

  it("summary doesn't support =", () => {
    expect(() => whereOf('summary = "x"')).toThrow(TqlUnsupportedOperatorError);
  });

  it("status doesn't support > ", () => {
    expect(() => whereOf('status > "x"')).toThrow(TqlUnsupportedOperatorError);
  });

  it("created doesn't support IN", () => {
    expect(() => whereOf('created IN ("2026-01-01")')).toThrow(TqlUnsupportedOperatorError);
  });
});

describe("translate — ORDER BY", () => {
  it("orders by a sortable native field", () => {
    const { orderBy } = translate(parse('status = "x" ORDER BY updated DESC'), CTX);
    expect(orderBy).toEqual([{ updatedAt: "desc" }]);
  });

  it("supports multiple ORDER BY clauses", () => {
    const { orderBy } = translate(parse('status = "x" ORDER BY priority DESC, updated ASC'), CTX);
    expect(orderBy).toEqual([{ priority: "desc" }, { updatedAt: "asc" }]);
  });

  it("throws for ORDER BY on a non-sortable field", () => {
    expect(() => translate(parse('status = "x" ORDER BY project'), CTX)).toThrow(TqlParseError);
  });

  it("throws for ORDER BY cf[...]", () => {
    expect(() => translate(parse('status = "x" ORDER BY cf[42]'), CTX)).toThrow(TqlParseError);
  });
});

describe("translate — empty query", () => {
  it("an empty where clause with only ORDER BY produces an empty where", () => {
    const { where, orderBy } = translate(parse("ORDER BY updated"), CTX);
    expect(where).toEqual({});
    expect(orderBy).toEqual([{ updatedAt: "asc" }]);
  });
});
