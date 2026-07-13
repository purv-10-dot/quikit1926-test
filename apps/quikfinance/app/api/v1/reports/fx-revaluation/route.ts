import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { revalueForeignCurrency } from "@/lib/accounting/fx-revaluation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  as_of: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  // Optional rate overrides, e.g. { "USD": 83.5 } when no exchange_rates row exists.
  rates: z.record(z.coerce.number().positive()).optional()
});

/** Preview the unrealised FX gain/loss as of a date (no posting). */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  const { searchParams } = new URL(request.url);
  const asOf = searchParams.get("as_of") ?? new Date().toISOString().slice(0, 10);

  try {
    const result = await prisma.$transaction((tx) => revalueForeignCurrency(tx, orgId, userId, asOf, { post: false }));
    return ok(result);
  } catch (error) {
    return fail(400, { code: "FX_PREVIEW_FAILED", message: errorMessage(error) });
  }
}

/** Post the unrealised FX revaluation as of a date (idempotent per date). */
export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "Provide an as_of date.", details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction((tx) =>
      revalueForeignCurrency(tx, orgId, userId, parsed.data.as_of, { post: true, rates: parsed.data.rates })
    );
    return ok(result, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "FX_POST_FAILED", message: errorMessage(error) });
  }
}
