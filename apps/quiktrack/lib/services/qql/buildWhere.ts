/**
 * QQL AST → Prisma `where`/`orderBy` builder — QUIKTR-117.
 *
 * Two-pass design: pass 1 (resolveLookups) walks the AST once collecting
 * every status name / sprint name / epic key referenced anywhere in the
 * query and batch-resolves each set in one query; pass 2 (buildNode) walks
 * the AST again, synchronously, using those lookup maps. Keeps the
 * recursive builder itself free of async/await.
 *
 * Every value comparison against the database (Prisma), not string
 * concatenation — mirrors lib/customFields/filterQuery.ts's
 * "typed operator -> switch -> Prisma fragment" shape.
 */
import { db } from "@/lib/db";
import { getActiveFieldsForProject } from "@/lib/services/customFieldValues";
import { issuePriorityEnum, issueTypeEnum } from "@/lib/validation/issue";
import { parseRelativeOrIsoDate } from "./dates";
import { QqlParseError } from "./tokenizer";
import type { ComparisonNode, InNode, QqlNode, QqlOp, QqlOrderBy } from "./parser";

/** Loosely typed on purpose — a JSON-shaped Prisma where fragment assembled
 *  dynamically field-by-field; cast to Prisma.QtIssueWhereInput once at the
 *  single call site in lib/mcp/server.ts (see CLAUDE.md's `as unknown as`
 *  escape hatch), not threaded through as `any` anywhere in this module. */
type WhereFragment = Record<string, unknown>;

type FieldKind = "equality" | "date" | "text" | "labels" | "project";

const FIELD_KIND: Record<string, FieldKind> = {
  project: "project",
  type: "equality",
  status: "equality",
  priority: "equality",
  assignee: "equality",
  reporter: "equality",
  sprint: "equality",
  epic: "equality",
  labels: "labels",
  created: "date",
  updated: "date",
  text: "text",
};

const EQUALITY_OPS = new Set<QqlOp>(["=", "!="]);
const DATE_OPS = new Set<QqlOp>(["=", "!=", ">", "<", ">=", "<="]);
const DATE_PRISMA_OP: Record<string, string> = { "=": "equals", "!=": "not", ">": "gt", "<": "lt", ">=": "gte", "<=": "lte" };

const EQUALITY_COLUMN: Record<string, string> = {
  status: "statusId",
  assignee: "assigneeId",
  reporter: "reporterId",
  sprint: "sprintId",
  epic: "epicId",
};

const ORDER_FIELD_COLUMN: Record<string, string> = {
  created: "createdAt",
  updated: "updatedAt",
  priority: "priority",
  type: "type",
  status: "statusId",
  assignee: "assigneeId",
  reporter: "reporterId",
  sprint: "sprintId",
  epic: "epicId",
};

const NULL_SENTINEL = "__QQL_NULL__";

export interface QqlBuildContext {
  orgId: string;
  projectId: string;
  userId: string;
}

interface Lookups {
  statusIdByName: Map<string, string>;
  sprintIdByName: Map<string, string>;
  epicIdByKey: Map<string, string>;
  labelFieldIds: string[];
}

/** Normalize a user-supplied name/key for case-insensitive lookup-map keys. */
function fold(value: string): string {
  return value.toLowerCase();
}

/**
 * Case-insensitive stand-in for `{ column: { in: values } }`. Prisma's `in`
 * ignores `mode`, so the batch resolve fans out to one ILIKE-equality per value.
 */
function insensitiveIn(column: string, values: string[]): WhereFragment[] {
  return values.map((v) => ({ [column]: { equals: v, mode: "insensitive" } }));
}

function collectFieldValues(node: QqlNode, field: string): string[] {
  const out: string[] = [];
  const walk = (n: QqlNode): void => {
    if (n.kind === "and" || n.kind === "or") {
      walk(n.left);
      walk(n.right);
      return;
    }
    if (n.field === field) out.push(...(n.kind === "in" ? n.values : [n.value]));
  };
  walk(node);
  return out;
}

