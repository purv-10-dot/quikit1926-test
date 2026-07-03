/**
 * Prisma-backed query builder.
 *
 * This is a small, faithful re-implementation of the subset of the Supabase
 * PostgREST query-builder API that this codebase actually uses, executed
 * entirely through Prisma raw SQL (`$queryRawUnsafe` / `$executeRawUnsafe`).
 *
 * It returns the same `{ data, count, error }` shape Supabase returned and is
 * thenable, so existing call sites that do
 *   `const { data, error } = await db.from("x").select("...").eq("a", 1)`
 * keep working without change.
 *
 * NOT supported (intentionally): PostgREST "embedded resource" selects such as
 * `select("*, contacts!contact_id(...)")`. Those routes use explicit raw SQL
 * instead. Passing an embedded select here throws so it is caught immediately
 * rather than silently producing wrong SQL.
 */
import { Prisma } from "@prisma/client";
import { castSuffix } from "@/lib/db/column-casts";

type Row = Record<string, unknown>;

// `data` is typed as an array intersected with a string-index record. This
// mirrors the loose typing the Supabase client gave call sites: array helpers
// (`.map`/`.filter`/`.reduce`) get `any` callback params (no implicit-any
// errors), while single-row access (`data.id`) is also permitted.
export type QueryData = any[] & Record<string, any>;

export type DbResult<T = QueryData> = {
  data: T;
  count: number | null;
  error: { message: string } | null;
};

export interface RawExecutor {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Drop keys whose value is `undefined`, matching Supabase payload behaviour. */
function stripUndefined(row: Row): Row {
  const out: Row = {};
  for (const key of Object.keys(row)) {
    if (row[key] !== undefined) {
      out[key] = row[key];
    }
  }
  return out;
}

function quoteIdent(name: string): string {
  const trimmed = name.trim();
  if (!IDENT.test(trimmed)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${trimmed}"`;
}

/** Validate/normalise a flat select column list (no embeds — used for RETURNING). */
function normaliseSelect(select: string): string {
  if (select.includes("(") || select.includes(")")) {
    throw new Error(
      `Embedded-resource selects are not supported here: "${select}". Use explicit raw SQL.`
    );
  }
  if (select.trim() === "*") {
    return "*";
  }
  return select
    .split(",")
    .map((col) => {
      const trimmed = col.trim();
      // allow "table.col" qualified names too
      return trimmed
        .split(".")
        .map((part) => quoteIdent(part))
        .join(".");
    })
    .join(", ");
}

// ---- PostgREST embedded-resource select support -----------------------
// Translates `select("*, contacts!contact_id(id, display_name), lines(...)")`
// into correlated JSON subqueries so the result keeps the same nested shape
// Supabase returned. Both to-one (`table!fk(...)`) and to-many (`table(...)`)
// embeds are supported, including nesting. `!inner` hints are not (those few
// routes use explicit raw SQL).

type SelectNode =
  | { kind: "col"; name: string }
  | { kind: "embed"; alias: string; table: string; fk: string | null; toMany: boolean; children: SelectNode[] };

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") {
      depth += 1;
      current += ch;
    } else if (ch === ")") {
      depth -= 1;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    parts.push(current);
  }
  return parts;
}

function singularize(table: string): string {
  if (table.endsWith("ies")) {
    return `${table.slice(0, -3)}y`;
  }
  if (table.endsWith("s")) {
    return table.slice(0, -1);
  }
  return table;
}

function parseSelectNodes(select: string): SelectNode[] {
  return splitTopLevel(select).map((raw) => {
    const token = raw.trim();
    const parenIdx = token.indexOf("(");
    if (parenIdx === -1) {
      return { kind: "col", name: token };
    }
    const header = token.slice(0, parenIdx).trim();
    const inner = token.slice(parenIdx + 1, token.lastIndexOf(")"));

    let alias = "";
    let spec = header;
    const colonIdx = header.indexOf(":");
    if (colonIdx !== -1) {
      alias = header.slice(0, colonIdx).trim();
      spec = header.slice(colonIdx + 1).trim();
    }

    let table = spec;
    let fk: string | null = null;
    const bangIdx = spec.indexOf("!");
    if (bangIdx !== -1) {
      table = spec.slice(0, bangIdx).trim();
      fk = spec.slice(bangIdx + 1).trim();
    }
    if (fk === "inner") {
      throw new Error(`"!inner" embedded selects are not supported by the query builder: "${select}". Use explicit raw SQL.`);
    }

    return {
      kind: "embed",
      alias: alias || table,
      table,
      fk,
      toMany: fk === null,
      children: parseSelectNodes(inner)
    };
  });
}

