import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * PUBLIC doc access by share code — intentionally NO withOrgAuth. Anyone with
 * the (unguessable, revocable) code can read the doc, and edit it when the
 * doc's shareMode is "edit". Revoking the link (clearing shareToken) makes
 * these routes 404 immediately.
 *
 * Image srcs are stored canonically as `/api/docs/asset?key=…` (auth-gated).
 * On read we rewrite them to the public token-scoped proxy so they load
 * without a session; on write we normalise them back so stored HTML stays
 * canonical and keeps working after the link is revoked.
 */

const CANONICAL_ASSET = "/api/docs/asset?key=";
const publicAsset = (token: string) => `/api/docs/share/${token}/asset?key=`;

interface RawDoc {
  id: string;
  title: string;
  content: string;
  status: string;
  shareToken: string | null;
  shareMode: string | null;
}
interface DocRow extends RawDoc {
  /** True when reached via an intentional per-recipient share token
   *  (QtDocShare.token), vs the doc-level "anyone with the link" token
   *  (QtDoc.shareToken). Per-recipient tokens may open drafts; the public
   *  "anyone" token may not. */
  perRecipient: boolean;
}

async function loadByToken(token: string): Promise<DocRow | null> {
  // 1. Doc-level public link ("Anyone with the link").
  const docRows = await db.$queryRaw<RawDoc[]>`
    SELECT id, title, content, status, "shareToken", "shareMode"
    FROM app_quiktrack."QtDoc"
    WHERE "shareToken" = ${token} AND "isDeleted" = false
    LIMIT 1
  `;
  if (docRows[0]) return { ...docRows[0], perRecipient: false };

  // 2. Per-recipient share (QtDocShare.token) — edit when the share role is
  //    editor, else view. (External email invites are stored as viewer, so they
  //    stay view-only.)
  const shareRows = await db.$queryRaw<RawDoc[]>`
    SELECT d.id, d.title, d.content, d.status,
           ${token} AS "shareToken",
           CASE WHEN s.role = 'editor' THEN 'edit' ELSE 'view' END AS "shareMode"
    FROM app_quiktrack."QtDocShare" s
    JOIN app_quiktrack."QtDoc" d ON d.id = s."docId"
    WHERE s.token = ${token} AND d."isDeleted" = false
    LIMIT 1
  `;
  return shareRows[0] ? { ...shareRows[0], perRecipient: true } : null;
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const doc = await loadByToken(params.token);
  if (!doc) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  // The doc-level "anyone with the link" token must NOT expose a draft. An
  // intentional per-recipient share token MAY open a draft — the owner shared
  // that specific draft with that person on purpose.
  if (doc.status === "draft" && !doc.perRecipient) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: {
      id: doc.id,
      title: doc.title,
      content: doc.content.replaceAll(CANONICAL_ASSET, publicAsset(params.token)),
      shareMode: doc.shareMode ?? "view",
    },
  });
}

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().max(2_000_000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const doc = await loadByToken(params.token);
  if (!doc) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (doc.status === "draft" && !doc.perRecipient) {
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
