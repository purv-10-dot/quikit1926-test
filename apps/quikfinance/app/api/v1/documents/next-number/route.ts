import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { loadInvoiceSettings } from "@/lib/settings/invoice";
import { loadPurchaseOrderSettings } from "@/lib/settings/purchase-order";
import { peekDocumentNumber, type NumberModule } from "@/lib/accounting/numbering";

export const dynamic = "force-dynamic";

// Map the form's document `type` to a numbering module. The location's
// transaction series (then the org default series) drives the prefix; the
// invoice / purchase-order settings still gate the auto-generate toggle.
const TYPE_TO_MODULE: Record<string, NumberModule> = {
  invoice: "invoice",
  "purchase-order": "purchase_order",
  quotation: "quotation",
  "credit-note": "credit_note",
  "vendor-credit": "vendor_credit",
  journal: "journal",
  "sales-order": "sales_order",
  "delivery-challan": "delivery_challan",
  bill: "bill",
  "payment-made": "payment_made",
  "payment-received": "payment_received"
};

export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const type = request.nextUrl.searchParams.get("type") ?? "";
  const locationId = request.nextUrl.searchParams.get("location_id");
  const module = TYPE_TO_MODULE[type];
  if (!module) return fail(400, { code: "UNKNOWN_TYPE", message: `Unknown document type: ${type}` });

  try {
    // Honour the per-org auto-generate toggle for invoices / purchase orders.
    let fallbackPrefix: string | undefined;
    let fallbackFloor: number | undefined;
    if (type === "invoice") {
      const s = await loadInvoiceSettings(prisma, orgId);
      if (!s.auto_generate_number) return ok({ auto_generate_number: false, prefix: s.prefix, number: null });
      fallbackPrefix = s.prefix; fallbackFloor = s.next_number;
    } else if (type === "purchase-order") {
      const s = await loadPurchaseOrderSettings(prisma, orgId);
      if (!s.auto_generate_number) return ok({ auto_generate_number: false, prefix: s.prefix, number: null });
      fallbackPrefix = s.prefix; fallbackFloor = s.next_number;
    }

    const number = await peekDocumentNumber(prisma, orgId, module, { locationId, fallbackPrefix, fallbackFloor });
    return ok({ auto_generate_number: true, number });
  } catch (error) {
    return fail(500, { code: "PREVIEW_FAILED", message: errorMessage(error) });
  }
}
