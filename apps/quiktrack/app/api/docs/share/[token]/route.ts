import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  CANONICAL_ASSET,
  publicAsset,
  loadByToken,
  isHiddenDraft,
  loadPublicSharedDoc,
} from "@/lib/docs/public-share";

/**
 * PUBLIC doc access by share code — intentionally NO withOrgAuth. Anyone with
 * the (unguessable, revocable) code can read the doc, and edit it when the
 * doc's shareMode is "edit". Revoking the link (clearing shareToken) makes
 * these routes 404 immediately.
 *
 * Token resolution / draft-gating / asset rewriting live in
 * `@/lib/docs/public-share` so the server-rendered `/share/[token]` page and
 * this route stay in lock-step.
 */

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const doc = await loadPublicSharedDoc(params.token);
  if (!doc) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: doc });
}

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().max(2_000_000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const doc = await loadByToken(params.token);
  if (!doc || isHiddenDraft(doc)) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (doc.shareMode !== "edit") {
    return NextResponse.json(
      { success: false, error: "This link is view-only." },
      { status: 403 },
    );
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }
  const nextTitle = parsed.data.title ?? doc.title;
  // Normalise public asset URLs back to canonical before storing.
  const nextContent =
    parsed.data.content !== undefined
      ? parsed.data.content.replaceAll(publicAsset(params.token), CANONICAL_ASSET)
      : doc.content;

  // Update by doc id — the token may be a per-recipient QtDocShare.token, which
  // is NOT the doc's own shareToken, so a WHERE shareToken match would miss it.
  await db.$executeRaw`
    UPDATE app_quiktrack."QtDoc"
    SET title = ${nextTitle}, content = ${nextContent}, "updatedAt" = NOW()
    WHERE id = ${doc.id} AND "isDeleted" = false
  `;
  return NextResponse.json({ success: true, data: { id: doc.id } });
}