const counterRef = () => ({ value: 0 });

function buildEmbedExpression(
  node: Extract<SelectNode, { kind: "embed" }>,
  parentTable: string,
  parentAlias: string,
  counter: { value: number }
): string {
  const childAlias = `_e${counter.value++}`;
  const objectArgs = node.children
    .map((child) => {
      if (child.kind === "col") {
        return `'${child.name}', ${childAlias}.${quoteIdent(child.name)}`;
      }
      return `'${child.alias}', ${buildEmbedExpression(child, node.table, childAlias, counter)}`;
    })
    .join(", ");
  const jsonObject = `json_build_object(${objectArgs})`;

  if (node.toMany) {
    const childFk = quoteIdent(`${singularize(parentTable)}_id`);
    return `(SELECT COALESCE(json_agg(${jsonObject}), '[]'::json) FROM ${quoteIdent(node.table)} ${childAlias} WHERE ${childAlias}.${childFk} = ${parentAlias}."id")`;
  }

  return `(SELECT ${jsonObject} FROM ${quoteIdent(node.table)} ${childAlias} WHERE ${childAlias}."id" = ${parentAlias}.${quoteIdent(node.fk as string)})`;
}

function buildSelectColumns(select: string, baseTable: string): string {
  if (!select.includes("(")) {
    return normaliseSelect(select);
  }
  const counter = counterRef();
  const parentAlias = quoteIdent(baseTable);
  return parseSelectNodes(select)
    .map((node) => {
      if (node.kind === "col") {
        return node.name === "*" ? "*" : quoteIdent(node.name);
      }
      return `${buildEmbedExpression(node, baseTable, parentAlias, counter)} AS ${quoteIdent(node.alias)}`;
    })
    .join(", ");
}

/** Convert Prisma scalar runtime types back to the JSON-ish shapes Supabase returned. */
function normaliseValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function normaliseRow(row: Row): Row {
  const out: Row = {};
  for (const key of Object.keys(row)) {
    out[key] = normaliseValue(row[key]);
  }
  return out;
}

type FilterOp = "=" | "<>" | ">" | ">=" | "<" | "<=" | "ILIKE" | "LIKE" | "IS" | "IN";
type Filter = { column: string; op: FilterOp; value: unknown };
type NotFilter = { column: string; operator: string; value: unknown };
type OrderBy = { column: string; ascending: boolean; nullsFirst?: boolean };
type Mode = "select" | "insert" | "update" | "delete" | "upsert";

