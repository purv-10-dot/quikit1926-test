import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { taxonomyCreateSchema } from "@/lib/services/quotes/validators";
import { createTaxonomy, listTaxonomy } from "@/lib/services/products/taxonomy";
import type { CrmProductTaxonomyKind } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const sp = new URL(req.url).searchParams;
    const kind = sp.get("kind") as CrmProductTaxonomyKind | null;
    const parentId = sp.get("parentId");
    const items = await listTaxonomy(
      user.orgId,
      kind ?? undefined,
      parentId === "" ? null : parentId ?? undefined,
    );
    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list taxonomy";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");
    const parsed = taxonomyCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid taxonomy" }, { status: 400 });
    }
    const created = await createTaxonomy(user.orgId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create taxonomy";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
