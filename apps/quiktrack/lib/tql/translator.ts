/**
 * TQL AST -> Prisma where/orderBy translator.
 *
 * Native fields become direct Prisma clauses on QtIssue (mirroring the
 * per-field semantics already used in app/api/filters/[id]/route.ts, e.g.
 * reporter's OR-with-createdBy). `cf[...]` fields delegate to the existing
 * custom-field operator engine (lib/customFields/filterQuery.ts) so that
 * vocabulary — and its LABELS-type handling — isn't duplicated.
 *
 * Deliberately does NOT inject `orgId`/`isDeleted` — the caller (the API
 * route) ANDs those in itself, exactly as it does for every other filter
 * path today, so org scoping always happens in one place.
 */
import type { Prisma } from "@prisma/client";
import { issuePriorityEnum, issueTypeEnum } from "@/lib/validation/issue";
import { customFiltersToWhere, type CustomFilter } from "@/lib/customFields/filterQuery";
import type { FilterOperator } from "@/lib/customFields/registry";
import { resolveFunction, type TqlFunctionContext } from "./functions";
import { NATIVE_FIELD_ALIASES, NATIVE_FIELDS, UNSUPPORTED_FIELDS } from "./fields";
import { TqlUnsupportedFieldError, TqlUnsupportedOperatorError, TqlParseError } from "./errors";
import type {
  TqlExpr,
  TqlField,
  TqlOp,
  TqlOrderClause,
  TqlQuery,
  TqlValue,
} from "./parser";
import type { TqlPosition } from "./tokenizer";

export interface TqlCustomFieldInfo {
  /** The real QtCustomField.id — cf[...] may reference a field by name. */
  id: string;
  /** e.g. "NUMBER", "DATE", "SHORT_TEXT" — see lib/customFields/registry.ts. */
  type: string;
}

export interface TqlTranslateContext {
  userId: string;
  now?: Date;
  /**
   * Resolves a cf[...] reference (id or name) to the field's real id + type.
   * Only needed for numeric/date comparison operators (>, <, >=, <=), which
   * must know whether to compare valueNumber or valueDate. Optional so unit
   * tests that don't exercise those operators can omit it; the route always
   * supplies it in practice (see app/api/filters/[id]/route.ts).
   */
  resolveCustomField?: (ref: string) => TqlCustomFieldInfo | undefined;
}

export interface TqlTranslateResult {
  where: Prisma.QtIssueWhereInput;
  orderBy: Prisma.QtIssueOrderByWithRelationInput[];
}

const NATIVE_SORT_COLUMN: Record<string, string> = {
  created: "createdAt",
  updated: "updatedAt",
  due: "dueDate",
  startdate: "startDate",
  priority: "priority",
  key: "key",
};

function resolveValue(value: TqlValue, ctx: TqlTranslateContext, pos: TqlPosition): string {
  if (value.kind === "literal") return value.value;
  const resolved = resolveFunction(value.name, value.args, ctx as TqlFunctionContext, pos);
  if (resolved === null) {
    throw new TqlParseError(
      `${value.name}() can't be used as a plain value here`,
      pos,
    );
  }
  return resolved instanceof Date ? resolved.toISOString() : resolved;
}

function requireNative(field: TqlField, pos: TqlPosition): string {
  if (field.kind === "customField") return "__customField__";
  const canonical = NATIVE_FIELD_ALIASES[field.name];
  if (!canonical) {
    const unsupportedReason = UNSUPPORTED_FIELDS[field.name];
    if (unsupportedReason) {
      throw new TqlUnsupportedFieldError(field.name, unsupportedReason, pos);
    }
    throw new TqlParseError(
      `Unknown field "${field.name}". See Settings → TQL Documentation for the supported field list.`,
      pos,
    );
  }
  return canonical;
}

function equalityColumn(canonical: string): string | null {
  switch (canonical) {
    case "assignee":
      return "assigneeId";
    case "status":
      return "statusId";
    case "sprint":
      return "sprintId";
    case "parent":
      return "parentId";
    case "resolution":
      return "resolutionId";
    case "key":
      return "key";
    default:
      return null;
  }
}

