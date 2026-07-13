import { requireApiContext } from "@/lib/api/auth";
import { errorMessage, fail, ok } from "@/lib/api/responses";
import { ensureContact } from "@/lib/imports/processors";
import { assertPeriodUnlocked } from "@/lib/period-locks";

export const dynamic = "force-dynamic";

function sequence(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  try {
    const { data: document, error: documentError } = await auth.context.db
      .from("ocr_documents")
      .select("id, document_type, source_name, extracted_fields, status")
      .eq("org_id", auth.context.orgId)
      .eq("id", params.id)
      .single();

    if (documentError || !document) {
      return fail(404, { code: "OCR_NOT_FOUND", message: "OCR document not found." });
    }

    if (document.document_type !== "bill") {
      return fail(422, { code: "UNSUPPORTED_DOCUMENT_TYPE", message: "Only OCR bills can be converted into vendor bills." });
    }

    const extracted = (document.extracted_fields ?? {}) as Record<string, unknown>;
    const issueDate = typeof extracted.issue_date === "string" && extracted.issue_date ? extracted.issue_date : new Date().toISOString().slice(0, 10);
    const lockResponse = await assertPeriodUnlocked(auth.context, issueDate, "purchases");
    if (lockResponse) {
      return lockResponse;
    }

    const vendorName = typeof extracted.vendor_name === "string" && extracted.vendor_name ? extracted.vendor_name : document.source_name;
    const vendorId = await ensureContact(auth.context, "vendor", {
      display_name: vendorName,
      email: "",
      phone: ""
    });

    const subtotal = Number(extracted.subtotal ?? 0);
    const taxTotal = Number(extracted.tax_total ?? 0);
    const total = Number(extracted.total ?? subtotal + taxTotal);
    const billNumber =
      (typeof extracted.invoice_number === "string" && extracted.invoice_number) ||
      (typeof extracted.bill_number === "string" && extracted.bill_number) ||
      sequence("BILL");

    const { data: bill, error: billError } = await auth.context.db
      .from("bills")
      .insert({
        org_id: auth.context.orgId,
        contact_id: vendorId,
        bill_number: billNumber,
        issue_date: issueDate,
        due_date: typeof extracted.due_date === "string" && extracted.due_date ? extracted.due_date : issueDate,
        subtotal,
        tax_total: taxTotal,
        total,
        balance_due: total,
        currency: "USD",
        notes: `Drafted from OCR document ${document.source_name}`,
        status: "draft"
      })
      .select("id, bill_number, issue_date, due_date, total, status")
      .single();

    if (billError || !bill) {
      return fail(400, { code: "BILL_CREATE_FAILED", message: billError?.message ?? "Draft bill could not be created." });
    }

    await auth.context.db
      .from("ocr_documents")
      .update({
        status: "draft_created",
        linked_entity_id: bill.id
      })
      .eq("id", params.id)
      .eq("org_id", auth.context.orgId);

    await auth.context.db.from("audit_logs").insert({
      org_id: auth.context.orgId,
      user_id: auth.context.userId,
      entity_type: "ocr_document",
      entity_id: params.id,
      action: "draft_bill_created",
      new_values: {
        bill_id: bill.id,
        bill_number: bill.bill_number
      }
    });

    return ok(bill, undefined, { status: 201 });
  } catch (error) {
    return fail(500, { code: "OCR_DRAFT_BILL_FAILED", message: errorMessage(error) });
  }
}
