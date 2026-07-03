import { empty, join, raw, sqltag as sql, type Sql } from "@prisma/client/runtime/library";
import type { ApiContext } from "@/lib/api/auth";

export function sqlIdentifier(name: string): Sql {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return raw(`"${name}"`);
}

export function stripUndefined<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

export function buildFilterSql(
  orgScoped: boolean | undefined,
  fixedFilters: Record<string, unknown> | undefined,
  context: ApiContext,
  searchColumn?: string | null,
  search?: string | null,
  extraClauses: Sql[] = []
) {
  const clauses: Sql[] = [];

  if (orgScoped !== false) {
    clauses.push(sql`${sqlIdentifier("org_id")}::text = ${context.orgId}`);
  }

  Object.entries(fixedFilters ?? {}).forEach(([column, value]) => {
    // Cast the column to text for string values so uuid/date columns compare
    // against Prisma's text-bound parameters without an operator-type error.
    const cast = typeof value === "string" ? raw("::text") : empty;
    clauses.push(sql`${sqlIdentifier(column)}${cast} = ${value}`);
  });

  if (search && searchColumn) {
    clauses.push(sql`${sqlIdentifier(searchColumn)}::text ILIKE ${`%${search}%`}`);
  }

  clauses.push(...extraClauses);

  if (clauses.length === 0) {
    return empty;
  }

  return sql`WHERE ${join(clauses, " AND ")}`;
}

export function buildOrderBySql(orderColumn?: string) {
  const column = orderColumn ?? "created_at";
  return sql`ORDER BY ${sqlIdentifier(column)} DESC`;
}

export function buildSelectSql(select?: string) {
  return raw(select ?? "*");
}
