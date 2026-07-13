import type { NextRequest } from "next/server";
import { z } from "zod";
import { empty, join, raw, sqltag as sql, type Sql } from "@prisma/client/runtime/library";
import { errorMessage, fail, ok } from "@/lib/api/responses";
import { requireApiContext, type ApiContext } from "@/lib/api/auth";
import { assertPeriodUnlocked } from "@/lib/period-locks";
import { buildFilterSql, buildOrderBySql, buildSelectSql, sqlIdentifier, stripUndefined } from "@/lib/api/prisma-sql";
import { castSuffix } from "@/lib/db/column-casts";
import type { Database, Json } from "@/types/database.types";

type TableName = keyof Database["public"]["Tables"];
type BodyRecord = Record<string, unknown>;

export type CrudConfig<T extends TableName> = {
  table: T;
  schema: z.ZodType<unknown>;
  entity: string;
  select?: string;
  searchColumn?: string;
  orderColumn?: string;
  orgScoped?: boolean;
  fixedFilters?: Record<string, string | number | boolean>;
  prepareCreate?: (body: BodyRecord, context: ApiContext) => BodyRecord;
  prepareUpdate?: (body: BodyRecord, context: ApiContext) => BodyRecord;
  lockDateField?: string;
  lockScope?: "all" | "sales" | "purchases" | "banking" | "journals";
};

type RouteContext = {
  params: {
    id: string;
  };
};

function isRecord(value: unknown): value is BodyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  return typeof value.id === "string" ? value.id : null;
}

function readRecordField(value: unknown, field: string): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const entry = value[field];
  return typeof entry === "string" ? entry : null;
}

async function parseJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function audit(context: ApiContext, entity: string, action: string, entityId: string | null, values: Json) {
  await context.db.from("audit_logs").insert({
    org_id: context.orgId,
    user_id: context.userId,
    entity_type: entity,
    entity_id: entityId,
    action,
    new_values: values
  });
}

function createWhereSql<T extends TableName>(config: CrudConfig<T>, context: ApiContext, extraClauses: Sql[] = []) {
  return buildFilterSql(config.orgScoped, config.fixedFilters, context, config.searchColumn, undefined, extraClauses);
}

export function createCrudHandlers<T extends TableName>(config: CrudConfig<T>) {
  return {
    GET: async (request: NextRequest) => {
      const auth = await requireApiContext();
      if (!auth.ok) {
        return fail(auth.status, { code: auth.code, message: auth.message });
      }

      const page = Math.max(Number(request.nextUrl.searchParams.get("page") ?? "1"), 1);
      const perPage = Math.min(Math.max(Number(request.nextUrl.searchParams.get("per_page") ?? "25"), 1), 100);
      const from = (page - 1) * perPage;
      const search = request.nextUrl.searchParams.get("search");

      const where = buildFilterSql(config.orgScoped, config.fixedFilters, auth.context, config.searchColumn, search);
      const order = buildOrderBySql(config.orderColumn);
      const select = buildSelectSql(config.select);

      try {
        const countResult = (await auth.context.prisma.$queryRaw(
          sql`SELECT COUNT(*) AS count FROM ${sqlIdentifier(config.table)} ${where}`
        )) as { count: number | bigint | string }[];
        const count = countResult.length ? Number(countResult[0].count) : 0;

        const data = (await auth.context.prisma.$queryRaw(
          sql`SELECT ${select} FROM ${sqlIdentifier(config.table)} ${where} ${order} LIMIT ${perPage} OFFSET ${from}`
        )) as unknown[];

        return ok(data ?? [], { total: count, page, per_page: perPage });
      } catch (error) {
        return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
      }
    },
    POST: async (request: NextRequest) => {
      const auth = await requireApiContext();
      if (!auth.ok) {
        return fail(auth.status, { code: auth.code, message: auth.message });
      }

      const json = await parseJson(request);
      const parsed = config.schema.safeParse(json);
      if (!parsed.success || !isRecord(parsed.data)) {
        return fail(422, { code: "VALIDATION_FAILED", message: "The submitted data is invalid.", details: parsed.error?.flatten() });
      }

      const prepared = config.prepareCreate?.(parsed.data, auth.context) ?? parsed.data;
      if (config.lockDateField && config.lockScope) {
        const lockResponse = await assertPeriodUnlocked(auth.context, readRecordField(prepared, config.lockDateField), config.lockScope);
        if (lockResponse) {
          return lockResponse;
        }
      }

      const payload = config.orgScoped === false ? prepared : { ...prepared, org_id: auth.context.orgId };
      const sanitizedPayload = stripUndefined(payload as BodyRecord);
      const columns = Object.keys(sanitizedPayload) as string[];
      const values = Object.values(sanitizedPayload);
      const select = buildSelectSql(config.select);

      try {
        const data = (await auth.context.prisma.$queryRaw(
        sql`
            INSERT INTO ${sqlIdentifier(config.table)} (${join(columns.map((column) => sqlIdentifier(column)), ", ")})
            VALUES (${join(columns.map((column, index) => {
              const value = values[index];
              return typeof value === "string" ? sql`${value}${raw(castSuffix(config.table, column))}` : sql`${value}`;
            }), ", ")})
            RETURNING ${select}
          `
        )) as unknown[];

        await audit(auth.context, config.entity, "create", readRecordId(data[0]), sanitizedPayload as Json);
        return ok(data[0], undefined, { status: 201 });
      } catch (error) {
        return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
      }
    }
  };
}

