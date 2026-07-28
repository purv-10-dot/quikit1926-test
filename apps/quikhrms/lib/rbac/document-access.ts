import type { AuthContext } from "@/lib/types/api";
import { prisma } from "@/lib/prisma";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";

export interface DocAccessResult {
  allow: boolean;
  /** Why access was denied — for choosing 403 vs 404-style messaging. */
  reason?: "no-permission" | "no-access";
  doc: { id: string; employeeId: string | null; fileUrl: string | null } | null;
  /** Highest access the caller holds. Owner/scope/company ⇒ Download; a View-only share ⇒ View. */
  accessLevel: "View" | "Download";
}

interface DocLike {
  id: string;
  employeeId: string | null;
  fileUrl: string | null;
  shares: { sharedWith: string; expiresAt: Date | null; accessLevel: "View" | "Download" }[];
}

/**
 * Central document authorization used by every document-touching route (detail,
 * download proxy, share, acknowledge, extract).
 *
 * A caller may access a document when it is company-wide (no owner), they own
 * it, their read-scope covers the owning employee, or a LIVE (non-expired)
 * share targets them. Expired shares are ignored. Owner/scope/company access
 * always permits download; a share only permits download when its accessLevel
 * is "Download".
 */
async function evaluate(ctx: AuthContext, doc: DocLike): Promise<DocAccessResult> {
  const scope = resolveScope(ctx, {
    all: "hrms.document.read",
    team: "hrms.document.read_team",
    self: "hrms.document.read_self",
  });
  const sf = await employeeScopeFilter(ctx, scope);
  if (!sf.allow) {
    return { allow: false, reason: "no-permission", doc: { id: doc.id, employeeId: doc.employeeId, fileUrl: doc.fileUrl }, accessLevel: "View" };
  }
  const callerId = await getCallerEmployeeId(ctx);
  const now = Date.now();
  const liveShare = doc.shares.find(
    (s) => !!callerId && s.sharedWith === callerId && (!s.expiresAt || s.expiresAt.getTime() > now),
  );

  const ownerOrScope =
    doc.employeeId === null ||                                        // company-wide
    sf.employeeIds === undefined ||                                   // unrestricted read
    (!!doc.employeeId && sf.employeeIds.includes(doc.employeeId)) ||  // owner in read-scope
    (!!callerId && doc.employeeId === callerId);                      // own document

  if (ownerOrScope) {
    return { allow: true, doc: { id: doc.id, employeeId: doc.employeeId, fileUrl: doc.fileUrl }, accessLevel: "Download" };
  }
  if (liveShare) {
    return { allow: true, doc: { id: doc.id, employeeId: doc.employeeId, fileUrl: doc.fileUrl }, accessLevel: liveShare.accessLevel };
  }
  return { allow: false, reason: "no-access", doc: { id: doc.id, employeeId: doc.employeeId, fileUrl: doc.fileUrl }, accessLevel: "View" };
}

/** Resolve document access by document id. Returns doc:null when it doesn't exist in the org. */
export async function resolveDocumentAccessById(ctx: AuthContext, documentId: string): Promise<DocAccessResult> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, orgId: ctx.orgId, deletedAt: null },
    select: {
      id: true, employeeId: true, fileUrl: true,
      shares: { select: { sharedWith: true, expiresAt: true, accessLevel: true } },
    },
  });
  if (!doc) return { allow: false, reason: "no-access", doc: null, accessLevel: "View" };
  return evaluate(ctx, doc as DocLike);
}

/**
 * Resolve document access from a storage key (used by the download proxy). Finds
 * the Document whose fileUrl references this key. Returns doc:null when no
 * Document owns the key — the caller then falls back to plain tenant scoping
 * (the key belongs to another module: candidate docs, offer letters, etc.).
 */
export async function resolveDocumentAccessByKey(ctx: AuthContext, key: string): Promise<DocAccessResult> {
  const doc = await prisma.document.findFirst({
    // The stored fileUrl keeps the object key percent-encoded (?key=uploads%2F…)
    // while the passed key is the decoded slash form — match either encoding so
    // the owner / read-scope / live-share gating (and the view-only download
    // block in the uploads proxy) actually fires instead of falling through to
    // tenant-only auth.
    where: {
      orgId: ctx.orgId,
      deletedAt: null,
      OR: [
        { fileUrl: { contains: key } },
        { fileUrl: { contains: encodeURIComponent(key) } },
      ],
    },
    select: {
      id: true, employeeId: true, fileUrl: true,
      shares: { select: { sharedWith: true, expiresAt: true, accessLevel: true } },
    },
  });
  if (!doc) return { allow: false, reason: "no-access", doc: null, accessLevel: "View" };
  return evaluate(ctx, doc as DocLike);
}