// cf[...] may reference a field by id ("cf[123]") or by name
// ("cf[\"Customer Tier\"]"). When the caller supplies resolveCustomField
// (the route always does — see app/api/filters/[id]/route.ts), both forms
// resolve to the real QtCustomField.id, and a ref that resolves to nothing
// is a real error (not silently treated as a no-op fieldId). Without a
// resolver at all (unit tests exercising the type-free operators in
// isolation) `ref` is used as-is, which is only correct when the query
// already used the literal id.
function resolveCustomFieldId(ref: string, ctx: TqlTranslateContext, pos: TqlPosition): string {
  if (!ctx.resolveCustomField) return ref;
  const info = ctx.resolveCustomField(ref);
  if (!info) {
    throw new TqlParseError(`Unknown custom field "${ref}"`, pos);
  }
  return info.id;
}

const TYPE_FREE_OP_MAP: Partial<Record<TqlOp, FilterOperator>> = {
  "=": "equals",
  "!=": "is_not",
  "~": "contains",
};

// >, <, >=, <= need the field's real type (NUMBER vs. DATE) to pick
// valueNumber vs. valueDate (see filterQuery.ts's type-aware branches) — the
// caller resolves this via ctx.resolveCustomField since the translator has
// no DB access of its own.
const NUMERIC_DATE_OP_MAP: Partial<Record<TqlOp, FilterOperator>> = {
  ">": "gt",
  "<": "lt",
  ">=": "gte",
  "<=": "lte",
};

function customFilterFromComparison(
  ref: string,
  op: TqlOp,
  value: string,
  ctx: TqlTranslateContext,
  pos: TqlPosition,
): CustomFilter {
  const typeFree = TYPE_FREE_OP_MAP[op];
  if (typeFree) {
    return { fieldId: resolveCustomFieldId(ref, ctx, pos), type: "", op: typeFree, value };
  }

  const numericDateOp = NUMERIC_DATE_OP_MAP[op];
  if (numericDateOp) {
    const info = ctx.resolveCustomField?.(ref);
    if (!info) {
      throw new TqlParseError(`Unknown custom field "${ref}"`, pos);
    }
    if (info.type !== "NUMBER" && info.type !== "DATE") {
      throw new TqlUnsupportedOperatorError(`cf[${ref}]`, op, ["=", "!=", "~", "IN", "NOT IN", "IS EMPTY"], pos);
    }
    return { fieldId: info.id, type: info.type, op: numericDateOp, value };
  }

  throw new TqlUnsupportedOperatorError(
    `cf[${ref}]`,
    op,
    ["=", "!=", "~", ">", "<", ">=", "<=", "IN", "NOT IN", "IS EMPTY"],
    pos,
  );
}

