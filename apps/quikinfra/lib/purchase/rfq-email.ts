/**
 * RFQ email dispatch.
 *
 * Given an enriched RFQ + its vendors, builds a per-vendor PDF using
 * `generateRfqPdf` (with the Aakar letterhead as the template) and
 * emails it through the shared mailer.
 *
 * Errors are reported per-vendor — one bad email address doesn't block
 * the others. The caller decides whether to surface them in the API
 * response or just log them.
 */

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { findVendorsByIds } from "@/lib/masters/vendors-repository";
import { sendMail } from "@/lib/email/mailer";
import { generateRfqPdf, type RfqPdfLine } from "./rfq-pdf";

export interface SendRfqEmailsResult {
  sent: string[];
  skipped: Array<{ vendorId: string; reason: string }>;
  failed: Array<{ vendorId: string; email: string; error: string }>;
}

export interface RfqPreviewItem {
  itemName: string;
  quantity: string;
  uomCode: string;
  specification: string | null;
}

export interface RfqPreviewVendor {
  /** RFQ vendor row id — the identity key. Two rows can share the same
   *  `vendorId` (same vendor added twice), so this is what callers must
   *  key state/lookups on, not `vendorId`. */
  id: string;
  vendorId: string;
  vendorName: string;
  email: string | null;
  itemCount: number;
  items: RfqPreviewItem[];
  subject: string;
  htmlBody: string;
  /** Non-null if this vendor would be skipped at send time. */
  skipReason: string | null;
}

export interface RfqPreviewPayload {
  rfqNumber: string;
  projectName: string | null;
  termsBody: string | null;
  vendors: RfqPreviewVendor[];
}

/**
 * `assignedItemIds` is stored as row-index keys (`row-0`, `row-1`, …)
 * — see the drawer in `app/(dashboard)/purchase/rfqs/page.tsx`. An empty
 * array means "send all materials to this vendor".
 */
interface RfqEmailLine {
  itemId?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  qtyRequested?: number | string | null;
  quantity?: number | string | null;
  specification?: string | null;
}
interface RfqEmailVendor {
  /** Unique id of THIS vendor row (`Rfq_vendors.id`) — the same vendor
   *  can legitimately be added to an RFQ more than once (e.g. split
   *  across two item subsets with different terms), so `vendorId`
   *  alone is not a safe identity key for a row. */
  id?: string;
  vendorId: string;
  vendorName?: string | null;
  email?: string | null;
  assignedItemIds?: string[] | null;
  /** Per-vendor T&C override — empty/absent means "use the RFQ default". */
  termsAndConditions?: string | null;
}
interface RfqEmailInput {
  rfqNumber?: string | null;
  rfqDate?: string | null;
  dueDate?: string | null;
  projectName?: string | null;
  purpose?: string | null;
  contactPerson?: string | null;
  contactMobile?: string | null;
  address?: string | null;
  termsTemplateId?: string | null;
  termsAndConditions?: string | null;
  lines?: RfqEmailLine[] | null;
  vendors?: RfqEmailVendor[] | null;
}

function resolveLinesForVendor(
  assignedItemIds: string[] | null | undefined,
  allLines: RfqEmailLine[],
): RfqEmailLine[] {
  if (!Array.isArray(assignedItemIds) || assignedItemIds.length === 0) {
    return allLines;
  }
  const indices = new Set<number>();
  for (const id of assignedItemIds) {
    const m = /^row-(\d+)$/.exec(String(id));
    if (m) indices.add(parseInt(m[1], 10));
  }
  if (indices.size === 0) return allLines;
  return allLines.filter((_, idx) => indices.has(idx));
}

function linesToPdfRows(lines: RfqEmailLine[]): RfqPdfLine[] {
  return lines.map((l) => ({
    description: [l.itemName, l.specification]
      .filter((x) => x && String(x).trim())
      .join(" — "),
    qty: String(l.quantity ?? l.qtyRequested ?? "—"),
    unit: String(l.uomCode ?? "—"),
  }));
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a date string (expected ISO "YYYY-MM-DD" from the enriched
 * RFQ row) as "24 Apr 2026" — unambiguous, locale-neutral, and
 * matches how Indian business documents typically render dates.
 *
 * Returns the raw input untouched if it can't be parsed so we never
 * hide a bad value behind a silent fallback.
 */
function formatDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (monthIdx < 0 || monthIdx > 11 || !day) return s;
  return `${day} ${MONTHS_SHORT[monthIdx]} ${year}`;
}

