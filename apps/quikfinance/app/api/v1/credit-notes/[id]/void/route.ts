import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { reverseJournalFor } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Void a credit note — reverses its journal entry and zeroes the remaining credit. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    await prisma.$transaction(async (tx) => {
      const rows = (await tx.$queryRaw`SELECT id FROM credit_notes WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
      if (!rows.length) throw new Error("Credit note was not found.");
      await reverseJournalFor(tx, orgId, "credit_note", params.id);
      await tx.$executeRaw`UPDATE credit_notes SET status = 'void', balance = 0, journal_entry_id = NULL, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id, status: "void" });
  } catch (error) {
    return fail(400, { code: "VOID_FAILED", message: errorMessage(error) });
  }
}