async function resolveLookups(node: QqlNode, ctx: QqlBuildContext): Promise<Lookups> {
  const statusNames = collectFieldValues(node, "status");
  const sprintNames = collectFieldValues(node, "sprint");
  const epicKeys = collectFieldValues(node, "epic");
  const needsLabelFields = collectFieldValues(node, "labels").length > 0;

  const [statuses, sprints, epics, customFields] = await Promise.all([
    statusNames.length
      ? db.qtIssueStatus.findMany({ where: { projectId: ctx.projectId, OR: insensitiveIn("name", statusNames) }, select: { id: true, name: true } })
      : Promise.resolve([]),
    sprintNames.length
      ? db.qtSprint.findMany({ where: { projectId: ctx.projectId, OR: insensitiveIn("name", sprintNames) }, select: { id: true, name: true } })
      : Promise.resolve([]),
    epicKeys.length
      ? db.qtIssue.findMany({
          where: { projectId: ctx.projectId, OR: insensitiveIn("key", epicKeys), isDeleted: false },
          select: { id: true, key: true },
        })
      : Promise.resolve([]),
    needsLabelFields ? getActiveFieldsForProject(ctx.orgId, ctx.projectId) : Promise.resolve([]),
  ]);

  // Keyed by the folded name/key so `status = "in progress"` resolves the stored
  // "In Progress" (and `epic = quiktr-12` the stored "QUIKTR-12"). Two rows that
  // differ only in case would collapse to one entry, but the DB already treats
  // those as the same search term, so either id is an equally valid answer.
  return {
    statusIdByName: new Map(statuses.map((s) => [fold(s.name), s.id] as const)),
    sprintIdByName: new Map(sprints.map((s) => [fold(s.name), s.id] as const)),
    epicIdByKey: new Map(epics.map((e) => [fold(e.key), e.id] as const)),
    labelFieldIds: customFields.filter((f) => f.type === "LABELS").map((f) => f.id),
  };
}

function resolveAssigneeOrReporter(value: string, ctx: QqlBuildContext): string {
  const lower = value.toLowerCase();
  if (lower === "me") return ctx.userId;
  if (lower === "unassigned" || lower === "none") return NULL_SENTINEL;
  if (lower.startsWith("acct:")) return value.slice("acct:".length);
  return value;
}

function resolveEqualityValue(field: string, value: string, ctx: QqlBuildContext, lookups: Lookups, pos: number): string {
  switch (field) {
    case "type": {
      const parsed = issueTypeEnum.safeParse(value.toUpperCase());
      if (!parsed.success) {
        throw new QqlParseError(`Unknown type "${value}". Valid types: ${issueTypeEnum.options.join(", ")}.`, pos);
      }
      return parsed.data;
    }
    case "priority": {
      const parsed = issuePriorityEnum.safeParse(value.toUpperCase());
      if (!parsed.success) {
        throw new QqlParseError(`Unknown priority "${value}". Valid priorities: ${issuePriorityEnum.options.join(", ")}.`, pos);
      }
      return parsed.data;
    }
    case "status": {
      const id = lookups.statusIdByName.get(fold(value));
      if (!id) throw new QqlParseError(`Unknown status "${value}".`, pos);
      return id;
    }
    case "sprint": {
      const id = lookups.sprintIdByName.get(fold(value));
      if (!id) throw new QqlParseError(`Unknown sprint "${value}".`, pos);
      return id;
    }
    case "epic": {
      const id = lookups.epicIdByKey.get(fold(value));
      if (!id) throw new QqlParseError(`Unknown epic "${value}".`, pos);
      return id;
    }
    case "assignee":
    case "reporter":
      return resolveAssigneeOrReporter(value, ctx);
    default:
      return value;
  }
}

function textWhere(value: string): WhereFragment {
  return {
    OR: [
      { title: { contains: value, mode: "insensitive" } },
      { description: { contains: value, mode: "insensitive" } },
      { key: { contains: value, mode: "insensitive" } },
    ],
  };
}

function labelsWhere(values: string[], negate: boolean, lookups: Lookups): WhereFragment {
  if (lookups.labelFieldIds.length === 0) {
    // No LABELS-type custom field configured on this project — a labels
    // filter correctly matches nothing rather than erroring (labels are an
    // optional, project-configurable custom field here, not a universal
    // column — see plan notes).
    return negate ? {} : { id: "__no_labels_field_configured__" };
  }
  const some = { fieldId: { in: lookups.labelFieldIds }, OR: values.map((v) => ({ valueJson: { array_contains: v } })) };
  return negate ? { fieldValues: { none: some } } : { fieldValues: { some } };
}