function buildComparison(
  field: TqlField,
  op: TqlOp,
  rawValue: TqlValue,
  ctx: TqlTranslateContext,
  pos: TqlPosition,
): Prisma.QtIssueWhereInput {
  const value = resolveValue(rawValue, ctx, pos);

  if (field.kind === "customField") {
    const cf = customFilterFromComparison(field.ref, op, value, ctx, pos);
    const where = customFiltersToWhere([cf]);
    return where[0] ?? {};
  }

  const canonical = requireNative(field, pos);
  const spec = NATIVE_FIELDS[canonical]!;

  if (canonical === "assignee") {
    return { assigneeId: op === "!=" ? { not: value } : value };
  }
  if (canonical === "reporter") {
    const clause: Prisma.QtIssueWhereInput = { OR: [{ reporterId: value }, { createdBy: value }] };
    return op === "!=" ? { NOT: clause } : clause;
  }

  if (canonical === "project") {
    if (op !== "=" && op !== "!=") {
      throw new TqlUnsupportedOperatorError("project", op, ["=", "!=", "IN", "NOT IN"], pos);
    }
    return op === "!=" ? { projectId: { not: value } } : { projectId: value };
  }

  if (spec.kind === "date") {
    const dateOpMap: Record<string, string> = { "=": "equals", "!=": "not", ">": "gt", "<": "lt", ">=": "gte", "<=": "lte" };
    const prismaOp = dateOpMap[op];
    if (!prismaOp) {
      throw new TqlUnsupportedOperatorError(canonical, op, ["=", "!=", ">", "<", ">=", "<="], pos);
    }
    const column = canonical === "due" ? "dueDate" : canonical === "startdate" ? "startDate" : NATIVE_SORT_COLUMN[canonical]!;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new TqlParseError(`"${value}" isn't a valid date for "${canonical}"`, pos);
    }
    return { [column]: { [prismaOp]: date } };
  }

  if (spec.kind === "text") {
    if (op !== "~" && op !== "!~") {
      throw new TqlUnsupportedOperatorError(canonical, op, ["~", "!~"], pos);
    }
    const column = canonical === "summary" ? "title" : "description";
    const clause: Prisma.QtIssueWhereInput = { [column]: { contains: value, mode: "insensitive" } };
    return op === "!~" ? { NOT: clause } : clause;
  }

  if (spec.kind === "textSearch") {
    if (op !== "~" && op !== "!~") {
      throw new TqlUnsupportedOperatorError("text", op, ["~", "!~"], pos);
    }
    const clause: Prisma.QtIssueWhereInput = {
      OR: [
        { title: { contains: value, mode: "insensitive" } },
        { description: { contains: value, mode: "insensitive" } },
        { key: { contains: value, mode: "insensitive" } },
      ],
    };
    return op === "!~" ? { NOT: clause } : clause;
  }

  if (spec.kind === "attachment") {
    throw new TqlUnsupportedOperatorError("attachments", op, ["IS EMPTY", "IS NOT EMPTY"], pos);
  }
  if (spec.kind === "link") {
    throw new TqlUnsupportedOperatorError("workItemLink", op, ["IN", "NOT IN"], pos);
  }

  // Remaining equality-kind fields: status, priority, type, sprint, parent,
  // resolution, key.
  if (op !== "=" && op !== "!=") {
    throw new TqlUnsupportedOperatorError(canonical, op, ["=", "!=", "IN", "NOT IN"], pos);
  }
  if (canonical === "type") {
    const parsed = issueTypeEnum.safeParse(value.toUpperCase());
    if (!parsed.success) throw new TqlParseError(`Unknown type "${value}". Valid: ${issueTypeEnum.options.join(", ")}.`, pos);
    return { type: op === "!=" ? { not: parsed.data } : parsed.data };
  }
  if (canonical === "priority") {
    const parsed = issuePriorityEnum.safeParse(value.toUpperCase());
    if (!parsed.success) throw new TqlParseError(`Unknown priority "${value}". Valid: ${issuePriorityEnum.options.join(", ")}.`, pos);
    return { priority: op === "!=" ? { not: parsed.data } : parsed.data };
  }
  if (canonical === "status") {
    const clause: Prisma.QtIssueWhereInput = { status: { name: { equals: value, mode: "insensitive" } } };
    return op === "!=" ? { NOT: clause } : clause;
  }

  const column = equalityColumn(canonical);
  if (!column) {
    throw new TqlParseError(`"${canonical}" doesn't support direct comparison`, pos);
  }
  return { [column]: op === "!=" ? { not: value } : value };
}

