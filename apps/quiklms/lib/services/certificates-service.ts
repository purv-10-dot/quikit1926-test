/**
 * Certificates service — ported from CertificatesService (Prisma).
 *
 * PDF & QR generation are IMPLEMENTED and TEMPLATE-DRIVEN (2026-07-17).
 * An earlier note here said they were deferred with placeholder urls; the result
 * was that `POST /certificates/generate` issued every certificate with
 * `pdfUrl: ''` and `qrCodeUrl: ''` — no downloadable file and no QR ever existed
 * (GAP_REPORT §3.2 certificates).
 *
 * RENDERING MECHANISM — a deliberate, approved deviation. The NestJS original
 * built an HTML document and rasterised it through `html-pdf-node` (headless
 * Chromium). Chromium cannot run on this app's serverless target without a
 * dedicated binary layer or an always-on host — the same unresolved infra
 * question as the worker (§2.2). So `buildCertificatePdf` draws the same
 * template imperatively with jsPDF instead: same template record, same
 * placements, same images, no browser.
 *
 * The geometry below is derived from the original's CSS so output lands in the
 * same place — see `buildCertificatePdf` for the unit conversions.
 *
 * Issued-certificate downloads ARE presigned (`getPresignedDownloadUrl`, 1h).
 * S3 presigned enrichment for template preview fields is still skipped; the
 * stored url is returned as-is — the template assets are base64 data URLs by
 * design (see `uploadCertificateAsset`), so there is nothing to presign.
 *
 * Tables: certificate (templates), certificateIssued (issued), certificateSelectedTenant.
 * certificateId is the public verification id (CERT-...). courseId is scalar
 * (refs Course or MasterCourse). Never relation-include actor/course refs.
 */
import type {
  LmsCertificate as CertificateTemplate,
  LmsCertificateApprovalStatus as CertificateApprovalStatus,
  LmsCertificateIssued as CertificateIssued,
} from '@prisma/client';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/http';
import {
  S3_BUCKET,
  presignGet,
  presignFromUrlOrKey,
  putObject,
  getObjectBufferFrom,
} from '@/lib/s3';
import { sendTemplateEmail } from '@/lib/services/email-templates-service';

const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3014';

/**
 * Host for the PUBLIC certificate download link mailed to the learner
 * (`progress.service.ts:755`).
 *
 * DELIBERATE DEVIATION. The legacy defaulted to the standalone NestJS
 * deployment (`https://quikskillsbackend.moreyeahs.in`) because its API and
 * frontend were separate hosts. Here they are the same origin, and that host is
 * being retired — defaulting to it would mail every learner a dead link. So the
 * fallback chain ends at FRONTEND_URL, and the path carries Next's `/api`
 * prefix (the legacy had no global prefix — verified in `main.ts`).
 */
// Same origin as the frontend (Next serves the API under /api on the same host).
const BACKEND_URL = FRONTEND_URL;
const PLATFORM_NAME = process.env.PLATFORM_NAME || 'QuikSkill LMS';

// ── Certificate rendering geometry ───────────────────────────────────────────
// Ported from the original's CSS (`generateCertificateHTML`) so a template
// designed against the legacy preview canvas renders in the same position here.
//
//   Legacy page:  297mm × 210mm  =  1122.5 × 793.7 CSS px @ 96 px/in
//   jsPDF page:   A4 landscape   =   841.9 × 595.3 pt
//   ⇒ CSS px → pt is exactly 72/96 = 0.75
//
// Placements store x/y as PERCENTAGES of the page, and the CSS applied
// `translate(-50%, -50%)` — so x/y is the CENTRE of the element, not its
// top-left. Every draw below centres accordingly.
const PX_TO_PT = 0.75;
/** Legacy `FONT_SCALE` — preview px → CSS px. Kept at its historical value: it
 *  sizes the text on every already-issued certificate. */
const FONT_SCALE = 1.4025;
/** preview px → PDF pt for text. */
const fontPt = (previewPx: number) => previewPx * FONT_SCALE * PX_TO_PT;
/** The legacy designer canvas the stored image sizes were authored against. */
const PREV_W = 1000;
const PREV_H = 707;
const SIG_SCALE = 1.0;
/** Floors so a tiny stored signature never renders invisibly (legacy behavior). */
const MIN_SIG_W_PCT = 25;
const MIN_SIG_H_PCT = 9;

interface Placement {
  x?: number;
  y?: number;
  fontSize?: number;
  color?: string;
  width?: number;
  height?: number;
}

/** Legacy defaults from `generateCertificateHTML` — do not change casually. */
const DEFAULTS = {
  userName: { x: 50, y: 50, fontSize: 24, color: '#000000' },
  courseName: { x: 50, y: 60, fontSize: 20, color: '#000000' },
  date: { x: 50, y: 70, fontSize: 16, color: '#666666' },
  designation: { x: 75, y: 91, fontSize: 12, color: '#555555' },
  logo: { x: 50, y: 15, width: 120, height: 60 },
  signature: { width: 420, height: 150 },
} as const;

