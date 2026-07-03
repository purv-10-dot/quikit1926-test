import type { NextRequest } from "next/server";
import { z } from "zod";
import { join, raw, sqltag as sql } from "@prisma/client/runtime/library";
import { optionalGstinSchema, optionalPanSchema, optionalStateCodeSchema } from "@/lib/india";
import { requireApiContext, type ApiContext } from "@/lib/api/auth";
import { fail, ok } from "@/lib/api/responses";
import { sqlIdentifier, stripUndefined } from "@/lib/api/prisma-sql";

const optionalText = z.string().trim().max(2000).optional().nullable();

const companySchema = z.object({
  name: z.string().trim().min(2),
  legal_name: z.string().trim().optional().nullable(),
  tax_id: optionalGstinSchema,
  gstin: optionalGstinSchema,
  pan: optionalPanSchema,
  state_code: optionalStateCodeSchema,
  preferred_language: z.enum(["en", "hi"]).default("en"),
  communication_language: z.enum(["en", "hi"]).default("en"),
  default_upi_id: z.string().trim().max(120).optional().nullable(),
  base_currency: z.string().trim().length(3).default("INR"),
  fiscal_year_start: z.coerce.number().int().min(1).max(12).default(4),
  timezone: z.string().trim().default("Asia/Kolkata"),
  date_format: z.string().trim().max(40).optional(),
  report_basis: z.enum(["accrual", "cash"]).default("accrual"),
  // Organization profile
  logo_url: z.string().trim().max(2_000_000).optional().nullable(),
  industry: optionalText,
  country: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().email().or(z.literal("")).optional().nullable(),
  // Custom fields (serialized JSON array of { label, value })
  custom_fields: z.string().max(20000).optional().nullable(),
  // Location
  address_line: optionalText,
  street1: optionalText,
  street2: optionalText,
  city: z.string().trim().max(120).optional().nullable(),
  pin_code: z.string().trim().max(20).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  fax: z.string().trim().max(40).optional().nullable(),
  address_format: optionalText,
  website: z.string().trim().max(300).optional().nullable(),
  use_payment_address: z.coerce.boolean().optional().default(false),
  payment_address: optionalText,
  // Primary contact
  primary_contact_name: z.string().trim().max(200).optional().nullable(),
  sender_email: z.string().trim().email().or(z.literal("")).optional().nullable()
});

async function updateCompany(orgId: string, payload: Partial<z.infer<typeof companySchema>>, context: ApiContext) {
  const updatePayload = {
    ...payload,
    tax_id: payload.gstin ?? payload.tax_id ?? undefined
  };
  const sanitizedPayload = stripUndefined(updatePayload);
  const columns = Object.keys(sanitizedPayload) as string[];
  const values = Object.values(sanitizedPayload);
  const setClause = join(
    columns.map((column, index) => sql`${sqlIdentifier(column)} = ${values[index]}`),
    ", "
  );

  const query = sql`
    UPDATE ${sqlIdentifier("organizations")}
    SET ${setClause}
    WHERE ${sqlIdentifier("id")}::text = ${orgId}
    RETURNING *
  `;

  const [data] = (await context.prisma.$queryRaw(query)) as unknown[];
  return data;
}

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const [data] = (await auth.context.prisma.$queryRaw(
    sql`
      SELECT *
      FROM ${sqlIdentifier("organizations")}
      WHERE ${sqlIdentifier("id")}::text = ${auth.context.orgId}
      LIMIT 1
    `
  )) as unknown[];

  if (!data) {
    return fail(404, { code: "NOT_FOUND", message: "Company profile was not found." });
  }

  return ok(data);
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const parsed = companySchema.safeParse(await request.json());
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The company profile is invalid.", details: parsed.error.flatten() });
  }

  const data = await updateCompany(auth.context.orgId, parsed.data, auth.context);
  return ok(data);
}

export const POST = PUT;

export async function PATCH(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const parsed = companySchema.partial().safeParse(await request.json());
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The company profile patch is invalid.", details: parsed.error.flatten() });
  }

  const data = await updateCompany(auth.context.orgId, parsed.data, auth.context);
  return ok(data);
}