function buildIn(
  field: TqlField,
  negate: boolean,
  values: TqlValue[],
  ctx: TqlTranslateContext,
  pos: TqlPosition,
): Prisma.QtIssueWhereInput {
  if (field.kind === "customField") {
    const resolvedValues = values.map((v) => resolveValue(v, ctx, pos));
    const cf: CustomFilter = {
      fieldId: resolveCustomFieldId(field.ref, ctx, pos),
      type: "",
      op: negate ? "not_in" : "in",
      value: resolvedValues,
    };
    return customFiltersToWhere([cf])[0] ?? {};
  }

  const canonical = requireNative(field, pos);
  const spec = NATIVE_FIELDS[canonical]!;
  if (spec.kind === "date" || spec.kind === "text" || spec.kind === "textSearch" || canonical === "project") {
    throw new TqlUnsupportedOperatorError(canonical, negate ? "NOT IN" : "IN", ["=", "!="], pos);
  }

  const resolved = values.map((v) => resolveValue(v, ctx, pos));

  if (canonical === "type") {
    const parsed = resolved.map((v) => {
      const p = issueTypeEnum.safeParse(v.toUpperCase());
      if (!p.success) throw new TqlParseError(`Unknown type "${v}". Valid: ${issueTypeEnum.options.join(", ")}.`, pos);
      return p.data;
    });
    return { type: negate ? { notIn: parsed } : { in: parsed } };
  }
  if (canonical === "priority") {
    const parsed = resolved.map((v) => {
      const p = issuePriorityEnum.safeParse(v.toUpperCase());
      if (!p.success) throw new TqlParseError(`Unknown priority "${v}". Valid: ${issuePriorityEnum.options.join(", ")}.`, pos);
      return p.data;
    });
    return { priority: negate ? { notIn: parsed } : { in: parsed } };
  }
  if (canonical === "status") {
    const clause: Prisma.QtIssueWhereInput = { status: { name: { in: resolved, mode: "insensitive" } } };
    return negate ? { NOT: clause } : clause;
  }
  if (canonical === "reporter") {
    const clause: Prisma.QtIssueWhereInput = { OR: [{ reporterId: { in: resolved } }, { createdBy: { in: resolved } }] };
    return negate ? { NOT: clause } : clause;
  }

  const column = equalityColumn(canonical) ?? canonical;
  return { [column]: negate ? { notIn: resolved } : { in: resolved } };
}

function buildEmpty(
  field: TqlField,
  negate: boolean,
  ctx: TqlTranslateContext,
  pos: TqlPosition,
): Prisma.QtIssueWhereInput {
  if (field.kind === "customField") {
    const cf: CustomFilter = {
      fieldId: resolveCustomFieldId(field.ref, ctx, pos),
      type: "",
      op: negate ? "is_not_empty" : "is_empty",
    };
    return customFiltersToWhere([cf])[0] ?? {};
  }
  const canonical = requireNative(field, pos);
  const column = equalityColumn(canonical);
  if (canonical === "due") return { dueDate: negate ? { not: null } : null };
  if (canonical === "startdate") return { startDate: negate ? { not: null } : null };
  if (canonical === "attachments") {
    return { attachments: negate ? { some: {} } : { none: {} } };
  }
  if (!column) {
    throw new TqlUnsupportedOperatorError(canonical, "IS EMPTY", ["="], pos);
  }
  return { [column]: negate ? { not: null } : null };
}

function buildExpr(expr: TqlExpr, ctx: TqlTranslateContext): Prisma.QtIssueWhereInput {
  switch (expr.kind) {
    case "and":
      return { AND: expr.clauses.map((c) => buildExpr(c, ctx)) };
    case "or":
      return { OR: expr.clauses.map((c) => buildExpr(c, ctx)) };
    case "not":
      return { NOT: buildExpr(expr.clause, ctx) };
    case "comparison":
      return buildComparison(expr.field, expr.op, expr.value, ctx, expr.pos);
    case "in":
      return buildIn(expr.field, expr.negate, expr.values, ctx, expr.pos);
    case "empty":
      return buildEmpty(expr.field, expr.negate, ctx, expr.pos);
  }
}

function buildOrderBy(clauses: TqlOrderClause[]): Prisma.QtIssueOrderByWithRelationInput[] {
  return clauses.map((c) => {
    if (c.field.kind === "customField") {
      throw new TqlParseError(`ORDER BY cf[...] isn't supported`, { pos: 0, line: 1, col: 1 });
    }
    const canonical = requireNative(c.field, { pos: 0, line: 1, col: 1 });
    const column = NATIVE_SORT_COLUMN[canonical] ?? equalityColumn(canonical);
    if (!column || !NATIVE_FIELDS[canonical]?.sortable) {
      throw new TqlParseError(
        `Cannot ORDER BY "${canonical}". Sortable fields: ${Object.values(NATIVE_FIELDS)
          .filter((f) => f.sortable)
          .map((f) => f.name)
          .join(", ")}.`,
        { pos: 0, line: 1, col: 1 },
      );
    }
    return { [column]: c.dir.toLowerCase() };
  });
}

export function translate(query: TqlQuery, ctx: TqlTranslateContext): TqlTranslateResult {
  const where = query.where ? buildExpr(query.where, ctx) : {};
  const orderBy = buildOrderBy(query.orderBy);
  return { where, orderBy };
}