/** #rrggbb → [r,g,b]; falls back to black on anything unparseable. */
function hexToRgb(hex?: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Fetch an image URL and return it as a data URL for embedding.
 * Port of the original's `imageUrlToBase64` (`certificates.service.ts:89`).
 *
 * S3 URLs are fetched through the SDK rather than over HTTP, exactly as the
 * original did — a stored url may be an expired presigned link, and the SDK path
 * sidesteps that entirely. Returns '' on any failure: a missing background must
 * degrade the certificate, never fail the issuance.
 */
async function imageUrlToDataUrl(url?: string | null): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:')) return url;

  try {
    const parsed = new URL(url);
    // Storage-hosted background: read the bytes with our credentials rather
    // than fetching the URL, which would 403 against the private bucket.
    // Both GCS layouts, plus the legacy S3 host form for pre-migration rows.
    const host = parsed.hostname;
    const path = decodeURIComponent(parsed.pathname.slice(1));
    let target: { bucket: string; key: string } | null = null;
    if (host === 'storage.googleapis.com') {
      const slash = path.indexOf('/');
      if (slash > 0) target = { bucket: path.slice(0, slash), key: path.slice(slash + 1) };
    } else {
      const m = host.match(/^(.+?)\.storage\.googleapis\.com$/) ?? host.match(/^(.+?)\.s3[.-].*\.amazonaws\.com$/);
      if (m) target = { bucket: m[1], key: path };
    }

    if (target) {
      const bytes = await getObjectBufferFrom(target.bucket, target.key);
      if (!bytes?.length) return '';
      const ext = target.key.split('.').pop()?.toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
      return `data:${mime};base64,${bytes.toString('base64')}`;
    }

    // Not one of our buckets — fetch directly.
    const res = await fetch(url);
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

/** jsPDF needs the format name, and throws on an unknown one. */
function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG';
}

function newCertificateId(): string {
  return `CERT-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ── Template asset uploads ───────────────────────────────────────────────────

/** Shape of the three upload-* handlers' response body. */
type AssetUploadResult =
  | { success: true; data: { url: string; permanentUrl: string; dataUrl: string; s3Key: string } }
  | { success: false; message: string; error: 'S3_ACCESS_DENIED' };

/**
 * Upload a certificate template asset to S3 and return the legacy response body
 * — shared by `upload-background`, `upload-signature` and `upload-logo`
 * (`certificates.controller.ts:454-608`), which are three copies of this.
 *
 * The base64 `dataUrl` is NOT a fallback: the legacy deliberately returns it as
 * the primary `url` so the template embeds the image and reading it back never
 * needs `s3:GetObject` ("this is stored in the template so we never need
 * s3:GetObject permission to read the image back" — controller:492-493). S3 is
 * the backup reference. Both are reproduced.
 *
 * AccessDenied on PutObject is swallowed into a `{success:false}` body — the one
 * S3 error the legacy reports rather than throws. Every other error rethrows.
 */
export async function uploadCertificateAsset(
  file: { buffer: Buffer; originalName: string; mimeType: string },
  prefix: 'certificates/templates' | 'certificates/signatures' | 'certificates/logos',
  accessDeniedMessage: string,
): Promise<AssetUploadResult> {
  const key = `${prefix}/${Date.now()}-${file.originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  try {
    await putObject(key, file.buffer, file.mimeType);
  } catch (error) {
    // GCS surfaces authorization failures as an HTTP 403; the legacy S3 client
    // used a named error. Both are mapped to the same caller-facing result so
    // the route keeps returning its friendly "ask your admin" message.
    const e = error as { name?: string; Code?: string; code?: number | string };
    if (e.name === 'AccessDenied' || e.Code === 'AccessDenied' || e.code === 403 || e.code === '403') {
      return { success: false, message: accessDeniedMessage, error: 'S3_ACCESS_DENIED' };
    }
    throw error;
  }

  const dataUrl = `data:${file.mimeType};base64,${file.buffer.toString('base64')}`;
  const permanentUrl = `https://storage.googleapis.com/${S3_BUCKET}/${key}`;
  const presignedUrl = await presignFromUrlOrKey(permanentUrl);

  return { success: true, data: { url: dataUrl, permanentUrl: presignedUrl || permanentUrl, dataUrl, s3Key: key } };
}

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * `selectedTenants` was an inline array on the Mongo document, so every
 * `find()` returned it for free. Here it is the `LmsCertificateSelectedTenant`
 * child table and must be included explicitly — without it
 * `certificate-templates/page.tsx:208` sees `undefined`, and every
 * tenant-restricted template renders the "Global Availability" badge instead of
 * "N Restricted Nodes".
 */
const SELECTED_TENANTS_INCLUDE = { selectedTenants: { select: { orgId: true } } } as const;

/** Flatten the join rows back to the id array the legacy exposed. */
function shapeTemplate<T extends Record<string, unknown>>(t: T) {
  const rows = t.selectedTenants as Array<{ orgId: string }> | undefined;
  return { _id: t.id, ...t, selectedTenants: Array.isArray(rows) ? rows.map((r) => r.orgId) : [] };
}


/**
 * Columns a client may set on a template. Anything else in the payload is
 * DROPPED, not forwarded.
 *
 * The route body is `passthrough()`, and Mongoose silently ignored keys outside
 * the schema (`new this.certificateModel(data)`), so the designer UI could send
 * `_id`, `tenantId`, `createdAt` or its own UI state harmlessly. Prisma instead
 * throws `Unknown argument`, so any stray field 500'd template creation.
 */
const TEMPLATE_WRITABLE = [
  'name', 'backgroundImageUrl', 'logoImageUrl', 'signatureImageUrl', 'designation', 'signatoryName',
  'textPlacements', 'logoPlacement', 'signaturePlacement', 'isActive',
  'approvalStatus', 'submittedBy', 'submittedByTenantId', 'orgId',
  // These three MUST be writable. `PUT /api/certificates/[id]` resets a
  // re-submitted template to `pending_approval` and nulls the prior decision —
  // but the nulls were silently dropped here, so `approvalStatus` reverted while
  // `approvedBy`/`approvalDate` kept the OLD approver. The audit trail then
  // claimed a pending template had already been approved, by a named person.
  'approvedBy', 'approvalDate', 'rejectionReason',
] as const;

function pickTemplateFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of TEMPLATE_WRITABLE) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

export async function createTemplate(data: Record<string, unknown>) {
  const { selectedTenants } = data as { selectedTenants?: string[] };
  const rest = pickTemplateFields(data);
  const created = await db.lmsCertificate.create({
    data: {
      ...(rest as object),
      ...(selectedTenants?.length
        ? { selectedTenants: { create: selectedTenants.map((orgId) => ({ orgId })) } }
        : {}),
    } as never,
  });
  if (created.isActive) await deactivateOtherTenantTemplates(created.id, created.orgId, created.submittedByTenantId);
  return created;
}

/** Returns certificate templates assigned to a tenant, or all for super admin (orgId undefined). */
export async function findAll(orgId?: string) {
  if (orgId) {
    const where = {
      OR: [
        { selectedTenants: { some: { orgId } } },
        { orgId },
        { submittedByTenantId: orgId },
      ],
    };
    let certs = await db.lmsCertificate.findMany({ where: { AND: [where, { isActive: true }] }, include: SELECTED_TENANTS_INCLUDE });
    if (certs.length === 0) {
      certs = await db.lmsCertificate.findMany({ where: { AND: [where, { approvalStatus: 'approved' }] }, include: SELECTED_TENANTS_INCLUDE });
      if (certs.length) {
        await db.lmsCertificate.updateMany({ where: { id: { in: certs.map((c) => c.id) } }, data: { isActive: true } });
        certs = certs.map((c) => ({ ...c, isActive: true }));
      }
    }
    // Last resort: any of the tenant's templates regardless of status, activated
    // and auto-approved so the tenant is never left with nothing to issue.
    //
    // DELIBERATE DEVIATION (product owner, 2026-07-17). The legacy rescued
    // templates of ANY status here — including ones a Super Admin had explicitly
    // REJECTED, silently flipping them back to `approved` and putting them live
    // (`certificates.service.ts:198-208`, logging "activating and approving
    // them"). That let a rejected design bypass the approval workflow entirely.
    // Rejected templates are now excluded from the rescue: a tenant whose only
    // templates were rejected gets none, and issuance falls back to the built-in
    // default certificate rather than resurrecting a refused design.
    if (certs.length === 0) {
      certs = await db.lmsCertificate.findMany({ where: { AND: [where, { approvalStatus: { not: 'rejected' } }] }, include: SELECTED_TENANTS_INCLUDE });
      if (certs.length) {
        await db.lmsCertificate.updateMany({ where: { id: { in: certs.map((c) => c.id) } }, data: { isActive: true, approvalStatus: 'approved' } });
        certs = certs.map((c) => ({ ...c, isActive: true, approvalStatus: 'approved' as const }));
      }
    }
    return certs.map(shapeTemplate);
  }
  return (await db.lmsCertificate.findMany({ include: SELECTED_TENANTS_INCLUDE })).map(shapeTemplate);
}

type PopulatedActor = { _id: string; firstName: string; lastName: string; email: string } | null;
type PopulatedTenant = { _id: string; orgName: string; contactEmail: string } | null;
type ApprovalItem = Omit<CertificateTemplate, 'submittedBy' | 'submittedByTenantId'> & {
  /** Mongo-compat alias for `id`. Declared because the approval queue's Approve
   *  and Reject actions address the template by it — dropping it silently sent
   *  them to `/certificates/undefined`. */
  _id: string;
  submittedBy: PopulatedActor;
  submittedByTenantId: PopulatedTenant;
};

/**
 * Replace `submittedBy` / `submittedByTenantId` ids with the actor objects —
 * the Postgres equivalent of the legacy's
 *   .populate('submittedBy', 'firstName lastName email')
 *   .populate('submittedByTenantId', 'orgName contactEmail')
 * (`certificates.service.ts:220-247`).
 *
 * These are scalar columns with no Prisma relation, so the join is done here.
 * Mongoose REPLACES the field in place and yields null when the referenced doc
 * is gone, so both are reproduced — the Super Admin approval queue reads
 * `submittedByTenantId?.orgName` and `submittedBy.firstName` directly
 * (`app/(super-admin)/approvals/page.tsx:508,957`) and shows blanks against a
 * bare id.
 */
async function hydrateApprovalActors(certs: CertificateTemplate[]): Promise<ApprovalItem[]> {
  const userIds = [...new Set(certs.map((c) => c.submittedBy).filter((v): v is string => Boolean(v)))];
  const orgIds = [...new Set(certs.map((c) => c.submittedByTenantId).filter((v): v is string => Boolean(v)))];

  const [users, tenants] = await Promise.all([
    userIds.length
      ? db.lmsUser.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [],
    orgIds.length
      ? db.lmsTenant.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, orgName: true, contactEmail: true },
        })
      : [],
  ]);

  const userMap = new Map(users.map((u) => [u.id, { _id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }]));
  const tenantMap = new Map(tenants.map((t) => [t.id, { _id: t.id, orgName: t.orgName, contactEmail: t.contactEmail }]));

  return certs.map((c) => ({
    // `_id` is REQUIRED, not decoration. Every certificate screen keys its
    // actions off `_id` (the Mongo-compat alias `shapeTemplate` emits), so a row
    // returned without it makes the Super Admin queue POST to
    // `/certificates/undefined/approve` — which 404s as "Certificate template
    // not found" against a template that plainly exists.
    _id: c.id,
    ...c,
    submittedBy: (c.submittedBy && userMap.get(c.submittedBy)) || null,
    submittedByTenantId: (c.submittedByTenantId && tenantMap.get(c.submittedByTenantId)) || null,
  }));
}

