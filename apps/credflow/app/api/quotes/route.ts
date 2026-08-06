import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  createQuoteSchema,
  listQuotesQuerySchema,
} from "@/lib/services/quotes/validators";
import {
  createQuote,
  listQuotes,
} from "@/lib/services/quotes/quote-service";
import { toNumber } from "@/lib/services/quotes/decimal";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";
import { notifyQuoteCreated } from "@/lib/notifications/quote-triggers";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listQuotesQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(
        400,
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const result = await listQuotes({
      tenantId: user.tenantId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      status: parsed.data.status,
      accountId: parsed.data.accountId,
      opportunityId: parsed.data.opportunityId,
      ownerId: parsed.data.ownerId,
      q: parsed.data.q,
      trashed: parsed.data.trashed,
    });

    return ok({
      items: result.items.map((it) => ({
        ...it,
        subtotal: toNumber(it.subtotal),
        grandTotal: toNumber(it.grandTotal),
        // `accountName` already string|null from the service.
        // `sentAt` already Date|null; serialise via JSON below.
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list quotes";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes GET]", error);
    return fail(status, message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");

    const body = await req.json().catch(() => null);
    const parsed = createQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    const created = await createQuote({
      tenantId: user.tenantId,
      userId: user.userId,
      userName: user.name ?? null,
      input: parsed.data,
    });
    // Dedicated quote created notification.
    notifyQuoteCreated({
      tenantId: user.tenantId,
      quoteId: created.id,
      quoteNumber: String(created.quoteNumber ?? created.id),
      // createQuote return type exposes only {id, quoteNumber}; actor is the
      // effective owner — passing null skips owner dedup, managers still receive.
      ownerId: null,
      actorUserId: user.userId,
      actorName: user.name || user.email,
    }).catch((e) => console.error("[notifications] quote created", e));

    evaluateRulesForEvent({
      event: "created",
      entityType: "quote",
      entityId: created.id,
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      after: created as unknown as Record<string, unknown>,
      changedFields: [],
    }).catch((e) => console.error("[rules-engine] quote created", e));
    return ok(created, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes POST]", error);
    return fail(status, message);
  }
}
