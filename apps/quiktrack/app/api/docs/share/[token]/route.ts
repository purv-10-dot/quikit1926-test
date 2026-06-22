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

interface DocRow {
  id: string;
  title: string;
  content: string;
  status: string;
  shareToken: string | null;
  shareMode: string | null;
}

async function loadByToken(token: string): Promise<DocRow | null> {
  const rows = await db.$queryRaw<DocRow[]>`
    SELECT id, title, content, status, "shareToken", "shareMode"
    FROM app_quiktrack."QtDoc"
    WHERE "shareToken" = ${token} AND "isDeleted" = false
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const doc = await loadByToken(params.token);
  // A doc reverted to draft after being shared must stop serving publicly.
  if (!doc || doc.status === "draft") {
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
  if (!doc || doc.status === "draft") {
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

  await db.$executeRaw`
    UPDATE app_quiktrack."QtDoc"
    SET title = ${nextTitle}, content = ${nextContent}, "updatedAt" = NOW()
    WHERE "shareToken" = ${params.token} AND "isDeleted" = false
  `;
  return NextResponse.json({ success: true, data: { id: doc.id } });
}