export async function findPendingApprovals(): Promise<ApprovalItem[]> {
  const certs = await db.lmsCertificate.findMany({
    where: { approvalStatus: 'pending_approval' },
    orderBy: { createdAt: 'desc' },
  });
  return hydrateApprovalActors(certs);
}

export async function findAllApprovalItems(): Promise<ApprovalItem[]> {
  const certs = await db.lmsCertificate.findMany({
    where: { submittedByTenantId: { not: null }, approvalStatus: { in: ['pending_approval', 'approved', 'rejected'] } },
    orderBy: { updatedAt: 'desc' },
  });
  return hydrateApprovalActors(certs);
}

export async function findBySubmittedTenant(orgId: string) {
  const certs = await db.lmsCertificate.findMany({
    where: { OR: [{ submittedByTenantId: orgId }, { selectedTenants: { some: { orgId } } }] },
    orderBy: { updatedAt: 'desc' },
    include: { selectedTenants: { select: { orgId: true } } },
  });
  // Shaped like every other template read: the tenant-admin list drives Edit and
  // Delete off `_id`, so returning bare Prisma rows here sent both to
  // `/certificates/undefined`.
  return certs.map(shapeTemplate);
}

async function deactivateOtherTenantTemplates(excludeId: string, orgId?: string | null, submittedByTenantId?: string | null) {
  const tid = orgId || submittedByTenantId;
  if (!tid) return;
  await db.lmsCertificate.updateMany({
    where: {
      id: { not: excludeId },
      isActive: true,
      OR: [{ orgId: tid }, { submittedByTenantId: tid }, { selectedTenants: { some: { orgId: tid } } }],
    },
    data: { isActive: false },
  });
}

export async function approve(id: string, approvedById: string) {
  const cert = await db.lmsCertificate.findUnique({ where: { id } });
  if (!cert) throw NotFound('Certificate template not found');
  if (cert.approvalStatus !== 'pending_approval') throw NotFound('Only pending certificates can be approved');
  const saved = await db.lmsCertificate.update({
    where: { id },
    data: { approvalStatus: 'approved', isActive: true, approvedBy: approvedById, approvalDate: new Date(), rejectionReason: null },
  });
  await deactivateOtherTenantTemplates(saved.id, saved.orgId, saved.submittedByTenantId);
  return saved;
}

export async function reject(id: string, rejectedById: string, reason: string) {
  const cert = await db.lmsCertificate.findUnique({ where: { id } });
  if (!cert) throw NotFound('Certificate template not found');
  if (cert.approvalStatus !== 'pending_approval') throw NotFound('Only pending certificates can be rejected');
  return db.lmsCertificate.update({
    where: { id },
    data: { approvalStatus: 'rejected', isActive: false, approvedBy: rejectedById, approvalDate: new Date(), rejectionReason: reason },
  });
}

/** A template is visible to a tenant if it owns / submitted / was assigned it. */
function tenantTemplateScope(orgId?: string | null) {
  if (!orgId) return undefined; // super-admin: no scoping
  return {
    OR: [
      { orgId },
      { submittedByTenantId: orgId },
      { selectedTenants: { some: { orgId } } },
    ],
  };
}

export async function findOne(id: string, orgId?: string | null) {
  const scope = tenantTemplateScope(orgId);
  const cert = await db.lmsCertificate.findFirst({ where: scope ? { AND: [{ id }, scope] } : { id }, include: SELECTED_TENANTS_INCLUDE });
  if (!cert) throw NotFound('Certificate template not found');
  return shapeTemplate(cert);
}

export async function updateTemplate(id: string, data: Record<string, unknown>, orgId?: string | null) {
  const { selectedTenants } = data as { selectedTenants?: string[] };
  const rest = pickTemplateFields(data);
  const scope = tenantTemplateScope(orgId);
  const result = await db.lmsCertificate.updateMany({
    where: scope ? { AND: [{ id }, scope] } : { id },
    data: rest as never,
  });
  if (result.count === 0) throw NotFound('Certificate template not found');

  /**
   * Persist the tenant assignment too.
   *
   * `selectedTenants` was destructured out and then never written — unlike
   * `createTemplate`, which does create the child rows. So a Super Admin
   * re-assigning an existing template to a different set of tenants got a 200
   * and no change at all. Mongo stored the array inline, so
   * `findByIdAndUpdate(id, data)` wrote it for free
   * (`certificates.service.ts:347-353`).
   *
   * Replace-in-place inside a transaction: the array was the full assignment
   * list, not a delta.
   */
  if (selectedTenants !== undefined) {
    const ids = [...new Set((selectedTenants || []).filter(Boolean))];
    await db.$transaction(async (tx) => {
      await tx.lmsCertificateSelectedTenant.deleteMany({ where: { certificateId: id } });
      if (ids.length) {
        await tx.lmsCertificateSelectedTenant.createMany({
          data: ids.map((tenantOrgId) => ({ certificateId: id, orgId: tenantOrgId })),
          skipDuplicates: true,
        });
      }
    });
  }

  return db.lmsCertificate.findUnique({ where: { id }, include: SELECTED_TENANTS_INCLUDE });
}