class ParamList {
  readonly values: unknown[] = [];
  /** Register a value, returning its `$n` placeholder (with ::jsonb cast for objects). */
  push(value: unknown): string {
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      this.values.push(JSON.stringify(value));
      return `$${this.values.length}::jsonb`;
    }
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export class QueryBuilder<T = QueryData> implements PromiseLike<DbResult<T>> {
  private mode: Mode = "select";
  private selectColumns = "*";
  private wantCount = false;
  private filters: Filter[] = [];
  private notFilters: NotFilter[] = [];
  private orFilters: string[] = [];
  private orderBys: OrderBy[] = [];
  private limitValue: number | null = null;
  private offsetValue = 0;
  private singleMode: "single" | "maybe" | null = null;
  private writeRows: Row[] = [];
  private updateValues: Row = {};
  private returning = false;
  private conflictTarget: string | null = null;

  constructor(
    private readonly executor: RawExecutor,
    private readonly table: string
  ) {}

  // ---- column selection -------------------------------------------------
  select(columns = "*", opts?: { count?: "exact" | "planned" | "estimated" }): this {
    if (this.mode === "select" || this.mode === "insert" || this.mode === "update" || this.mode === "upsert") {
      this.selectColumns = columns;
    }
    if (this.mode !== "select") {
      // .insert(...).select() / .update(...).select() => RETURNING
      this.returning = true;
    }
    if (opts?.count) {
      this.wantCount = true;
    }
    return this;
  }

  // ---- writes -----------------------------------------------------------
  insert(rows: Row | Row[]): this {
    this.mode = "insert";
    this.writeRows = (Array.isArray(rows) ? rows : [rows]).map(stripUndefined);
    return this;
  }

  update(values: Row): this {
    this.mode = "update";
    this.updateValues = stripUndefined(values);
    return this;
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.mode = "upsert";
    this.writeRows = (Array.isArray(rows) ? rows : [rows]).map(stripUndefined);
    this.conflictTarget = opts?.onConflict ?? null;
    return this;
  }

  delete(): this {
    this.mode = "delete";
    return this;
  }

  // ---- filters ----------------------------------------------------------
  private addFilter(column: string, op: FilterOp, value: unknown): this {
    this.filters.push({ column, op, value });
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.addFilter(column, "=", value);
  }
  neq(column: string, value: unknown): this {
    return this.addFilter(column, "<>", value);
  }
  gt(column: string, value: unknown): this {
    return this.addFilter(column, ">", value);
  }
  gte(column: string, value: unknown): this {
    return this.addFilter(column, ">=", value);
  }
  lt(column: string, value: unknown): this {
    return this.addFilter(column, "<", value);
  }
  lte(column: string, value: unknown): this {
    return this.addFilter(column, "<=", value);
  }
  like(column: string, value: string): this {
    return this.addFilter(column, "LIKE", value);
  }
  ilike(column: string, value: string): this {
    return this.addFilter(column, "ILIKE", value);
  }
  is(column: string, value: null | boolean): this {
    return this.addFilter(column, "IS", value);
  }
  in(column: string, values: unknown[]): this {
    return this.addFilter(column, "IN", values);
  }

  /** PostgREST `.not(column, operator, value)`, e.g. `.not("status", "in", '("a","b")')`. */
  not(column: string, operator: string, value: unknown): this {
    this.notFilters.push({ column, operator, value });
    return this;
  }

  /** PostgREST-style `.or("a.eq.1,b.gt.2")`. */
  or(filterString: string): this {
    this.orFilters.push(filterString);
    return this;
  }

  // ---- ordering / pagination -------------------------------------------
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderBys.push({
      column,
      ascending: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst
    });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  single(): this {
    this.singleMode = "single";
    if (this.mode !== "select") this.returning = true;
    return this;
  }

  maybeSingle(): this {
    this.singleMode = "maybe";
    if (this.mode !== "select") this.returning = true;
    return this;
  }

  // ---- SQL construction -------------------------------------------------
  private buildWhere(params: ParamList): string {
    const clauses: string[] = [];

    // Prisma binds string params as `text`; Postgres won't implicitly compare a
    // `uuid`/`date` column to `text`. Casting the column to `::text` when the
    // value is a string makes the comparison work uniformly (ISO date strings
    // compare correctly lexicographically). Numeric/boolean params stay native.
    const castCol = (col: string, value: unknown) => (typeof value === "string" ? `${col}::text` : col);

    for (const filter of this.filters) {
      const col = filter.column
        .split(".")
        .map((part) => quoteIdent(part))
        .join(".");
      if (filter.op === "IN") {
        const list = (filter.value as unknown[]) ?? [];
        if (list.length === 0) {
          clauses.push("false");
          continue;
        }
        const anyString = list.some((value) => typeof value === "string");
        const placeholders = list.map((value) => params.push(value)).join(", ");
        clauses.push(`${anyString ? `${col}::text` : col} IN (${placeholders})`);
      } else if (filter.op === "IS") {
        clauses.push(`${col} IS ${filter.value === null ? "NULL" : filter.value ? "TRUE" : "FALSE"}`);
      } else {
        clauses.push(`${castCol(col, filter.value)} ${filter.op} ${params.push(filter.value)}`);
      }
    }

    for (const notFilter of this.notFilters) {
      const col = quoteIdent(notFilter.column);
      const operator = notFilter.operator.toLowerCase();
      if (operator === "in") {
        const raw = String(notFilter.value).trim().replace(/^\(/, "").replace(/\)$/, "");
        const items = raw
          .split(",")
          .map((item) => item.trim().replace(/^["']/, "").replace(/["']$/, ""))
          .filter((item) => item.length > 0);
        if (items.length === 0) {
          continue;
        }
        const placeholders = items.map((item) => params.push(item)).join(", ");
        clauses.push(`${col}::text NOT IN (${placeholders})`);
      } else if (operator === "is") {
        const value = notFilter.value;
        clauses.push(`${col} IS NOT ${value === null ? "NULL" : value ? "TRUE" : "FALSE"}`);
      } else {
        const opMap: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE" };
        const sqlOp = opMap[operator] ?? "=";
        clauses.push(`NOT (${castCol(col, notFilter.value)} ${sqlOp} ${params.push(notFilter.value)})`);
      }
    }

    for (const orString of this.orFilters) {
      const parts = orString.split(",").map((segment) => {
        const [column, op, ...rest] = segment.split(".");
        const raw = rest.join(".");
        const col = `${quoteIdent(column)}::text`;
        switch (op) {
          case "eq":
            return `${col} = ${params.push(raw)}`;
          case "neq":
            return `${col} <> ${params.push(raw)}`;
          case "gt":
            return `${col} > ${params.push(raw)}`;
          case "gte":
            return `${col} >= ${params.push(raw)}`;
          case "lt":
            return `${col} < ${params.push(raw)}`;
          case "lte":
            return `${col} <= ${params.push(raw)}`;
          case "like":
            return `${col} LIKE ${params.push(raw.replace(/\*/g, "%"))}`;
          case "ilike":
            return `${col} ILIKE ${params.push(raw.replace(/\*/g, "%"))}`;
          case "is":
            return `${quoteIdent(column)} IS ${raw === "null" ? "NULL" : raw.toUpperCase()}`;
          default:
            throw new Error(`Unsupported .or() operator: ${op}`);
        }
      });
      clauses.push(`(${parts.join(" OR ")})`);
    }

    return clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  }

  private buildOrderLimit(): string {
    let sql = "";
    if (this.orderBys.length) {
      const parts = this.orderBys.map((order) => {
        const direction = order.ascending ? "ASC" : "DESC";
        const nulls =
          order.nullsFirst === undefined ? "" : order.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
        return `${quoteIdent(order.column)} ${direction}${nulls}`;
      });
      sql += ` ORDER BY ${parts.join(", ")}`;
    }
    if (this.limitValue !== null) {
      sql += ` LIMIT ${Math.max(0, Math.trunc(this.limitValue))}`;
    }
    if (this.offsetValue) {
      sql += ` OFFSET ${Math.max(0, Math.trunc(this.offsetValue))}`;
    }
    return sql;
  }

  private buildSelectSql(params: ParamList): string {
    const cols = buildSelectColumns(this.selectColumns, this.table);
    return `SELECT ${cols} FROM ${quoteIdent(this.table)}${this.buildWhere(params)}${this.buildOrderLimit()}`;
  }

  private buildCountSql(params: ParamList): string {
    return `SELECT COUNT(*)::bigint AS count FROM ${quoteIdent(this.table)}${this.buildWhere(params)}`;
  }

  private buildInsertSql(params: ParamList): string {
    const columns = Array.from(
      this.writeRows.reduce<Set<string>>((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set())
    );
    const colSql = columns.map((column) => quoteIdent(column)).join(", ");
    const valuesSql = this.writeRows
      .map(
        (row) =>
          `(${columns
            .map((column) => {
              const value = row[column] ?? null;
              const placeholder = params.push(value);
              return typeof value === "string" ? placeholder + castSuffix(this.table, column) : placeholder;
            })
            .join(", ")})`
      )
      .join(", ");
    let sql = `INSERT INTO ${quoteIdent(this.table)} (${colSql}) VALUES ${valuesSql}`;
    if (this.mode === "upsert") {
      if (this.conflictTarget) {
        const target = this.conflictTarget
          .split(",")
          .map((column) => quoteIdent(column))
          .join(", ");
        const updates = columns
          .filter((column) => !this.conflictTarget!.split(",").map((c) => c.trim()).includes(column))
          .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
          .join(", ");
        sql += updates
          ? ` ON CONFLICT (${target}) DO UPDATE SET ${updates}`
          : ` ON CONFLICT (${target}) DO NOTHING`;
      } else {
        sql += " ON CONFLICT DO NOTHING";
      }
    }
    if (this.returning) {
      sql += ` RETURNING ${normaliseSelect(this.selectColumns)}`;
    }
    return sql;
  }

  private buildUpdateSql(params: ParamList): string {
    const columns = Object.keys(this.updateValues);
    const setSql = columns
      .map((column) => {
        const value = this.updateValues[column] ?? null;
        const placeholder = params.push(value);
        const cast = typeof value === "string" ? castSuffix(this.table, column) : "";
        return `${quoteIdent(column)} = ${placeholder}${cast}`;
      })
      .join(", ");
    let sql = `UPDATE ${quoteIdent(this.table)} SET ${setSql}${this.buildWhere(params)}`;
    if (this.returning) {
      sql += ` RETURNING ${normaliseSelect(this.selectColumns)}`;
    }
    return sql;
  }

  private buildDeleteSql(params: ParamList): string {
    let sql = `DELETE FROM ${quoteIdent(this.table)}${this.buildWhere(params)}`;
    if (this.returning) {
      sql += ` RETURNING ${normaliseSelect(this.selectColumns)}`;
    }
    return sql;
  }

  /** Build the SQL string + ordered params (exposed for offline testing). */
  toSql(): { sql: string; params: unknown[]; countSql?: string } {
    const params = new ParamList();
    switch (this.mode) {
      case "select": {
        const sql = this.buildSelectSql(params);
        const out: { sql: string; params: unknown[]; countSql?: string } = { sql, params: params.values };
        if (this.wantCount) {
          out.countSql = this.buildCountSql(new ParamList());
        }
        return out;
      }
      case "insert":
      case "upsert":
        return { sql: this.buildInsertSql(params), params: params.values };
      case "update":
        return { sql: this.buildUpdateSql(params), params: params.values };
      case "delete":
        return { sql: this.buildDeleteSql(params), params: params.values };
    }
  }

  private finalize(rows: Row[], count: number | null): DbResult<T> {
    const normalised = rows.map(normaliseRow);
    if (this.singleMode === "single") {
      if (normalised.length === 0) {
        return { data: null as unknown as T, count, error: { message: "No rows found" } };
      }
      return { data: normalised[0] as unknown as T, count, error: null };
    }
    if (this.singleMode === "maybe") {
      return { data: (normalised[0] ?? null) as unknown as T, count, error: null };
    }
    return { data: normalised as unknown as T, count, error: null };
  }

  private async run(): Promise<DbResult<T>> {
    try {
      const params = new ParamList();
      let rows: Row[] = [];
      let count: number | null = null;

      if (this.mode === "select") {
        const sql = this.buildSelectSql(params);
        rows = (await this.executor.$queryRawUnsafe<Row[]>(sql, ...params.values)) ?? [];
        if (this.wantCount) {
          const countParams = new ParamList();
          const countSql = this.buildCountSql(countParams);
          const countRows = (await this.executor.$queryRawUnsafe<{ count: bigint | number }[]>(
            countSql,
            ...countParams.values
          )) ?? [];
          count = countRows.length ? Number(countRows[0].count) : 0;
        }
      } else if (this.mode === "insert" || this.mode === "upsert") {
        const sql = this.buildInsertSql(params);
        if (this.returning) {
          rows = (await this.executor.$queryRawUnsafe<Row[]>(sql, ...params.values)) ?? [];
        } else {
          await this.executor.$executeRawUnsafe(sql, ...params.values);
        }
      } else if (this.mode === "update") {
        const sql = this.buildUpdateSql(params);
        if (this.returning) {
          rows = (await this.executor.$queryRawUnsafe<Row[]>(sql, ...params.values)) ?? [];
        } else {
          await this.executor.$executeRawUnsafe(sql, ...params.values);
        }
      } else {
        const sql = this.buildDeleteSql(params);
        if (this.returning) {
          rows = (await this.executor.$queryRawUnsafe<Row[]>(sql, ...params.values)) ?? [];
        } else {
          await this.executor.$executeRawUnsafe(sql, ...params.values);
        }
      }

      return this.finalize(rows, count);
    } catch (error) {
      return {
        data: (this.singleMode ? null : []) as unknown as T,
        count: null,
        error: { message: error instanceof Error ? error.message : "Database error" }
      };
    }
  }

  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export class DbClient {
  constructor(private readonly executor: RawExecutor) {}

  from<T = QueryData>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(this.executor, table);
  }
}

export function createDbClient(executor: RawExecutor): DbClient {
  return new DbClient(executor);
}
