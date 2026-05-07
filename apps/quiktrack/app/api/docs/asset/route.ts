import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getPresignedGetUrl, keyBelongsToTenant } from "@/lib/s3";

/**
 * GET /api/docs/asset?key=tenants/{orgId}/...
 *
 * Resolves a stored S3 key into a short-lived presigned GET URL and 302s
 * the browser there. Saving this proxy URL inside doc HTML means image
 * src attributes never go stale — every render mints a fresh signature.
 *
 * Tenant isolation is enforced two ways:
 *   1. The caller must be authenticated and have a orgId.
 *   2. The key prefix must match the caller's tenant (defense-in-depth
 *      against a user pasting another tenant's key into a doc).
 */
export const GET = withOrgAuth(async (ctx, req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ success: false, error: "key required" }, { status: 400 });
  }
  if (!keyBelongsToTenant(key, ctx.orgId)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const signed = await getPresignedGetUrl(key);
    // 302 so the browser follows to the freshly signed S3 URL, but
    // `no-store` so the redirect itself is never cached. If the browser
    // cached the redirect, it could keep pointing at a presigned URL that
    // expired between the cache hit and the next image render — that was
    // breaking image loads on doc reopen. The redirect target (S3) has its
    // own caching headers; this only stops caching of the indirection.
    return NextResponse.redirect(signed, {
      status: 302,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to sign URL";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