export async function deleteTemplate(id: string) {
  try {
    await db.lmsCertificate.delete({ where: { id } });
  } catch {
    throw NotFound('Certificate template not found');
  }
}

export async function deleteAllTemplates() {
  const result = await db.lmsCertificate.deleteMany({});
  return result.count;
}

/** Keeps the oldest issued cert per (tenant, learner, course); removes the rest. */
/**
 * Keep the oldest issued cert per (org, learner, course); remove the rest.
 *
 * SCOPED and PROJECTED. This previously loaded EVERY issued certificate in
 * EVERY tenant, full rows, with no cap — and it runs on every template creation
 * (`app/api/certificates/route.ts:18`), so at six-figure certificate counts
 * `POST /api/certificates` would OOM or time out. The legacy did the grouping
 * server-side with `$group` and only returned duplicate groups
 * (`certificates.service.ts:373-383`).
 *
 * `orgId` is optional so the super-admin cleanup endpoint can still sweep
 * everything deliberately, while the create path passes its own tenant.
 */
export async function removeDuplicateIssuedCertificates(orgId?: string) {
  const all = await db.lmsCertificateIssued.findMany({
    where: orgId ? { orgId } : undefined,
    select: { id: true, orgId: true, learnerId: true, courseId: true },
    orderBy: { createdAt: 'asc' },
  });
  const seen = new Map<string, string>();
  const toRemove: string[] = [];
  for (const c of all) {
    const key = `${c.orgId}|${c.learnerId}|${c.courseId}`;
    if (seen.has(key)) toRemove.push(c.id);
    else seen.set(key, c.id);
  }
  if (toRemove.length) await db.lmsCertificateIssued.deleteMany({ where: { id: { in: toRemove } } });
  return toRemove.length;
}

// ── Issuance ─────────────────────────────────────────────────────────────────

interface GenerateInput {
  certificateTemplateId?: string;
  learnerId: string;
  courseId: string;
  orgId: string;
  userName: string;
  courseName: string;
  designation?: string;
  isComplianceCertificate?: boolean;
  expiresAt?: Date;
  score?: number;
  passingScore?: number;
  passed?: boolean;
}

export async function generateCertificate(data: GenerateInput) {
  const { orgId, learnerId, courseId } = data;
  const existing = await db.lmsCertificateIssued.findFirst({ where: { orgId, learnerId, courseId } });
  if (existing) {
    /**
     * Re-point + regenerate when the tenant's active template has CHANGED.
     *
     * The legacy did this (`certificates.service.ts:437-462`); the port returned
     * the stale record, so after an admin published a new design a re-issue kept
     * pointing at the retired one. The learner-facing `/download` paths recover
     * (they regenerate via `selectTemplateForIssued`), but the stored
     * `pdfUrl`/`certificateTemplateId` stayed wrong.
     */
    if (data.certificateTemplateId && data.certificateTemplateId !== existing.certificateTemplateId) {
      try {
        const template = await db.lmsCertificate.findUnique({ where: { id: data.certificateTemplateId } });
        const { pdfUrl, qrCodeUrl } = await renderAndUploadCertificateAssets(existing, template, data.designation);
        return await db.lmsCertificateIssued.update({
          where: { id: existing.id },
          data: {
            certificateTemplateId: data.certificateTemplateId,
            ...(pdfUrl ? { pdfUrl } : {}),
            ...(qrCodeUrl ? { qrCodeUrl } : {}),
          },
        });
      } catch {
        // A regeneration failure must never lose the existing certificate.
        return existing;
      }
    }
    return existing;
  }

  const certificateId = newCertificateId();
  const verificationUrl = `${FRONTEND_URL}/verify-certificate/${certificateId}`;

  // Create the record FIRST, then render + upload, then attach the urls.
  //
  // The legacy rendered before saving, but wrapped the whole PDF/S3 step in a
  // try/catch precisely so that a storage failure still produced a certificate
  // record ("saving record without PDF" — certificates.service.ts:543-546).
  // Creating first reaches the same guarantee without depending on a catch, and
  // gives the renderer a real row (with its certificateId + verificationUrl) to
  // draw from. `renderAndUploadCertificateAssets` never throws.
  const created = await db.lmsCertificateIssued.create({
    data: {
      orgId, learnerId, courseId,
      certificateTemplateId: data.certificateTemplateId ?? null,
      certificateId, courseName: data.courseName, learnerName: data.userName,
      pdfUrl: '', qrCodeUrl: '', verificationUrl, issuedAt: new Date(),
      isComplianceCertificate: Boolean(data.isComplianceCertificate), expiresAt: data.expiresAt ?? null,
      score: data.score ?? null, passingScore: data.passingScore ?? null, passed: data.passed ?? null,
    },
  });

  const template = await loadTemplateForIssued(created);
  const { pdfUrl, qrCodeUrl } = await renderAndUploadCertificateAssets(created, template, data.designation);
  if (!pdfUrl && !qrCodeUrl) return created; // storage failed — record stands, as in the legacy

  return db.lmsCertificateIssued.update({
    where: { id: created.id },
    data: { pdfUrl, qrCodeUrl },
  });
}

export async function generateDefaultCertificate(data: GenerateInput) {
  return generateCertificate({ ...data, certificateTemplateId: undefined });
}

/**
 * Certificate completion generation — ported from ProgressService.generateCertificateForCompletion.
 * Re-verifies completion + quiz pass gate, selects active template, then issues.
 */
