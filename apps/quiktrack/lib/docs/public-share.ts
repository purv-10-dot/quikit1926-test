import "server-only";
import { db } from "@/lib/db";

/**
 * Server-side loader for publicly-shared docs (the `/share/[token]` links and
 * the public API route). Kept in one place so the page (server-render) and the
 * API route agree on token resolution, draft-gating, and asset rewriting.
 *
 * Image srcs are stored canonically as `/api/docs/asset?key=…` (auth-gated).
 * On read we rewrite them to the public token-scoped proxy so they load without
 * a session; callers writing back must normalise them via {@link CANONICAL_ASSET}.
 */

export const CANONICAL_ASSET = "/api/docs/asset?key=";
export const publicAsset = (token: string) => `/api/docs/share/${token}/asset?key=`;

interface RawDoc {
  id: string;
  title: string;
  content: string;
  status: string;
  shareToken: string | null;
  shareMode: string | null;
}

export interface DocRow extends RawDoc {
  /** True when reached via an intentional per-recipient share token
   *  (QtDocShare.token), vs the doc-level "anyone with the link" token
   *  (QtDoc.shareToken). Per-recipient tokens may open drafts; the public
   *  "anyone" token may not. */
  perRecipient: boolean;
}

/** Public shape handed to the renderer — no status/token internals leak out. */
export interface PublicSharedDoc {
  id: string;
  title: string;
  content: string;
  shareMode: "view" | "edit";
}

/** Resolve a token to its raw doc row (doc-level or per-recipient), or null. */
export async function loadByToken(token: string): Promise<DocRow | null> {
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

/** True when this row must be hidden: a draft reached via the doc-level
 *  "anyone with the link" token (per-recipient shares may open drafts). */
export function isHiddenDraft(doc: DocRow): boolean {
  return doc.status === "draft" && !doc.perRecipient;
}

/**
 * Load a shared doc as the public view shape, applying draft-gating and public
 * asset rewriting. Returns null when the token is unknown/revoked or points at
 * a draft that the "anyone" link may not expose.
 */
export async function loadPublicSharedDoc(token: string): Promise<PublicSharedDoc | null> {
  const doc = await loadByToken(token);
  if (!doc || isHiddenDraft(doc)) return null;
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content.replaceAll(CANONICAL_ASSET, publicAsset(token)),
    shareMode: (doc.shareMode ?? "view") as "view" | "edit",
  };
}
