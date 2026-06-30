import { requireApiContext } from "@/lib/api/auth";
import { errorMessage, fail, ok } from "@/lib/api/responses";
import { buildInvoiceShareData } from "@/lib/invoice-share";
import { createRazorpayPaymentLink, cancelRazorpayPaymentLink, getRazorpayWebhookUrl, isRazorpayConfigured } from "@/lib/razorpay";
import { paymentLinkCreateSchema } from "@/lib/validations/automation.schema";

export const dynamic = "force-dynamic";

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { data: invoice, error: invoiceError } = await auth.context.db
    .from("invoices")
    .select("id, invoice_number, total, balance_due, currency, status, contact_id")
    .eq("org_id", auth.context.orgId)
    .eq("id", params.id)
    .single();

  if (invoiceError || !invoice) {
    return fail(404, { code: "INVOICE_NOT_FOUND", message: "Invoice not found." });
  }

  const [{ data: contact }, { data: paymentLink }] = await Promise.all([
    auth.context.db
      .from("contacts")
      .select("display_name, email, phone")
      .eq("org_id", auth.context.orgId)
      .eq("id", invoice.contact_id)
      .single(),
    auth.context.db
      .from("invoice_payment_links")
      .select("id, provider, provider_link_id, short_url, status, amount, amount_paid, amount_refunded, callback_url, created_at")
      .eq("org_id", auth.context.orgId)
      .eq("invoice_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const share = await buildInvoiceShareData(auth.context, params.id).catch(() => null);

  return ok({
    invoice: {
      ...invoice,
      customer_name: contact?.display_name ?? "Customer",
      customer_email: contact?.email ?? null,
      customer_phone: contact?.phone ?? null
    },
    payment_link: paymentLink,
    share,
    configured: isRazorpayConfigured(),
    webhook_url: getRazorpayWebhookUrl()
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  if (!isRazorpayConfigured()) {
    return fail(400, {
      code: "RAZORPAY_NOT_CONFIGURED",
      message: "Razorpay is not configured yet. Add the Razorpay keys before creating payment links."
    });
  }

  try {
    const json = (await request.json()) as Record<string, unknown>;
    const parsed = paymentLinkCreateSchema.safeParse(json);
    if (!parsed.success) {
      return fail(422, {
        code: "VALIDATION_FAILED",
        message: "The payment link request is invalid.",
        details: parsed.error.flatten()
      });
    }

    const { data: invoice, error: invoiceError } = await auth.context.db
      .from("invoices")
      .select("id, invoice_number, total, balance_due, currency, contact_id")
      .eq("org_id", auth.context.orgId)
      .eq("id", params.id)
      .single();

    if (invoiceError || !invoice) {
      return fail(404, { code: "INVOICE_NOT_FOUND", message: "Invoice not found." });
    }

    const { data: invoiceContact } = await auth.context.db
      .from("contacts")
      .select("display_name, email, phone")
      .eq("org_id", auth.context.orgId)
      .eq("id", invoice.contact_id)
      .maybeSingle();

    const amountToCollect = Number(invoice.balance_due ?? invoice.total ?? 0);
    if (amountToCollect <= 0) {
      return fail(422, { code: "NOTHING_TO_COLLECT", message: "This invoice does not have any balance left to collect." });
    }

    const callbackUrl = parsed.data.callback_url ?? null;
    const paymentLinkResponse = await createRazorpayPaymentLink({
      amount: amountToCollect,
      currency: parsed.data.currency ?? invoice.currency,
      referenceId: invoice.invoice_number,
      description: parsed.data.description ?? `Payment for invoice ${invoice.invoice_number}`,
      customer: {
        name: invoiceContact?.display_name ?? "Customer",
        email: invoiceContact?.email ?? null,
        contact: invoiceContact?.phone ?? null
      },
      acceptPartial: parsed.data.allow_partial,
      firstMinPartialAmount: parsed.data.first_min_partial_amount,
      expireBy: Math.floor(Date.now() / 1000) + parsed.data.expires_in_days * 24 * 60 * 60,
      callbackUrl
    });

    const { data: savedLink, error: saveError } = await auth.context.db
      .from("invoice_payment_links")
      .insert({
        org_id: auth.context.orgId,
        invoice_id: params.id,
        provider: "razorpay",
        provider_link_id: asString(paymentLinkResponse.id) ?? "",
        reference_id: asString(paymentLinkResponse.reference_id) ?? invoice.invoice_number,
        short_url: asString(paymentLinkResponse.short_url),
        status: asString(paymentLinkResponse.status) ?? "created",
        currency: asString(paymentLinkResponse.currency) ?? invoice.currency,
        amount: amountToCollect,
        amount_paid: asNumber(paymentLinkResponse.amount_paid) / 100,
        amount_refunded: 0,
        callback_url: callbackUrl,
        latest_payment_id: null,
        raw_response: paymentLinkResponse,
        created_by: auth.context.userId
      })
      .select("id, provider, provider_link_id, short_url, status, amount, amount_paid, amount_refunded, callback_url, created_at")
      .single();

    if (saveError) {
      return fail(400, { code: "PAYMENT_LINK_SAVE_FAILED", message: saveError.message });
    }

    await auth.context.db.from("audit_logs").insert({
      org_id: auth.context.orgId,
      user_id: auth.context.userId,
      entity_type: "invoice_payment_link",
      entity_id: savedLink.id,
      action: "create",
      new_values: paymentLinkResponse
    });

    return ok(savedLink, { short_url: savedLink.short_url }, { status: 201 });
  } catch (error) {
    return fail(500, { code: "PAYMENT_LINK_CREATE_FAILED", message: errorMessage(error) });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  try {
    const json = (await request.json().catch(() => ({}))) as { provider_link_id?: string };
    const providerLinkId = json.provider_link_id;

    const query = auth.context.db
      .from("invoice_payment_links")
      .select("id, provider_link_id")
      .eq("org_id", auth.context.orgId)
      .eq("invoice_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: link, error: linkError } = providerLinkId
      ? await auth.context.db
          .from("invoice_payment_links")
          .select("id, provider_link_id")
          .eq("org_id", auth.context.orgId)
          .eq("invoice_id", params.id)
          .eq("provider_link_id", providerLinkId)
          .single()
      : await query.single();

    if (linkError || !link) {
      return fail(404, { code: "PAYMENT_LINK_NOT_FOUND", message: "Payment link not found." });
    }

    const response = await cancelRazorpayPaymentLink(link.provider_link_id);
    const { data: updated, error: updateError } = await auth.context.db
      .from("invoice_payment_links")
      .update({
        status: asString(response.status) ?? "cancelled",
        raw_response: response
      })
      .eq("org_id", auth.context.orgId)
      .eq("id", link.id)
      .select("id, provider, provider_link_id, short_url, status, amount, amount_paid, amount_refunded, callback_url, created_at")
      .single();

    if (updateError) {
      return fail(400, { code: "PAYMENT_LINK_CANCEL_FAILED", message: updateError.message });
    }

    return ok(updated);
  } catch (error) {
    return fail(500, { code: "PAYMENT_LINK_CANCEL_FAILED", message: errorMessage(error) });
  }
}
