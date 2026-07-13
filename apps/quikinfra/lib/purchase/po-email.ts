/**
 * PO email dispatch.
 *
 * Sibling of `rfq-email.ts`. Given an enriched PO row, builds a PDF
 * via `generatePoPdf` (Aakar letterhead template), composes a short
 * cover-email body, and ships it through the shared mailer to the
 * PO's vendor. Errors are logged per-send and never bubble — the
 * submit path doesn't want to rollback the approval because the
 * mailer hit an SMTP hiccup.
 */

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { findVendorsByIds } from "@/lib/masters/vendors-repository";
import {
  getPrimaryCompany,
  companyBillingAddress,
} from "@/lib/masters/companies-repository";
import { sendMail } from "@/lib/email/mailer";
import { generatePoPdf, type PoPdfLine } from "./po-pdf";

export interface SendPoEmailResult {
  sent: boolean;
  email: string | null;
  skippedReason?: string;
  error?: string;
}

/**
 * Preview payload shape — shared with the submit-preview modal so
 * "what you see is what goes out". Mirrors the RFQ preview shape
 * but simplified to a single recipient since a PO is always one
 * vendor.
 */
export interface PoPreviewItem {
  itemName: string;
  quantity: string;
  uomCode: string;
  specification: string | null;
}
export interface PoPreviewPayload {
  poNumber: string;
  projectName: string | null;
  termsBody: string | null;
  vendor: {
    vendorId: string;
    vendorName: string;
    email: string | null;
    itemCount: number;
    items: PoPreviewItem[];
    subject: string;
    htmlBody: string;
    skipReason: string | null;
  } | null;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function formatDate(raw: string | Date | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = parseInt(m[3], 10);
  const mon = MONTHS_SHORT[parseInt(m[2], 10) - 1] ?? "";
  return `${d} ${mon} ${m[1]}`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolve the T&C body to stamp on the PO PDF. The stored `po.
 * termsAndConditions` is already a snapshot from create-time, so we
 * prefer that; fall back to a Postgres lookup only when the snapshot
 * is empty.
 */
interface PoEmailLine {
  itemId?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  poQty?: number | string | null;
  quantity?: number | string | null;
  unitRate?: number | string | null;
  discount?: number | string | null;
  gstRate?: number | string | null;
  gstType?: string | null;
  igstAmount?: number | string | null;
  cgstAmount?: number | string | null;
  sgstAmount?: number | string | null;
  specification?: string | null;
}
interface PoEmailInput {
  poNumber?: string | null;
  poDate?: string | null;
  projectName?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  vendorEmail?: string | null;
  vendorGSTIN?: string | null;
  deliveryDate?: string | null;
  deliveryAddress?: string | null;
  paymentTerms?: string | null;
  purpose?: string | null;
  contactPerson?: string | null;
  contactMobile?: string | null;
  termsAndConditions?: string | null;
  termsTemplateId?: string | null;
  freightCharges?: number | string | null;
  otherCharges?: number | string | null;
  totalAmount?: number | string | null;
  totalIGST?: number | string | null;
  totalCGST?: number | string | null;
  totalSGST?: number | string | null;
  gstType?: string | null;
  lines?: PoEmailLine[] | null;
}
interface PoVendorMaster {
  name?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

async function resolveTermsBody(
  orgId: string,
  po: PoEmailInput,
): Promise<string | null> {
  if (po?.termsAndConditions && String(po.termsAndConditions).trim()) {
    return String(po.termsAndConditions);
  }
  const id = po?.termsTemplateId;
  if (id) {
    try {
      const row = await db.cnTermsCondition.findFirst({
        where: { id, orgId },
        select: { body: true },
      });
      if (row?.body) return String(row.body);
    } catch {
      /* best-effort */
    }
  }
  return null;
}

/**
 * Resolve the CGST/SGST/IGST breakup for the PDF totals block. Prefers
 * the per-line stored amounts (they always sum to the header figure);
 * falls back to the header `totalIGST/CGST/SGST` when the lines don't
 * carry the split. Returns all-zero when nothing is stored (legacy PO),
 * which makes the PDF fall back to a single combined GST row.
 */
function resolveGstSplit(po: PoEmailInput): {
  gstType: string | null;
  igst: number;
  cgst: number;
  sgst: number;
} {
  let igst = 0;
  let cgst = 0;
  let sgst = 0;
  for (const l of po.lines ?? []) {
    igst += parseFloat(String(l.igstAmount ?? "0")) || 0;
    cgst += parseFloat(String(l.cgstAmount ?? "0")) || 0;
    sgst += parseFloat(String(l.sgstAmount ?? "0")) || 0;
  }
  if (igst + cgst + sgst === 0) {
    igst = parseFloat(String(po.totalIGST ?? "0")) || 0;
    cgst = parseFloat(String(po.totalCGST ?? "0")) || 0;
    sgst = parseFloat(String(po.totalSGST ?? "0")) || 0;
  }
  const gstType = po.gstType ?? (igst > 0 ? "IGST" : "CGST+SGST");
  return { gstType, igst, cgst, sgst };
}

function emailBodyHtml(po: PoEmailInput, vendorName: string): string {
  const RUPEE = "\u20B9";
  const grand = parseFloat(String(po.totalAmount ?? "0")) || 0;
  const contact = po.contactPerson || "";
  const mobile = po.contactMobile || "";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55">
      <p>Dear ${escapeHtml(vendorName || "Sir/Madam")},</p>
      <p>
        Please find attached our Purchase Order
        <strong>${escapeHtml(po.poNumber ?? "")}</strong>${
          po.projectName
            ? ` for project <strong>${escapeHtml(po.projectName)}</strong>`
            : ""
        }, dated
        <strong>${escapeHtml(formatDate(po.poDate))}</strong>.
      </p>
      <p>
        Total order value:
        <strong>${RUPEE}${grand.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
        (inclusive of taxes). Kindly confirm receipt and proceed with
        supply as per the terms on the attached PDF${
          po.deliveryDate
            ? `, with delivery on or before <strong>${escapeHtml(formatDate(po.deliveryDate))}</strong>`
            : ""
        }.
      </p>
      <p>
        For any clarifications, please reach out to
        ${contact ? `<strong>${escapeHtml(contact)}</strong>` : "our team"}
        ${mobile ? ` at <strong>${escapeHtml(mobile)}</strong>` : ""}.
      </p>
      <p>Thank you.</p>
      <p style="margin-top:22px;color:#555">
        Regards,<br/>
        <strong>Aakar Constructions</strong><br/>
        Engineers / Builders / Contractors
      </p>
    </div>
  `;
}

function linesToPdfRows(lines: PoEmailLine[]): PoPdfLine[] {
  return lines.map((l) => ({
    description: [l.itemName, l.specification]
      .filter((x) => x && String(x).trim())
      .join(" — "),
    qty: String(l.poQty ?? l.quantity ?? "0"),
    unit: String(l.uomCode ?? "—"),
    rate: parseFloat(String(l.unitRate ?? "0")) || 0,
    discountPct: parseFloat(String(l.discount ?? "0")) || 0,
  }));
}

function subjectFor(po: PoEmailInput): string {
  return `Purchase Order — ${po.poNumber ?? ""}${
    po.projectName ? ` (${po.projectName})` : ""
  }`;
}

/**
 * Builds the preview payload shown by the submit-confirm modal
 * before the PO is sent for approval. Uses the exact same email
 * body + terms resolution as the real send path so what the user
 * sees here is byte-for-byte what ends up in the vendor's inbox.
 */
export async function buildPoPreview(
  orgId: string,
  po: PoEmailInput,
): Promise<PoPreviewPayload> {
  const termsBody = await resolveTermsBody(orgId, po);
  const lines: PoEmailLine[] = Array.isArray(po?.lines) ? po.lines : [];

  if (!po?.vendorId) {
    return {
      poNumber: po?.poNumber ?? "",
      projectName: po?.projectName ?? null,
      termsBody,
      vendor: null,
    };
  }

  // Pull the vendor master for email fallback — the stored PO row
  // may only carry `vendorEmail` on newer rows.
  let master: PoVendorMaster | null = null;
  try {
    const map = await findVendorsByIds(orgId, [po.vendorId]);
    master = map.get(po.vendorId) ?? null;
  } catch {
    /* best-effort */
  }

  const email = (po.vendorEmail || master?.email || "").trim() || null;
  const vendorName =
    po.vendorName || master?.companyName || master?.name || "Vendor";
  const items: PoPreviewItem[] = lines.map((l) => ({
    itemName: l.itemName ?? l.itemId ?? "—",
    quantity: String(l.poQty ?? l.quantity ?? "—"),
    uomCode: String(l.uomCode ?? "—"),
    specification: l.specification ?? null,
  }));

  let skipReason: string | null = null;
  if (!email) skipReason = "no email address";
  else if (items.length === 0) skipReason = "no line items";

  return {
    poNumber: po?.poNumber ?? "",
    projectName: po?.projectName ?? null,
    termsBody,
    vendor: {
      vendorId: po.vendorId,
      vendorName,
      email,
      itemCount: items.length,
      items,
      subject: subjectFor(po),
      htmlBody: emailBodyHtml(po, vendorName),
      skipReason,
    },
  };
}

/**
 * Generates the PO PDF exactly as `sendPoEmailToVendor` would
 * attach it to the email. Returns `null` when the PO has no vendor
 * or no line items — the caller renders the skip reason instead.
 */
export async function buildPoPreviewPdf(
  orgId: string,
  po: PoEmailInput,
): Promise<Buffer | null> {
  const lines: PoEmailLine[] = Array.isArray(po?.lines) ? po.lines : [];
  if (!po?.vendorId || lines.length === 0) return null;

  let master: PoVendorMaster | null = null;
  try {
    const map = await findVendorsByIds(orgId, [po.vendorId]);
    master = map.get(po.vendorId) ?? null;
  } catch {
    /* best-effort */
  }
  const termsBody = await resolveTermsBody(orgId, po);
  const company = await getPrimaryCompany(orgId);

  // Same totals roll-up used by the real send path — keep the two
  // in sync so the preview never drifts from what gets delivered.
  let gross = 0;
  let lineDisc = 0;
  let taxAmt = 0;
  for (const l of lines) {
    const q = parseFloat(String(l.poQty ?? l.quantity ?? "0")) || 0;
    const r = parseFloat(String(l.unitRate ?? "0")) || 0;
    const d = parseFloat(String(l.discount ?? "0")) || 0;
    const g = parseFloat(String(l.gstRate ?? "0")) || 0;
    const grossLine = q * r;
    const afterDisc = grossLine - (grossLine * d) / 100;
    gross += grossLine;
    lineDisc += grossLine - afterDisc;
    taxAmt += (afterDisc * g) / 100;
  }
  const freight = parseFloat(String(po.freightCharges ?? "0")) || 0;
  const otherCharges = parseFloat(String(po.otherCharges ?? "0")) || 0;
  const netSubtotal = gross - lineDisc;
  const grandTotal =
    parseFloat(String(po.totalAmount ?? "0")) ||
    netSubtotal + taxAmt + freight + otherCharges;
  const gstSplit = resolveGstSplit(po);

  return generatePoPdf({
    po: {
      poNumber: po.poNumber ?? "",
      poDate: po.poDate ?? "",
      deliveryDate: po.deliveryDate ?? null,
      projectName: po.projectName ?? null,
      purpose: po.purpose ?? null,
      contactPerson: po.contactPerson ?? null,
      contactMobile: po.contactMobile ?? null,
      paymentTerms: po.paymentTerms ?? null,
      deliveryAddress: po.deliveryAddress ?? null,
      buyerName: company?.name || null,
      buyerBillingAddress: companyBillingAddress(company),
      buyerGstin: company?.gstin || null,
    },
    vendor: {
      vendorName:
        po.vendorName || master?.companyName || master?.name || "Vendor",
      email: po.vendorEmail || master?.email || null,
      gstin: po.vendorGSTIN || master?.gstin || null,
      address:
        [master?.address, master?.city, master?.state, master?.pincode]
          .filter((x) => x && String(x).trim())
          .join(", ") || null,
      contactPerson: master?.contactPerson ?? null,
      phone: master?.phone ?? null,
    },
    items: linesToPdfRows(lines),
    totals: {
      amount: gross,
      discount: lineDisc,
      net: netSubtotal,
      gst: taxAmt,
      otherCharges,
      freight,
      grandTotal,
      gstType: gstSplit.gstType,
      igst: gstSplit.igst,
      cgst: gstSplit.cgst,
      sgst: gstSplit.sgst,
    },
    termsBody,
  });
}

export interface SendPoEmailOptions {
  /**
   * Optional HTML override for the cover-email body. When provided,
   * skips the default `emailBodyHtml(po, vendorName)` template and
   * sends this string verbatim — used when the buyer has edited the
   * preview in the Submit-PO modal.
   */
  emailHtmlBody?: string | null;
}

export async function sendPoEmailToVendor(
  orgId: string,
  po: PoEmailInput,
  options?: SendPoEmailOptions,
): Promise<SendPoEmailResult> {
  const vendorId = po?.vendorId;
  if (!vendorId) {
    return { sent: false, email: null, skippedReason: "PO has no vendor" };
  }

  // Pull the vendor master for GSTIN / phone / full address details
  // that the PDF needs for the supplier block.
  let master: PoVendorMaster | null = null;
  try {
    const map = await findVendorsByIds(orgId, [vendorId]);
    master = map.get(vendorId) ?? null;
  } catch {
    /* best-effort — vendor master read failures shouldn't block */
  }

  const email = (po.vendorEmail || master?.email || "").trim();
  if (!email) {
    return { sent: false, email: null, skippedReason: "Vendor has no email" };
  }

  const termsBody = await resolveTermsBody(orgId, po);

  // Per-line totals roll up to the header numbers rendered on the
  // PDF's totals block. Re-derive them here so the PDF stays honest
  // even when the stored header figures lag (e.g. legacy rows).
  let gross = 0;
  let lineDisc = 0;
  let taxAmt = 0;
  for (const l of po.lines ?? []) {
    const q = parseFloat(String(l.poQty ?? l.quantity ?? "0")) || 0;
    const r = parseFloat(String(l.unitRate ?? "0")) || 0;
    const d = parseFloat(String(l.discount ?? "0")) || 0;
    const g = parseFloat(String(l.gstRate ?? "0")) || 0;
    const grossLine = q * r;
    const afterDisc = grossLine - (grossLine * d) / 100;
    gross += grossLine;
    lineDisc += grossLine - afterDisc;
    taxAmt += (afterDisc * g) / 100;
  }
  const freight = parseFloat(String(po.freightCharges ?? "0")) || 0;
  const otherCharges = parseFloat(String(po.otherCharges ?? "0")) || 0;
  const netSubtotal = gross - lineDisc;
  const grandTotal =
    parseFloat(String(po.totalAmount ?? "0")) ||
    netSubtotal + taxAmt + freight + otherCharges;
  const gstSplit = resolveGstSplit(po);
  const company = await getPrimaryCompany(orgId);

  try {
    const pdf = await generatePoPdf({
      po: {
        poNumber: po.poNumber ?? "",
        poDate: po.poDate ?? "",
        deliveryDate: po.deliveryDate ?? null,
        projectName: po.projectName ?? null,
        purpose: po.purpose ?? null,
        contactPerson: po.contactPerson ?? null,
        contactMobile: po.contactMobile ?? null,
        paymentTerms: po.paymentTerms ?? null,
        deliveryAddress: po.deliveryAddress ?? null,
        // Buyer identity comes from the org's own company record
        // (Masters → Company), not a hardcoded constant.
        buyerName: company?.name || null,
        buyerBillingAddress: companyBillingAddress(company),
        buyerGstin: company?.gstin || null,
      },
      vendor: {
        vendorName:
          po.vendorName ||
          master?.companyName ||
          master?.name ||
          "Vendor",
        email,
        gstin: po.vendorGSTIN || master?.gstin || null,
        address:
          [master?.address, master?.city, master?.state, master?.pincode]
            .filter((x) => x && String(x).trim())
            .join(", ") || null,
        contactPerson: master?.contactPerson ?? null,
        phone: master?.phone ?? null,
      },
      items: linesToPdfRows(po.lines ?? []),
      totals: {
        amount: gross,
        discount: lineDisc,
        net: netSubtotal,
        gst: taxAmt,
        otherCharges,
        freight,
        grandTotal,
        gstType: gstSplit.gstType,
        igst: gstSplit.igst,
        cgst: gstSplit.cgst,
        sgst: gstSplit.sgst,
      },
      termsBody,
    });

    const safeNo = String(po.poNumber ?? "po").replace(/[^A-Za-z0-9_-]+/g, "_");
    const overrideHtml =
      typeof options?.emailHtmlBody === "string" &&
      options.emailHtmlBody.trim().length > 0
        ? options.emailHtmlBody
        : null;
    const res = await sendMail({
      to: email,
      subject: `Purchase Order — ${po.poNumber ?? ""}${
        po.projectName ? ` (${po.projectName})` : ""
      }`,
      html:
        overrideHtml ??
        emailBodyHtml(
          po,
          po.vendorName || master?.companyName || master?.name || "Vendor",
        ),
      attachments: [
        { filename: `${safeNo}.pdf`, content: pdf, contentType: "application/pdf" },
      ],
    });

    if (res.success) return { sent: true, email };
    return { sent: false, email, error: res.error ?? "send failed" };
  } catch (e: unknown) {
    return {
      sent: false,
      email,
      error: toErrorMessage(e),
    };
  }
}

/**
 * Cancellation email — sent when a PO is closed via the detail-page
 * "Close PO" action (typically because the delivery date passed
 * without a complete GRN). The buyer's typed `reason` is included
 * verbatim so the vendor sees exactly why the PO is being killed.
 *
 * No PDF attached — this is a heads-up, not a contract document.
 * Errors never bubble; the close write has already committed and we
 * don't want a flaky SMTP server to surface as a 500 from the close
 * endpoint.
 */
export async function sendPoCancellationEmailToVendor(
  orgId: string,
  po: PoEmailInput,
  reason: string,
): Promise<SendPoEmailResult> {
  const vendorId = po?.vendorId;
  if (!vendorId) {
    return { sent: false, email: null, skippedReason: "PO has no vendor" };
  }

  let master: PoVendorMaster | null = null;
  try {
    const map = await findVendorsByIds(orgId, [vendorId]);
    master = map.get(vendorId) ?? null;
  } catch {
    /* best-effort */
  }

  const email = (po.vendorEmail || master?.email || "").trim();
  if (!email) {
    return { sent: false, email: null, skippedReason: "Vendor has no email" };
  }

  const vendorName =
    po.vendorName || master?.companyName || master?.name || "Sir/Madam";
  const contact = po.contactPerson || "";
  const mobile = po.contactMobile || "";

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55">
      <p>Dear ${escapeHtml(vendorName)},</p>
      <p>
        We are writing to inform you that our Purchase Order
        <strong>${escapeHtml(po.poNumber ?? "")}</strong>${
          po.projectName
            ? ` for project <strong>${escapeHtml(po.projectName)}</strong>`
            : ""
        }, dated <strong>${escapeHtml(formatDate(po.poDate))}</strong>${
          po.deliveryDate
            ? ` with planned delivery on <strong>${escapeHtml(formatDate(po.deliveryDate))}</strong>`
            : ""
        }, has been <strong>cancelled</strong>.
      </p>
      <p style="margin:18px 0 6px"><strong>Reason for cancellation:</strong></p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #ea580c;padding:12px 14px;border-radius:6px;color:#7c2d12;white-space:pre-wrap">${escapeHtml(reason)}</div>
      <p style="margin-top:18px">
        Please treat this as the formal notice of cancellation. You are
        not required to proceed with supply against this PO. If you have
        already incurred costs or have stock allocated to this order,
        kindly reach out so we can discuss next steps.
      </p>
      <p>
        For any clarifications, please contact
        ${contact ? `<strong>${escapeHtml(contact)}</strong>` : "our team"}
        ${mobile ? ` at <strong>${escapeHtml(mobile)}</strong>` : ""}.
      </p>
      <p>We regret any inconvenience caused.</p>
      <p style="margin-top:22px;color:#555">
        Regards,<br/>
        <strong>Aakar Constructions</strong><br/>
        Engineers / Builders / Contractors
      </p>
    </div>
  `;

  try {
    const res = await sendMail({
      to: email,
      subject: `Purchase Order Cancelled — ${po.poNumber ?? ""}${
        po.projectName ? ` (${po.projectName})` : ""
      }`,
      html,
    });
    if (res.success) return { sent: true, email };
    return { sent: false, email, error: res.error ?? "send failed" };
  } catch (e: unknown) {
    return {
      sent: false,
      email,
      error: toErrorMessage(e),
    };
  }
}