export function createCrudItemHandlers<T extends TableName>(config: CrudConfig<T>) {
  return {
    GET: async (_request: NextRequest, { params }: RouteContext) => {
      const auth = await requireApiContext();
      if (!auth.ok) {
        return fail(auth.status, { code: auth.code, message: auth.message });
      }

      const where = createWhereSql(config, auth.context, [sql`${sqlIdentifier("id")}::text = ${params.id}`]);
      const select = buildSelectSql(config.select);

      try {
        const data = (await auth.context.prisma.$queryRaw(
          sql`SELECT ${select} FROM ${sqlIdentifier(config.table)} ${where} LIMIT 1`
        )) as unknown[];

        if (!data.length) {
          return fail(404, { code: "NOT_FOUND", message: `${config.entity} was not found.` });
        }

        return ok(data[0]);
      } catch (error) {
        return fail(404, { code: "NOT_FOUND", message: `${config.entity} was not found.` });
      }
    },
    PUT: async (request: NextRequest, { params }: RouteContext) => {
      const auth = await requireApiContext();
      if (!auth.ok) {
        return fail(auth.status, { code: auth.code, message: auth.message });
      }

      const json = await parseJson(request);
      const partialSchema = config.schema instanceof z.ZodObject ? config.schema.partial() : config.schema;
      const parsed = partialSchema.safeParse(json);
      if (!parsed.success || !isRecord(parsed.data)) {
        return fail(422, { code: "VALIDATION_FAILED", message: "The submitted data is invalid.", details: parsed.error?.flatten() });
      }

      const prepared = config.prepareUpdate?.(parsed.data, auth.context) ?? parsed.data;
      if (config.lockDateField && config.lockScope) {
        const existing = (await auth.context.prisma.$queryRaw(
          sql`SELECT ${sqlIdentifier(config.lockDateField)} FROM ${sqlIdentifier(config.table)} ${createWhereSql(config, auth.context, [sql`${sqlIdentifier("id")}::text = ${params.id}`])} LIMIT 1`
        )) as unknown[];

        if (!existing.length) {
          return fail(404, { code: "NOT_FOUND", message: `${config.entity} was not found.` });
        }

        const lockDate = readRecordField(prepared, config.lockDateField) ?? readRecordField(existing[0], config.lockDateField);
        const lockResponse = await assertPeriodUnlocked(auth.context, lockDate, config.lockScope);
        if (lockResponse) {
          return lockResponse;
        }
      }

      const payload = stripUndefined(prepared as BodyRecord);
      const columns = Object.keys(payload) as string[];
      const values = Object.values(payload);
      const setClause = join(columns.map((column) => {
        const value = values[columns.indexOf(column)];
        return typeof value === "string"
          ? sql`${sqlIdentifier(column)} = ${value}${raw(castSuffix(config.table, column))}`
          : sql`${sqlIdentifier(column)} = ${value}`;
      }), ", ");
      const select = buildSelectSql(config.select);
      const where = createWhereSql(config, auth.context, [sql`${sqlIdentifier("id")}::text = ${params.id}`]);

      try {
        const data = (await auth.context.prisma.$queryRaw(
          sql`
            UPDATE ${sqlIdentifier(config.table)}
            SET ${setClause}
            ${where}
            RETURNING ${select}
          `
        )) as unknown[];

        if (!data.length) {
          return fail(404, { code: "NOT_FOUND", message: `${config.entity} was not found.` });
        }

        await audit(auth.context, config.entity, "update", params.id, payload as Json);
        return ok(data[0]);
      } catch (error) {
        return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
      }
    },
    DELETE: async (_request: NextRequest, { params }: RouteContext) => {
      const auth = await requireApiContext();
      if (!auth.ok) {
        return fail(auth.status, { code: auth.code, message: auth.message });
      }

      if (config.lockDateField && config.lockScope) {
        const existing = (await auth.context.prisma.$queryRaw(
          sql`SELECT ${sqlIdentifier(config.lockDateField)} FROM ${sqlIdentifier(config.table)} ${createWhereSql(config, auth.context, [sql`${sqlIdentifier("id")}::text = ${params.id}`])} LIMIT 1`
        )) as unknown[];

        if (!existing.length) {
          return fail(404, { code: "NOT_FOUND", message: `${config.entity} was not found.` });
        }

        const lockResponse = await assertPeriodUnlocked(auth.context, readRecordField(existing[0], config.lockDateField), config.lockScope);
        if (lockResponse) {
          return lockResponse;
        }
      }

      try {
        await auth.context.prisma.$executeRaw(
          sql`DELETE FROM ${sqlIdentifier(config.table)} ${createWhereSql(config, auth.context, [sql`${sqlIdentifier("id")}::text = ${params.id}`])}`
        );

        await audit(auth.context, config.entity, "delete", params.id, { id: params.id });
        return ok({ id: params.id });
      } catch (error) {
        return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
      }
    }
  };
}

export function createMethodNotAllowed() {
  return fail(405, { code: "METHOD_NOT_ALLOWED", message: "This operation is not supported for the resource." });
}

export function routeError(error: unknown) {
  return fail(500, { code: "SERVER_ERROR", message: errorMessage(error) });
}
