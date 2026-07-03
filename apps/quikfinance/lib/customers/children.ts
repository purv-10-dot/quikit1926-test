import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { Prisma } from "@prisma/client";
import { encryptField, decryptField, maskAccountNumber } from "@/lib/crypto";
import { contactPersonSchema, bankAccountSchema, contactDocumentSchema, customerAddressSchema } from "@/lib/validations/customer.schema";

/**
 * Generic nested-collection CRUD for customer children
 * (contact_persons, contact_bank_accounts, contact_documents, contact_addresses).
 * Each route file delegates here, passing its table + column mapping.
 */

type ChildKind = "persons" | "banks" | "documents" | "addresses";

const TABLE: Record<ChildKind, string> = {
  persons: "contact_persons",
  banks: "contact_bank_accounts",
  documents: "contact_documents",
  addresses: "contact_addresses"
};

const addressApiSchema = customerAddressSchema.and(
  z.object({ address_type: z.enum(["billing", "shipping", "other"]).default("other"), is_primary: z.boolean().default(false) })
);

function buildInsert(kind: ChildKind, orgId: string, contactId: string, userId: string | null, data: Record<string, unknown>): Prisma.Sql {
  switch (kind) {
    case "persons": {
      const d = data as z.infer<typeof contactPersonSchema>;
      return Prisma.sql`
        INSERT INTO contact_persons (org_id, contact_id, name, designation, department, email, mobile, whatsapp, is_primary, is_decision_maker)
        VALUES (${orgId}::uuid, ${contactId}::uuid, ${d.name}, ${d.designation ?? null}, ${d.department ?? null}, ${d.email ?? null}, ${d.mobile ?? null}, ${d.whatsapp ?? null}, ${d.is_primary}, ${d.is_decision_maker})
        RETURNING *`;
    }
    case "banks": {
      const d = data as z.infer<typeof bankAccountSchema>;
      return Prisma.sql`
        INSERT INTO contact_bank_accounts (org_id, contact_id, account_holder_name, bank_name, account_number_enc, ifsc, branch, swift_code, upi_id)
        VALUES (${orgId}::uuid, ${contactId}::uuid, ${d.account_holder_name ?? null}, ${d.bank_name ?? null}, ${encryptField(d.account_number)}, ${d.ifsc ?? null}, ${d.branch ?? null}, ${d.swift_code ?? null}, ${d.upi_id ?? null})
        RETURNING *`;
    }
    case "documents": {
      const d = data as z.infer<typeof contactDocumentSchema>;
      return Prisma.sql`
        INSERT INTO contact_documents (org_id, contact_id, doc_type, file_name, storage_url, mime_type, size_bytes, uploaded_by)
        VALUES (${orgId}::uuid, ${contactId}::uuid, ${d.doc_type}, ${d.file_name}, ${d.storage_url ?? null}, ${d.mime_type ?? null}, ${d.size_bytes}, ${userId ? userId : null}::uuid)
        RETURNING *`;
    }
    case "addresses": {
      const d = data as z.infer<typeof addressApiSchema>;
      return Prisma.sql`
        INSERT INTO contact_addresses (org_id, contact_id, address_type, line1, line2, city, state, country, postal_code, landmark, is_primary)
        VALUES (${orgId}::uuid, ${contactId}::uuid, ${d.address_type}, ${d.line1 ?? null}, ${d.line2 ?? null}, ${d.city ?? null}, ${d.state ?? null}, ${d.country ?? null}, ${d.postal_code ?? null}, ${d.landmark ?? null}, ${d.is_primary})
        RETURNING *`;
    }
  }
}

const SCHEMA = {
  persons: contactPersonSchema,
  banks: bankAccountSchema,
  documents: contactDocumentSchema,
  addresses: addressApiSchema
} as const;

export async function listChildren(kind: ChildKind, contactId: string) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT * FROM ${TABLE[kind]} WHERE org_id = $1::uuid AND contact_id = $2::uuid ORDER BY created_at ASC`,
      orgId,
      contactId
    )) as Array<Record<string, unknown>>;
    const safe =
      kind === "banks"
        ? rows.map((r) => ({ ...r, account_number_masked: maskAccountNumber(decryptField(r.account_number_enc as string | null)), account_number_enc: undefined }))
        : rows;
    return ok(safe);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function addChild(kind: ChildKind, contactId: string, request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = SCHEMA[kind].safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The record is invalid.", details: parsed.error.flatten() });
  }

  try {
    // Ensure the parent belongs to the org.
    const parent = (await prisma.$queryRaw`SELECT id FROM contacts WHERE id = ${contactId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!parent.length) return fail(404, { code: "NOT_FOUND", message: "Customer was not found." });

    const rows = (await prisma.$queryRaw(buildInsert(kind, orgId, contactId, userId, parsed.data as Record<string, unknown>))) as Array<Record<string, unknown>>;
    const row = rows[0];
    const safe = kind === "banks" && row ? { ...row, account_number_masked: maskAccountNumber(decryptField(row.account_number_enc as string | null)), account_number_enc: undefined } : row;
    return ok(safe, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}

export async function deleteChild(kind: ChildKind, contactId: string, childId: string) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${TABLE[kind]} WHERE id = $1::uuid AND contact_id = $2::uuid AND org_id = $3::uuid`,
      childId,
      contactId,
      orgId
    );
    return ok({ id: childId });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