export async function generateCertificateForCompletion(orgId: string, learnerId: string, courseId: string): Promise<void> {
  const progress = await db.lmsProgress.findUnique({
    where: { orgId_learnerId_courseId: { orgId, learnerId, courseId } },
  });
  if (!progress) return;
  if (progress.completionPercentage < 100 && progress.status !== 'Completed') return;
  if (progress.quizScore != null && progress.isPassed !== true) return;

  // Already issued?
  const existing = await db.lmsCertificateIssued.findFirst({ where: { orgId, learnerId, courseId } });
  if (existing) return;

  const user = await db.lmsUser.findUnique({ where: { id: learnerId } });
  if (!user) return;

  // Course details — Course first, then MasterCourse.
  let course: { title: string; settings?: unknown } | null =
    await db.lmsCourse.findFirst({ where: { id: courseId }, select: { title: true } });
  let settings: Record<string, unknown> | undefined;
  if (!course) {
    const mc = await db.lmsMasterCourse.findUnique({ where: { id: courseId }, select: { title: true, settings: true } });
    if (mc) { course = { title: mc.title }; settings = (mc.settings as Record<string, unknown>) ?? undefined; }
  }
  if (!course) return;

  // Tenant feature + designation
  const tenant = await db.lmsTenant.findUnique({ where: { id: orgId } });
  const featureConfig = (tenant?.featureConfig as Record<string, unknown>) || {};
  if (featureConfig.enableCertificates === false) return;
  if (settings?.certificateEnabled === false && settings?.certificateTemplateId) return;

  // Compliance metadata
  const assignment = await db.lmsCourseAssignment.findFirst({
    where: { orgId, targetType: 'USER', targetId: learnerId, courseId },
    select: { isMandatory: true },
  });
  const isComplianceCertificate = Boolean(assignment?.isMandatory);
  const corporateConfig = (tenant?.corporateConfig as Record<string, unknown>) || {};
  const validityDays = settings?.validityDays;
  const expiryDays = Number.isFinite(validityDays)
    ? Number(validityDays)
    : isComplianceCertificate ? (corporateConfig.complianceDueDays as number | undefined) : undefined;
  const expiresAt = expiryDays && expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000) : undefined;

  const userName = `${user.firstName} ${user.lastName}`.trim() || user.email || 'Learner';

  // Active template selection (base64 preference)
  const templates = await findAll(orgId);
  const hasBase64 = (t: { backgroundImageUrl: string }) => t.backgroundImageUrl?.startsWith('data:');
  const sorted = [...templates].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
  );
  const active = sorted.find((c) => c.isActive && hasBase64(c)) || sorted.find((c) => c.isActive) || sorted.find((c) => hasBase64(c)) || sorted[0] || null;

  // Pass-criteria snapshot
  const certScore = typeof progress.scorePercentage === 'number'
    ? progress.scorePercentage
    : typeof progress.quizScore === 'number' ? progress.quizScore : undefined;
  let certPassingScore: number | undefined;
  try {
    const latestAttempt = await db.lmsQuizAttempt.findFirst({
      where: { orgId, learnerId, courseId }, orderBy: { submittedAt: 'desc' },
    });
    if (latestAttempt) {
      const a = await db.lmsAssessment.findFirst({ where: { id: latestAttempt.assessmentId }, select: { passingScore: true } });
      if (a && typeof a.passingScore === 'number') certPassingScore = a.passingScore;
    }
  } catch { /* best-effort */ }

  const passed = progress.isPassed === true ? true : certScore == null ? undefined : false;

  const newCertificate = active
    ? await generateCertificate({
        certificateTemplateId: active.id, learnerId, courseId, orgId, userName,
        courseName: course.title, designation: active.designation || tenant?.contactRoleInOrganization || '',
        isComplianceCertificate, expiresAt, score: certScore, passingScore: certPassingScore, passed,
      })
    : await generateDefaultCertificate({
        learnerId, courseId, orgId, userName, courseName: course.title,
        designation: tenant?.contactRoleInOrganization || 'Course Administrator',
        isComplianceCertificate, expiresAt, score: certScore, passingScore: certPassingScore, passed,
      });

  // Certificate-earned email — port of `progress.service.ts:745-778`. The
  // learner is otherwise never told the certificate exists.
  //
  // Wrapped like the legacy: "Don't throw — certificate is saved; email failure
  // must not break the flow". `sendTemplateEmail` already swallows its own
  // errors; this guard covers the date/score formatting above it.
  try {
    const issueDateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const completionDateStr = progress.completedAt
      ? new Date(progress.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : issueDateStr;
    // Legacy's exact fallback ladder, '100%' included.
    const scoreStr = progress.scorePercentage != null
      ? `${progress.scorePercentage}%`
      : progress.quizScore != null ? `${progress.quizScore}%` : '100%';
    const certificateUrl = `${BACKEND_URL}/api/verify-certificate/${newCertificate.certificateId}/download`;

    await sendTemplateEmail({
      to: user.email,
      template: 'certificate-earned',
      data: {
        studentName: userName,
        userName,
        courseName: course.title,
        completionDate: completionDateStr,
        issueDate: issueDateStr,
        score: scoreStr,
        certificateId: newCertificate.certificateId,
        platformName: PLATFORM_NAME,
        certificateUrl,
        downloadUrl: certificateUrl,
        loginUrl: FRONTEND_URL,
      },
    });
  } catch {
    /* certificate is saved; an email failure must not break the flow */
  }
}

// ── Issued cert listings ─────────────────────────────────────────────────────

async function resolveCourseMap(courseIds: string[]) {
  const map = new Map<string, { _id: string; title: string; description?: string | null }>();
  if (courseIds.length === 0) return map;
  const unique = [...new Set(courseIds)];
  const masters = await db.lmsMasterCourse.findMany({ where: { id: { in: unique } }, select: { id: true, title: true, description: true } });
  masters.forEach((mc) => map.set(mc.id, { _id: mc.id, title: mc.title, description: mc.description }));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) {
    const courses = await db.lmsCourse.findMany({ where: { id: { in: missing } }, select: { id: true, title: true, description: true } });
    courses.forEach((c) => map.set(c.id, { _id: c.id, title: c.title, description: c.description }));
  }
  return map;
}

