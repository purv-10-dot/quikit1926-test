import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getPresignedGetUrl, keyBelongsToTenant } from "@/lib/s3";

/**
 * PUBLIC image proxy for shared docs. Mirrors /api/docs/asset but authorizes by
 * share code instead of session: the code must map to a live shared doc, and
 * the requested key must belong to that doc's tenant (defense-in-depth against
 * someone swapping in another tenant's key). Revoking the link makes this 404.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ success: false, error: "key required" }, { status: 400 });
  }

  // Resolve the doc's tenant by either the doc-level public link OR a
  // per-recipient external-invite token (QtDocShare.token).
  const rows = await db.$queryRaw<{ orgId: string }[]>`
    SELECT "orgId" FROM app_quiktrack."QtDoc"
    WHERE "shareToken" = ${params.token} AND "isDeleted" = false
    UNION ALL
    SELECT d."orgId" FROM app_quiktrack."QtDocShare" s
    JOIN app_quiktrack."QtDoc" d ON d.id = s."docId"
    WHERE s.token = ${params.token} AND d."isDeleted" = false
    LIMIT 1
  `;
  const doc = rows[0];
  if (!doc) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (!keyBelongsToTenant(key, doc.orgId)) {
    return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
  }

  try {
    const signed = await getPresignedGetUrl(key);
    return NextResponse.redirect(signed, {
      status: 302,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to sign URL";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