function emailBodyHtml(rfq: RfqEmailInput, vendorName: string): string {
  const contact = rfq.contactPerson || "";
  const mobile = rfq.contactMobile || "";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55">
      <p>Dear ${escapeHtml(vendorName || "Sir/Madam")},</p>
      <p>
        Please find attached our Request for Quotation
        <strong>${escapeHtml(rfq.rfqNumber ?? "")}</strong>${
          rfq.projectName
            ? ` for project <strong>${escapeHtml(rfq.projectName)}</strong>`
            : ""
        }.
      </p>
      <p>
        Kindly review the list of materials in the attached PDF and share
        your best quotation against each item. Your quote should include
        applicable GST and any other taxes, along with delivery lead time
        and quote validity.
      </p>
      <p>
        For any clarifications, please reach out to
        ${contact ? `<strong>${escapeHtml(contact)}</strong>` : "our team"}
        ${mobile ? ` at <strong>${escapeHtml(mobile)}</strong>` : ""}.
      </p>
      <p style="margin-top:22px;color:#555">
        Regards,<br/>
        <strong>Aakar Constructions</strong><br/>
        Engineers / Builders / Contractors
      </p>
    </div>
  `;
}

/**
 * Look the T&C template up in Postgres by id. Returns `null` when the
 * id doesn't resolve — the caller falls back to tenant-default lookup.
 */
async function findTermsBodyById(orgId: string, id: string): Promise<string | null> {
  try {
    const row = await db.cnTermsCondition.findFirst({
      where: { id, orgId },
      select: { body: true },
    });
    return row?.body ? String(row.body) : null;
  } catch {
    return null;
  }
}

/**
 * Pick the active T&C template for this tenant that should attach to an
 * RFQ. Preference order:
 *   1. active + applicableTo=rfq + isDefault
 *   2. active + applicableTo=rfq (most recently updated)
 *   3. active + applicableTo=general + isDefault
 *   4. active + applicableTo=general (most recently updated)
 *
 * Falls back to `null` so the PDF generator uses its built-in default
 * list — prevents a missing T&C master from blocking RFQ dispatch.
 */
async function resolveRfqTerms(orgId: string): Promise<string | null> {
  const base = { orgId, status: "active" as const };
  const tiers = [
    { ...base, applicableTo: "rfq", isDefault: true },
    { ...base, applicableTo: "rfq" },
    { ...base, applicableTo: "general", isDefault: true },
    { ...base, applicableTo: "general" },
  ];
  for (const where of tiers) {
    const row = await db.cnTermsCondition.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
      select: { body: true },
    });
    if (row?.body) return String(row.body);
  }
  return null;
}

/**
 * Body to stamp on a vendor's copy of this RFQ's PDF. Preference order:
 *   1. That vendor's own T&C override (edited specifically for them —
 *      never touches the master or the RFQ default).
 *   2. The per-RFQ `termsAndConditions` snapshot — what the raiser saw
 *      (and possibly edited) on the create drawer.
 *   3. The picked template, then the tenant default — legacy rows
 *      created before the snapshot columns existed.
 */
async function resolveTermsBodyForRfq(
  orgId: string,
  rfq: { termsAndConditions?: unknown; termsTemplateId?: unknown } | null,
  vendor?: { termsAndConditions?: unknown } | null,
): Promise<string | null> {
  const vendorOverride = vendor?.termsAndConditions;
  if (vendorOverride && String(vendorOverride).trim()) {
    return String(vendorOverride);
  }
  const snapshot = rfq?.termsAndConditions;
  if (snapshot && String(snapshot).trim()) return String(snapshot);
  const picked = rfq?.termsTemplateId
    ? await findTermsBodyById(orgId, String(rfq.termsTemplateId))
    : null;
  return picked ?? (await resolveRfqTerms(orgId));
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function subjectFor(rfq: RfqEmailInput): string {
  return `Request for Quotation — ${rfq.rfqNumber ?? ""}${
    rfq.projectName ? ` (${rfq.projectName})` : ""
  }`;
}

/**
 * Builds preview metadata for all vendors on this RFQ — subject, rendered
 * HTML body, per-vendor item list, and any skip reasons that would apply
 * if the email were dispatched right now. Uses the exact same resolution
 * logic as `sendRfqEmailsToVendors` so the preview matches what gets sent.
 */
export async function buildRfqPreview(
  orgId: string,
  rfq: RfqEmailInput,
): Promise<RfqPreviewPayload> {
  const vendors: RfqEmailVendor[] = Array.isArray(rfq?.vendors) ? rfq.vendors : [];
  const allLines: RfqEmailLine[] = Array.isArray(rfq?.lines) ? rfq.lines : [];

  const vendorIds = vendors
    .map((v) => v.vendorId)
    .filter((id): id is string => !!id);
  const vendorMasters = await findVendorsByIds(orgId, vendorIds);

  const termsBody = await resolveTermsBodyForRfq(orgId, rfq);

  const subject = subjectFor(rfq);

  const out: RfqPreviewVendor[] = vendors.map((v) => {
    const master = v.vendorId ? vendorMasters.get(v.vendorId) : null;
    const email = (v.email || master?.email || "").trim() || null;
    const vendorName =
      v.vendorName || master?.name || master?.companyName || "Vendor";

    const picked = resolveLinesForVendor(v.assignedItemIds, allLines);
    const items: RfqPreviewItem[] = picked.map((l) => ({
      itemName: l.itemName ?? l.itemId ?? "—",
      quantity: String(l.quantity ?? l.qtyRequested ?? "—"),
      uomCode: String(l.uomCode ?? "—"),
      specification: l.specification ?? null,
    }));

    let skipReason: string | null = null;
    if (!email) skipReason = "no email address";
    else if (picked.length === 0) skipReason = "no items assigned";

    return {
      id: v.id ?? v.vendorId ?? "",
      vendorId: v.vendorId ?? "",
      vendorName,
      email,
      itemCount: picked.length,
      items,
      subject,
      htmlBody: emailBodyHtml(rfq, vendorName),
      skipReason,
    };
  });

  return {
    rfqNumber: rfq?.rfqNumber ?? "",
    projectName: rfq?.projectName ?? null,
    termsBody,
    vendors: out,
  };
}

/**
 * Generates the per-vendor PDF exactly as `sendRfqEmailsToVendors` would
 * attach it to the email. Returns `null` if the row isn't on the RFQ or
 * has no items to send.
 *
 * Matches on the RFQ vendor ROW id (`rowId`) when given — required to
 * disambiguate when the same vendor was added to the RFQ more than
 * once (different item subsets / different T&C per row). `vendorId` is
 * accepted as a legacy fallback (matches the FIRST row with that
 * vendor) for callers that don't have a specific row in hand.
 */
export async function buildRfqPreviewPdfForVendor(
  orgId: string,
  rfq: RfqEmailInput,
  target: { rowId?: string | null; vendorId?: string | null },
): Promise<Buffer | null> {
  const vendors: RfqEmailVendor[] = Array.isArray(rfq?.vendors) ? rfq.vendors : [];
  const v = target.rowId
    ? vendors.find((x) => String(x.id) === String(target.rowId))
    : vendors.find((x) => String(x.vendorId) === String(target.vendorId));
  if (!v) return null;

  const vendorMasters = await findVendorsByIds(orgId, [v.vendorId]);
  const master = vendorMasters.get(v.vendorId) ?? null;

  const termsBody = await resolveTermsBodyForRfq(orgId, rfq, v);

  const allLines: RfqEmailLine[] = Array.isArray(rfq?.lines) ? rfq.lines : [];
  const picked = resolveLinesForVendor(v.assignedItemIds, allLines);
  if (picked.length === 0) return null;

  const email = (v.email || master?.email || "").trim();
  const vendorName =
    v.vendorName || master?.name || master?.companyName || "Vendor";

  return generateRfqPdf({
    rfq: {
      rfqNumber: rfq.rfqNumber ?? "",
      rfqDate: formatDate(rfq.rfqDate) || (rfq.rfqDate ?? ""),
      dueDate: formatDate(rfq.dueDate) || rfq.dueDate || null,
      projectName: rfq.projectName ?? null,
      purpose: rfq.purpose ?? null,
      contactPerson: rfq.contactPerson ?? null,
      contactMobile: rfq.contactMobile ?? null,
      address: rfq.address ?? null,
    },
    vendor: {
      vendorName,
      email: email || null,
      gstin: master?.gstin ?? null,
      address:
        [master?.address, master?.city, master?.state, master?.pincode]
          .filter((x) => x && String(x).trim())
          .join(", ") || null,
      contactPerson: master?.contactPerson ?? null,
      phone: master?.phone ?? null,
    },
    items: linesToPdfRows(picked),
    termsBody,
  });
}

export interface SendRfqEmailsOptions {
  /**
   * Optional per-vendor HTML overrides for the cover-email body. Keyed
   * by the RFQ vendor ROW id (`v.id`), NOT `vendorId` — the same
   * vendor can be added to an RFQ more than once (different item
   * subsets / different T&C per row), so `vendorId` alone would let
   * one row's edit leak onto another row for the same vendor. When an
   * entry exists and is non-empty, that row receives the override
   * verbatim instead of the default `emailBodyHtml(rfq, vendorName)`
   * template — used by the Submit-RFQ preview modal once the buyer
   * has tweaked an individual email.
   */
  emailHtmlBodies?: Record<string, string> | null;
}

export async function sendRfqEmailsToVendors(
  orgId: string,
  rfq: RfqEmailInput,
  options?: SendRfqEmailsOptions,
): Promise<SendRfqEmailsResult> {
  const result: SendRfqEmailsResult = { sent: [], skipped: [], failed: [] };
  const vendors: RfqEmailVendor[] = Array.isArray(rfq?.vendors) ? rfq.vendors : [];
  if (vendors.length === 0) return result;

  // Master lookup in one shot so every vendor email has full
  // supplier-side info (GSTIN, address, phone) on the PDF — those
  // fields aren't stored on `cn_rfq_vendors`.
  const vendorIds = vendors
    .map((v) => v.vendorId)
    .filter((id): id is string => !!id);
  const vendorMasters = await findVendorsByIds(orgId, vendorIds);

  const allLines: RfqEmailLine[] = Array.isArray(rfq.lines) ? rfq.lines : [];

  for (const v of vendors) {
    // Resolved per vendor — preference:
    //   1. That vendor's own T&C override (edited specifically for
    //      them; the master and the RFQ default stay untouched).
    //   2. The per-RFQ snapshot saved from the create drawer.
    //   3. The picked template, then a tenant-level default — legacy
    //      rows created before the snapshot columns existed.
    //   4. The PDF generator's built-in default list (null here).
    const termsBody = await resolveTermsBodyForRfq(orgId, rfq, v);
    const master = v.vendorId ? vendorMasters.get(v.vendorId) : null;
    const email = (v.email || master?.email || "").trim();
    const vendorName =
      v.vendorName || master?.name || master?.companyName || "Vendor";
    if (!email) {
      result.skipped.push({
        vendorId: v.vendorId ?? "(unknown)",
        reason: "no email address",
      });
      continue;
    }

    const pickedLines = resolveLinesForVendor(v.assignedItemIds, allLines);
    if (pickedLines.length === 0) {
      result.skipped.push({
        vendorId: v.vendorId ?? "(unknown)",
        reason: "no items assigned",
      });
      continue;
    }

    try {
      const pdf = await generateRfqPdf({
        rfq: {
          rfqNumber: rfq.rfqNumber ?? "",
          rfqDate: formatDate(rfq.rfqDate) || (rfq.rfqDate ?? ""),
          dueDate: formatDate(rfq.dueDate) || rfq.dueDate || null,
          projectName: rfq.projectName ?? null,
          purpose: rfq.purpose ?? null,
          contactPerson: rfq.contactPerson ?? null,
          contactMobile: rfq.contactMobile ?? null,
          address: rfq.address ?? null,
        },
        vendor: {
          vendorName,
          email,
          gstin: master?.gstin ?? null,
          address:
            [master?.address, master?.city, master?.state, master?.pincode]
              .filter((x) => x && String(x).trim())
              .join(", ") || null,
          contactPerson: master?.contactPerson ?? null,
          phone: master?.phone ?? null,
        },
        items: linesToPdfRows(pickedLines),
        termsBody,
      });

      const safeNo = String(rfq.rfqNumber ?? "rfq").replace(/[^A-Za-z0-9_-]+/g, "_");
      const filename = `${safeNo}.pdf`;

      const overrideHtml =
        v.id && options?.emailHtmlBodies
          ? options.emailHtmlBodies[v.id]
          : undefined;
      const html =
        typeof overrideHtml === "string" && overrideHtml.trim().length > 0
          ? overrideHtml
          : emailBodyHtml(rfq, vendorName);

      const res = await sendMail({
        to: email,
        subject: subjectFor(rfq),
        html,
        attachments: [
          {
            filename,
            content: pdf,
            contentType: "application/pdf",
          },
        ],
      });

      if (res.success) {
        result.sent.push(email);
      } else {
        result.failed.push({
          vendorId: v.vendorId ?? "(unknown)",
          email,
          error: res.error ?? "send failed",
        });
      }
    } catch (e: unknown) {
      result.failed.push({
        vendorId: v.vendorId ?? "(unknown)",
        email,
        error: toErrorMessage(e),
      });
    }
  }

  return result;
}