export async function getLearnerCertificates(orgId: string, learnerId: string) {
  const certs = await db.lmsCertificateIssued.findMany({ where: { orgId, learnerId }, orderBy: { issuedAt: 'desc' } });
  const courseMap = await resolveCourseMap(certs.map((c) => c.courseId).filter(Boolean));
  const seen = new Set<string>();
  return certs
    .map((cert) => {
      const resolved = courseMap.get(cert.courseId);
      return {
        ...cert,
        courseId: resolved || (cert.courseId ? { _id: cert.courseId, title: cert.courseName || 'Course' } : null),
        courseName: resolved?.title || cert.courseName || 'Course',
      };
    })
    .filter((cert) => {
      const key = (cert.courseId as { _id?: string })?._id?.toString() || cert.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function getTenantIssuedCertificates(orgId: string) {
  const certs = await db.lmsCertificateIssued.findMany({ where: { orgId }, orderBy: { issuedAt: 'desc' } });
  const courseMap = await resolveCourseMap(certs.map((c) => c.courseId).filter(Boolean));
  const learnerIds = [...new Set(certs.map((c) => c.learnerId).filter(Boolean))];
  const learners = await db.lmsUser.findMany({
    where: { id: { in: learnerIds } }, select: { id: true, firstName: true, lastName: true, email: true },
  });
  const learnerMap = new Map(learners.map((l) => [l.id, l]));
  const seen = new Set<string>();
  return certs
    .map((cert) => {
      const resolved = courseMap.get(cert.courseId);
      return {
        ...cert,
        learnerId: learnerMap.get(cert.learnerId) || cert.learnerId,
        courseId: resolved || (cert.courseId ? { _id: cert.courseId, title: cert.courseName || 'Course' } : null),
        courseName: resolved?.title || cert.courseName || 'Course',
      };
    })
    .filter((cert) => {
      const learnKey = (cert.learnerId as { id?: string })?.id?.toString() || String(cert.learnerId) || 'unknown';
      const courseKey = (cert.courseId as { _id?: string })?._id?.toString() || cert.id;
      const key = `${learnKey}_${courseKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ── Verification + downloads ─────────────────────────────────────────────────

export async function findIssuedById(id: string) {
  return db.lmsCertificateIssued.findUnique({ where: { id } });
}

/**
 * Look up by the PUBLIC certificate id (`CERT-…`), not the row id. Used by the
 * unauthenticated verification routes, which only ever see the public id.
 */
export async function findIssuedByCertificateId(certificateId: string) {
  return db.lmsCertificateIssued.findUnique({ where: { certificateId } });
}

/**
 * Public certificate verification.
 *
 * The legacy populated learner, course and template
 * (`certificates.service.ts:1179-1185`). The port returned the bare row, so the
 * public trust page — which reads `certificate.learnerId.name`,
 * `.courseId.title` and `.certificateTemplateId.name`
 * (`app/verify-certificate/[certificateId]/page.tsx:118-141`) — was reading
 * properties off raw uuid STRINGS. Strings are truthy, so every block rendered
 * and every one printed **"N/A"**: the page confirmed "Certificate Verified"
 * while naming no learner, no course and no template.
 */
export async function verifyCertificate(certificateId: string) {
  const cert = await db.lmsCertificateIssued.findUnique({ where: { certificateId } });
  if (!cert) return cert;

  const [learner, template] = await Promise.all([
    cert.learnerId
      ? db.lmsUser.findUnique({
          where: { id: cert.learnerId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : null,
    cert.certificateTemplateId
      ? db.lmsCertificate.findUnique({
          where: { id: cert.certificateTemplateId },
          select: { id: true, name: true },
        })
      : null,
  ]);

  // Course title comes from MasterCourse first, then the legacy Course — the
  // same order the rest of this service uses for the scalar courseId.
  const courseMap = await resolveCourseMap([cert.courseId].filter(Boolean));
  const course = courseMap.get(cert.courseId);

  return {
    ...cert,
    learnerId: learner
      ? { _id: learner.id, ...learner, name: `${learner.firstName} ${learner.lastName}`.trim() }
      : cert.learnerId,
    courseId: course ?? (cert.courseId ? { _id: cert.courseId, title: cert.courseName || 'Course' } : null),
    certificateTemplateId: template ? { _id: template.id, ...template } : cert.certificateTemplateId,
  };
}

/**
 * Minimal, public-safe view of a verified certificate.
 *
 * `verifyCertificate` returns the whole issued row plus a hydrated learner —
 * which is right for authenticated callers but far too much for
 * `GET /api/verify-certificate/:id`, a route with NO auth at all. That endpoint
 * was returning the holder's **email address**, their internal `learnerId`, the
 * `orgId`, and their **exam score / passingScore**.
 *
 * Certificate ids are *designed* to be shared publicly — printed on the PDF,
 * posted to LinkedIn — so the identifier is not a secret and anything returned
 * with it is effectively public. A verification endpoint only has to answer
 * "is this certificate genuine, and who/what is it for?": holder name, course
 * title, template name, issue date, expiry. Grades and contact details are not
 * part of that question.
 *
 * The public page (`app/verify-certificate/[certificateId]/page.tsx`) reads
 * `learnerId.name`, `courseId.title`, `certificateTemplateId.name`,
 * `certificateId` and `issuedAt` — all preserved below. It also fell back to
 * `learnerId.email` when `name` was empty; `name` is always produced here, so
 * that fallback is now dead rather than broken.
 */
export function toPublicVerification(cert: Record<string, unknown> | null) {
  if (!cert) return cert;
  const learner = cert.learnerId as Record<string, unknown> | string | null;
  const course = cert.courseId as Record<string, unknown> | string | null;
  const template = cert.certificateTemplateId as Record<string, unknown> | string | null;

  const name =
    learner && typeof learner === 'object'
      ? String(learner.name ?? `${learner.firstName ?? ''} ${learner.lastName ?? ''}`.trim())
      : '';

  return {
    certificateId: cert.certificateId,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt ?? null,
    // Name only — no email, no internal user id.
    learnerId: name ? { name } : null,
    courseId:
      course && typeof course === 'object'
        ? { title: course.title ?? cert.courseName ?? 'Course' }
        : cert.courseName
          ? { title: cert.courseName }
          : null,
    certificateTemplateId:
      template && typeof template === 'object' ? { name: template.name ?? null } : null,
    // Deliberately omitted: orgId, learnerId (uuid), score, passingScore,
    // passed, isComplianceCertificate, pdfUrl, qrCodeUrl, createdAt, updatedAt.
  };
}

/** Download permission gate result — used by the authenticated download route. */
export function downloadGateBlocked(issued: { passed: boolean | null; score: number | null; passingScore: number | null } | null): boolean {
  if (!issued) return false;
  return (
    issued.passed === false ||
    (typeof issued.score === 'number' && typeof issued.passingScore === 'number' && issued.score < issued.passingScore)
  );
}

/**
 * Render an issued certificate to a real PDF (A4 landscape) using jsPDF.
 *
 * TEMPLATE-DRIVEN. The tenant's `LmsCertificate` template supplies the
 * background, logo, signature, text placements, designation and signatory —
 * exactly the inputs the legacy HTML renderer used. Passing no template (or a
 * template that cannot be loaded) falls back to the generic layout below, which
 * is what every certificate used to get unconditionally: `buildCertificatePdf`
 * ignored `certificateTemplateId` entirely, so background, logo, signature,
 * textPlacements, designation and signatoryName were all silently dropped
 * (GAP_REPORT §3.2 certificates).
 *
 * Geometry note: placements store x/y as PERCENTAGES of the page and the legacy
 * CSS applied `translate(-50%, -50%)`, so x/y is the element's CENTRE. Text is
 * drawn with `align: 'center'` + `baseline: 'middle'` to match; images are offset
 * by half their size. See the constants block at the top of this file for the
 * px→pt conversions.
 */
export async function buildCertificatePdf(
  cert: CertificateIssued,
  template?: CertificateTemplate | null,
  /**
   * Generate-time designation override. The legacy resolved designation as
   * `designation || template.designation || ''` at issue time and never
   * persisted it on the issued record — so a regenerate falls back to the
   * template, exactly as it did originally.
   */
  designationOverride?: string,
): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;

  const qrTarget = cert.verificationUrl || `${FRONTEND_URL}/verify-certificate/${cert.certificateId}`;
  const issued = cert.issuedAt ? new Date(cert.issuedAt) : new Date();
  const issuedStr = issued.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Template path ──────────────────────────────────────────────────────────
  if (template) {
    const placements = (template.textPlacements as Record<string, Placement> | null) || {};
    const p = {
      userName: { ...DEFAULTS.userName, ...(placements.userName || {}) },
      courseName: { ...DEFAULTS.courseName, ...(placements.courseName || {}) },
      date: { ...DEFAULTS.date, ...(placements.date || {}) },
      designation: { ...DEFAULTS.designation, ...(placements.designation || {}) },
    };
    const signatoryNamePlacement = (placements.signatoryName as Placement | undefined) || null;
    const logo = { ...DEFAULTS.logo, ...((template.logoPlacement as Placement | null) || {}) };
    const sig = { ...DEFAULTS.signature, ...((template.signaturePlacement as Placement | null) || {}) };
    // Legacy: the signature is only *positioned* when BOTH x and y are stored;
    // otherwise it falls into the centred bottom strip.
    const sigHasPosition = sig.x !== undefined && sig.y !== undefined;

    const [bgUrl, logoUrl, sigUrl] = await Promise.all([
      imageUrlToDataUrl(template.backgroundImageUrl),
      imageUrlToDataUrl(template.logoImageUrl),
      imageUrlToDataUrl(template.signatureImageUrl),
    ]);

    // Background — CSS `background-size: cover`. Fill the page; jsPDF has no
    // cover mode, and stretching to the page is the closest single-call
    // equivalent for the A4-landscape artwork these templates are authored at.
    if (bgUrl) {
      try {
        doc.addImage(bgUrl, imageFormat(bgUrl), 0, 0, pageW, pageH);
      } catch {
        /* a corrupt background must not fail issuance */
      }
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
    }

    // Logo — stored size is raw CSS px in the legacy markup (NOT canvas-scaled).
    if (logoUrl) {
      try {
        const w = (logo.width ?? 120) * PX_TO_PT;
        const h = (logo.height ?? 60) * PX_TO_PT;
        doc.addImage(
          logoUrl,
          imageFormat(logoUrl),
          (pageW * (logo.x ?? 50)) / 100 - w / 2,
          (pageH * (logo.y ?? 15)) / 100 - h / 2,
          w,
          h,
        );
      } catch {
        /* ignore */
      }
    }

    const drawText = (
      text: string,
      pl: Placement,
      opts: { bold?: boolean; italic?: boolean } = {},
    ) => {
      if (!text) return;
      const [r, g, b] = hexToRgb(pl.color);
      doc.setTextColor(r, g, b);
      doc.setFont('helvetica', opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal');
      doc.setFontSize(fontPt(pl.fontSize ?? 16));
      doc.text(text, (pageW * (pl.x ?? 50)) / 100, (pageH * (pl.y ?? 50)) / 100, {
        align: 'center',
        baseline: 'middle',
        maxWidth: pageW - 80,
      });
    };

    drawText(cert.learnerName || 'Learner', p.userName, { bold: true });
    drawText(cert.courseName || 'Course', p.courseName);
    drawText(issuedStr, p.date);

    // Signature sizing — legacy converts the stored preview px to a % of the
    // designer canvas, then applies that % to the page, with a floor so a tiny
    // stored placement never renders invisibly.
    const sigWPct = Math.max(((sig.width ?? 420) * SIG_SCALE) / PREV_W * 100, MIN_SIG_W_PCT);
    const sigHPct = Math.max(((sig.height ?? 150) * SIG_SCALE) / PREV_H * 100, MIN_SIG_H_PCT);
    const sigW = (pageW * sigWPct) / 100;
    const sigH = (pageH * sigHPct) / 100;

    if (sigHasPosition) {
      const sx = (pageW * (sig.x as number)) / 100;
      const sy = (pageH * (sig.y as number)) / 100;
      if (sigUrl) {
        try {
          doc.addImage(sigUrl, imageFormat(sigUrl), sx - sigW / 2, sy - sigH / 2, sigW, sigH);
        } catch {
          /* ignore */
        }
      }
      const signatory = template.signatoryName || '';
      if (signatory) {
        if (signatoryNamePlacement) {
          drawText(signatory, { ...signatoryNamePlacement }, { bold: true });
        } else if (sigUrl) {
          // Legacy fallback: just under the signature block, centred on its x.
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(fontPt(14));
          doc.setTextColor(0, 0, 0);
          doc.text(signatory, sx, sy + sigH / 2 + 12 * PX_TO_PT, { align: 'center', baseline: 'middle' });
        }
      }
      const designation = designationOverride || template.designation || '';
      if (designation) drawText(designation, p.designation, { italic: true });
    } else {
      // Unpositioned signature — legacy `.signature-section`: centred strip at
      // bottom:10% of the page.
      const blockBottom = pageH * 0.9;
      if (sigUrl) {
        try {
          doc.addImage(sigUrl, imageFormat(sigUrl), centerX - sigW / 2, blockBottom - sigH, sigW, sigH);
        } catch {
          /* ignore */
        }
      }
      let y = blockBottom + 10 * PX_TO_PT;
      const signatory = template.signatoryName || '';
      if (signatory) {
        const [r, g, b] = hexToRgb(signatoryNamePlacement?.color ?? '#000000');
        doc.setTextColor(r, g, b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontPt(signatoryNamePlacement?.fontSize ?? 14));
        doc.text(signatory, centerX, y, { align: 'center', baseline: 'middle' });
        y += fontPt(signatoryNamePlacement?.fontSize ?? 14) + 4 * PX_TO_PT;
      }
      const designation = designationOverride || template.designation || '';
      if (designation) {
        const [r, g, b] = hexToRgb(p.designation.color);
        doc.setTextColor(r, g, b);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(fontPt(p.designation.fontSize));
        doc.text(designation, centerX, y, { align: 'center', baseline: 'middle' });
      }
    }

    // QR — legacy: 80×80 CSS px, 20px from the bottom-right corner.
    try {
      const qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 160 });
      const qrSize = 80 * PX_TO_PT;
      const pad = 20 * PX_TO_PT;
      doc.addImage(qrDataUrl, 'PNG', pageW - pad - qrSize, pageH - pad - qrSize, qrSize, qrSize);
    } catch {
      /* QR is decorative; skip on failure */
    }

    return Buffer.from(doc.output('arraybuffer'));
  }

  // ── Fallback path — no template ────────────────────────────────────────────
  // The generic layout every certificate used to get regardless of its template.
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setDrawColor(79, 70, 229); // indigo
  doc.setLineWidth(4);
  doc.rect(24, 24, pageW - 48, pageH - 48);
  doc.setLineWidth(1);
  doc.rect(36, 36, pageW - 72, pageH - 72);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.setFontSize(34);
  doc.text('Certificate of Completion', centerX, 130, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(15);
  doc.text('This is proudly presented to', centerX, 185, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(30);
  doc.text(cert.learnerName || 'Learner', centerX, 235, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(15);
  doc.text('for successfully completing the course', centerX, 285, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(22);
  doc.text(cert.courseName || 'Course', centerX, 325, { align: 'center', maxWidth: pageW - 160 });

  if (typeof cert.score === 'number') {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(13);
    doc.text(`Score: ${Math.round(cert.score)}%`, centerX, 360, { align: 'center' });
  }

  const footerY = pageH - 80;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(12);
  doc.text(`Issued on ${issuedStr}`, 80, footerY);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Certificate ID: ${cert.certificateId}`, centerX, footerY, { align: 'center' });
  if (cert.verificationUrl) {
    doc.text(`Verify at: ${cert.verificationUrl}`, centerX, footerY + 16, { align: 'center', maxWidth: pageW - 320 });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 120 });
    doc.addImage(qrDataUrl, 'PNG', pageW - 160, footerY - 70, 90, 90);
  } catch {
    /* QR is decorative; skip on failure */
  }

  return Buffer.from(doc.output('arraybuffer'));
}

/** Load an issued certificate's template, or null when it has none / it is gone. */
export async function loadTemplateForIssued(cert: CertificateIssued): Promise<CertificateTemplate | null> {
  if (!cert.certificateTemplateId) return null;
  try {
    return await db.lmsCertificate.findUnique({ where: { id: cert.certificateTemplateId } });
  } catch {
    return null;
  }
}

const hasBase64Background = (t: { backgroundImageUrl?: string | null }) =>
  Boolean(t.backgroundImageUrl?.startsWith('data:'));

/**
 * Pick the template to REGENERATE an issued certificate against — port of the
 * candidate resolution in `regeneratePdfForIssuedCertificate`
 * (`certificates.service.ts:1376-1443`).
 *
 * This is deliberately NOT `loadTemplateForIssued`. Regeneration prefers the
 * tenant's CURRENT active template over the one the certificate was originally
 * issued against ("so old templates are never served" — controller:698), which
 * is why the legacy also re-points `certificateTemplateId` at the winner.
 *
 * Order (legacy, exactly): active + base64 → active → base64 → first → none.
 * `isActive` is primary; a base64 background is only a tie-breaker, because it
 * survives without `s3:GetObject` permission.
 */
export async function selectTemplateForIssued(cert: CertificateIssued): Promise<CertificateTemplate | null> {
  const candidates: CertificateTemplate[] = [];

  if (cert.orgId) {
    const assigned = await findAll(cert.orgId);
    assigned.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
    );
    candidates.push(...assigned);
  }
  if (cert.certificateTemplateId && !candidates.some((c) => c.id === cert.certificateTemplateId)) {
    const stored = await db.lmsCertificate.findUnique({ where: { id: cert.certificateTemplateId } });
    if (stored) candidates.push(stored);
  }

  const chosen =
    candidates.find((t) => t.isActive && hasBase64Background(t)) ||
    candidates.find((t) => t.isActive) ||
    candidates.find((t) => hasBase64Background(t)) ||
    candidates[0] ||
    null;
  if (!chosen) return null;

  // Legacy: if the chosen template's background fails to load, fall through to
  // another candidate that carries an embedded one rather than rendering a
  // background-less certificate (`certificates.service.ts:1435-1443`).
  if (!(await imageUrlToDataUrl(chosen.backgroundImageUrl))) {
    const fallback = candidates.find((t) => t.id !== chosen.id && hasBase64Background(t));
    if (fallback) return fallback;
  }
  return chosen;
}

/**
 * Render + upload a certificate's PDF and QR to S3, returning their permanent
 * urls. Port of the S3 half of `generateCertificate`
 * (`certificates.service.ts:514-546`), including the key prefixes.
 *
 * NEVER throws: the legacy wrapped this in try/catch and saved the issuance
 * record even when PDF generation or S3 upload failed, so a storage outage
 * cannot cost a learner their certificate. Returns empty strings on failure,
 * which the caller stores as undefined — exactly as the original did.
 */
async function renderAndUploadCertificateAssets(
  cert: CertificateIssued,
  template: CertificateTemplate | null,
  designationOverride?: string,
): Promise<{ pdfUrl: string; qrCodeUrl: string }> {
  try {
    const pdfBuffer = await buildCertificatePdf(cert, template, designationOverride);
    const pdfKey = `certificates/templates/generated/${cert.certificateId}.pdf`;
    await putObject(pdfKey, pdfBuffer, 'application/pdf');

    const qrTarget = cert.verificationUrl || `${FRONTEND_URL}/verify-certificate/${cert.certificateId}`;
    const qrDataUrl = await QRCode.toDataURL(qrTarget);
    const qrKey = `certificates/templates/qr/${cert.certificateId}.png`;
    await putObject(qrKey, Buffer.from(qrDataUrl.split(',')[1], 'base64'), 'image/png');

    return {
      pdfUrl: `https://storage.googleapis.com/${S3_BUCKET}/${pdfKey}`,
      qrCodeUrl: `https://storage.googleapis.com/${S3_BUCKET}/${qrKey}`,
    };
  } catch (error) {
    // Legacy: "PDF generation/upload failed … saving record without PDF".
    // The swallow is deliberate — a storage outage must not block issuance —
    // but it is now LOGGED. Silently returning '' is how certificates were
    // shipping with an empty pdfUrl for months without anyone noticing.
    console.error(
      `[certificates] asset upload failed for ${cert.certificateId}; issuing without PDF:`,
      error instanceof Error ? error.message : error,
    );
    return { pdfUrl: '', qrCodeUrl: '' };
  }
}

/**
 * Re-render an issued certificate against the tenant's CURRENT template, upload
 * it, and persist the new `pdfUrl` — port of `regeneratePdfForIssuedCertificate`
 * (`certificates.service.ts:1347-1535`).
 *
 * The legacy re-points `certificateTemplateId` at the template it actually drew
 * with, so the record reflects what was served. Reproduced here.
 *
 * The S3 upload + record update are best-effort exactly as in the legacy: the
 * buffer is returned even when storage fails, so `GET /:id/download` still hands
 * the learner a PDF during an S3 outage.
 */
async function renderIssuedCertificate(cert: CertificateIssued) {
  const template = await selectTemplateForIssued(cert);
  const buffer = await buildCertificatePdf(cert, template);
  let certificate = cert;

  try {
    const pdfKey = `certificates/templates/generated/${cert.certificateId}.pdf`;
    await putObject(pdfKey, buffer, 'application/pdf');
    certificate = await db.lmsCertificateIssued.update({
      where: { id: cert.id },
      data: {
        pdfUrl: `https://storage.googleapis.com/${S3_BUCKET}/${pdfKey}`,
        ...(template ? { certificateTemplateId: template.id } : {}),
      },
    });
  } catch (error) {
    // Legacy: "PDF buffer is still returned even if storage fails" — but log it,
    // so a persistent upload failure is visible rather than inferred later from
    // a table full of empty pdfUrls.
    console.error(
      `[certificates] re-render upload failed for ${cert.certificateId}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return { buffer, certificate };
}

export async function regeneratePdfForIssuedCertificate(id: string, orgId?: string | null) {
  const where: { id: string; orgId?: string } = { id };
  if (orgId) where.orgId = orgId;
  const cert = await db.lmsCertificateIssued.findFirst({ where });
  if (!cert) throw NotFound('Issued certificate not found');
  return renderIssuedCertificate(cert);
}

export async function regeneratePdfByCertificateId(certificateId: string) {
  const cert = await db.lmsCertificateIssued.findUnique({ where: { certificateId } });
  if (!cert) throw NotFound('Certificate not found');
  return renderIssuedCertificate(cert);
}

/**
 * Short-lived (1h) presigned S3 GET for an issued certificate's PDF — port of
 * `getPresignedDownloadUrl` (`certificates.service.ts:1563-1645`).
 *
 * Ownership is enforced in the QUERY (id + orgId + learnerId), so a caller who
 * does not own the certificate gets 'Certificate not found' rather than a url.
 *
 * DELIBERATE OMISSION: the legacy's `isValidObjectId` branch, which fell back to
 * probing three hardcoded `certificates/demo/*` keys for non-ObjectId ids. That
 * is Mongo id-format detection — under Postgres every id is a cuid, so the check
 * would send EVERY certificate down the demo path. Dropped as Mongo-specific,
 * not ported blindly (GAP_REPORT §3.2).
 */
export async function getPresignedDownloadUrl(id: string, orgId: string | null, learnerId: string): Promise<string> {
  if (!orgId) throw NotFound('Tenant ID is required');

  const cert = await db.lmsCertificateIssued.findFirst({ where: { id, orgId, learnerId } });
  if (!cert) throw NotFound('Certificate not found');
  if (!cert.pdfUrl) throw NotFound('Certificate PDF not found');

  // Legacy key extraction: everything after the first '.com/', else a
  // conventional path built from the public certificate id.
  //
  // GCS path-style urls put the BUCKET between the host and the key
  // (`storage.googleapis.com/<bucket>/<key>`), so the legacy split alone would
  // hand the bucket name back as part of the key and presign a path that does
  // not exist. Strip it for that form only; the virtual-host forms (GCS and
  // legacy S3) already have the key immediately after '.com/'.
  const parts = cert.pdfUrl.split('.com/');
  let key = parts.length > 1 ? parts[1] : `certificates/${cert.certificateId}.pdf`;
  if (parts.length > 1 && cert.pdfUrl.includes('storage.googleapis.com/')) {
    const slash = key.indexOf('/');
    if (slash > 0) key = key.slice(slash + 1);
  }
  return presignGet(key, 3600);
}

export type { CertificateApprovalStatus };