function equalityWhere(column: string, resolved: string[], negate: boolean): WhereFragment {
  const hasNull = resolved.includes(NULL_SENTINEL);
  const ids = resolved.filter((v) => v !== NULL_SENTINEL);
  let clause: WhereFragment;
  if (hasNull && ids.length) clause = { OR: [{ [column]: null }, { [column]: { in: ids } }] };
  else if (hasNull) clause = { [column]: null };
  else if (ids.length === 1) clause = { [column]: ids[0] };
  else clause = { [column]: { in: ids } };
  return negate ? { NOT: clause } : clause;
}

function buildNode(node: QqlNode, ctx: QqlBuildContext, lookups: Lookups): WhereFragment {
  if (node.kind === "and") return { AND: [buildNode(node.left, ctx, lookups), buildNode(node.right, ctx, lookups)] };
  if (node.kind === "or") return { OR: [buildNode(node.left, ctx, lookups), buildNode(node.right, ctx, lookups)] };

  const kind = FIELD_KIND[node.field];
  if (!kind) {
    throw new QqlParseError(`Unknown field "${node.field}". Valid fields: ${Object.keys(FIELD_KIND).join(", ")}.`, node.pos);
  }

  if (node.kind === "in") {
    return buildIn(node, kind, ctx, lookups);
  }
  return buildComparison(node, kind, ctx, lookups);
}

function buildIn(node: InNode, kind: FieldKind, ctx: QqlBuildContext, lookups: Lookups): WhereFragment {
  if (kind === "date" || kind === "text" || kind === "project") {
    throw new QqlParseError(`"${node.field}" does not support IN/NOT IN.`, node.pos);
  }
  if (kind === "labels") {
    return labelsWhere(node.values, node.negate, lookups);
  }
  const column = EQUALITY_COLUMN[node.field] ?? node.field;
  const resolved = node.values.map((v) => resolveEqualityValue(node.field, v, ctx, lookups, node.pos));
  return equalityWhere(column, resolved, node.negate);
}

function buildComparison(node: ComparisonNode, kind: FieldKind, ctx: QqlBuildContext, lookups: Lookups): WhereFragment {
  if (kind === "text") {
    if (node.op !== "~") throw new QqlParseError(`"text" only supports the "~" operator.`, node.pos);
    return textWhere(node.value);
  }
  if (kind === "date") {
    if (!DATE_OPS.has(node.op)) {
      throw new QqlParseError(`"${node.field}" does not support the "${node.op}" operator.`, node.pos);
    }
    const date = parseRelativeOrIsoDate(node.value);
    if (!date) {
      throw new QqlParseError(`"${node.value}" isn't a valid date — use an ISO date or a relative shorthand like "-7d".`, node.pos);
    }
    const column = node.field === "created" ? "createdAt" : "updatedAt";
    return { [column]: { [DATE_PRISMA_OP[node.op]!]: date } };
  }
  if (kind === "labels") {
    if (node.op !== "=" && node.op !== "!=") {
      throw new QqlParseError(`"labels" only supports "=", "!=", "IN", "NOT IN".`, node.pos);
    }
    return labelsWhere([node.value], node.op === "!=", lookups);
  }
  if (kind === "project") {
    if (node.op !== "=") throw new QqlParseError(`"project" only supports "=".`, node.pos);
    if (node.value !== ctx.projectId) {
      throw new QqlParseError(`Cross-project search isn't supported — "project" must be this call's own project.`, node.pos);
    }
    return { projectId: ctx.projectId };
  }
  // equality
  if (!EQUALITY_OPS.has(node.op)) {
    throw new QqlParseError(
      `"${node.field}" does not support the "${node.op}" operator — use "=", "!=", "IN", or "NOT IN".`,
      node.pos,
    );
  }
  const column = EQUALITY_COLUMN[node.field] ?? node.field;
  const resolved = resolveEqualityValue(node.field, node.value, ctx, lookups, node.pos);
  return equalityWhere(column, [resolved], node.op === "!=");
}

export async function buildQqlWhere(node: QqlNode, ctx: QqlBuildContext): Promise<WhereFragment> {
  const lookups = await resolveLookups(node, ctx);
  return buildNode(node, ctx, lookups);
}

export function buildQqlOrderBy(orderBy: QqlOrderBy): WhereFragment {
  const column = ORDER_FIELD_COLUMN[orderBy.field];
  if (!column) {
    throw new QqlParseError(
      `Cannot ORDER BY "${orderBy.field}". Sortable fields: ${Object.keys(ORDER_FIELD_COLUMN).join(", ")}.`,
      0,
    );
  }
  return { [column]: orderBy.dir.toLowerCase() };
}
