import { db, type DbClient } from "@/lib/db";
import { fail, ok } from "@/lib/api/responses";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import type { Json } from "@/types/database.types";

export const dynamic = "force-dynamic";

function asObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function amountFromSubunits(value: unknown) {
  return Number((asNumber(value) / 100).toFixed(2));
}

function paymentDateFromUnix(value: unknown) {
  const timestamp = asNumber(value);
  if (!timestamp) {
    return new Date().toISOString().slice(0, 10);
  }
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

async function syncInvoiceStatus(admin: DbClient, invoiceId: string, grossPaid: number, refunded: number) {
  const { data: invoice, error } = await admin.from("invoices").select("id, total").eq("id", invoiceId).single();
  if (error || !invoice) {
    return;
  }

  const netPaid = Math.max(0, grossPaid - refunded);
  const total = Number(invoice.total ?? 0);
  const balanceDue = Number(Math.max(0, total - netPaid).toFixed(2));
  const status = balanceDue <= 0 ? "paid" : netPaid > 0 ? "partial" : "sent";

  await admin
    .from("invoices")
    .update({
      balance_due: balanceDue,
      status
    })
    .eq("id", invoiceId);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return fail(401, { code: "INVALID_SIGNATURE", message: "Webhook signature verification failed." });
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const eventType = asString(payload.event) ?? "unknown";
  const eventId = request.headers.get("x-razorpay-event-id") ?? `${eventType}:${asNumber(payload.created_at)}`;
  const admin = db;

  const { data: duplicateEvent } = await admin.from("gateway_events").select("id").eq("provider", "razorpay").eq("event_id", eventId).maybeSingle();
  if (duplicateEvent?.id) {
    return ok({ received: true, duplicate: true });
  }

  const payloadObject = asObject(payload.payload);
  const paymentLinkEntity = asObject(asObject(payloadObject?.payment_link)?.entity);
  const paymentEntity = asObject(asObject(payloadObject?.payment)?.entity);
  const refundEntity = asObject(asObject(payloadObject?.refund)?.entity);

  if (eventType.startsWith("payment_link.")) {
    const providerLinkId = asString(paymentLinkEntity?.id);
    if (!providerLinkId) {
      return ok({ received: true, ignored: true, reason: "missing_payment_link_id" });
    }

    const { data: link, error: linkError } = await admin
      .from("invoice_payment_links")
      .select("id, org_id, invoice_id, amount_paid, amount_refunded, provider_link_id, currency")
      .eq("provider", "razorpay")
      .eq("provider_link_id", providerLinkId)
      .maybeSingle();

    if (linkError || !link) {
      return ok({ received: true, ignored: true, reason: "link_not_found" });
    }

    const paymentId = asString(paymentEntity?.id);
    const paymentAmount = amountFromSubunits(paymentEntity?.amount ?? paymentLinkEntity?.amount_paid ?? 0);
    const grossPaid = amountFromSubunits(paymentLinkEntity?.amount_paid ?? 0);
    const currency = asString(paymentEntity?.currency) ?? link.currency;
    const linkStatus = asString(paymentLinkEntity?.status) ?? eventType.replace("payment_link.", "");

    await admin
      .from("invoice_payment_links")
      .update({
        amount_paid: grossPaid,
        latest_payment_id: paymentId,
        status: linkStatus,
        raw_response: payload as Json
      })
      .eq("id", link.id);

    if (paymentId) {
      const { data: invoice } = await admin
        .from("invoices")
        .select("contact_id")
        .eq("id", link.invoice_id)
        .maybeSingle();

      const { data: existingPayment } = await admin
        .from("payments")
        .select("id")
        .eq("org_id", link.org_id)
        .eq("reference", `razorpay:${paymentId}`)
        .maybeSingle();

      if (!existingPayment?.id) {
        await admin.from("payments").insert({
          org_id: link.org_id,
          contact_id: invoice?.contact_id ?? null,
          payment_type: "received",
          payment_date: paymentDateFromUnix(paymentEntity?.created_at),
          amount: paymentAmount,
          currency,
          method: "Razorpay",
          reference: `razorpay:${paymentId}`,
          memo: `Collected through Razorpay payment link ${providerLinkId}`,
          status: "posted"
        });
      }
    }

    await admin.from("gateway_events").insert({
      org_id: link.org_id,
      provider: "razorpay",
      event_id: eventId,
      event_type: eventType,
      invoice_id: link.invoice_id,
      provider_link_id: providerLinkId,
      provider_payment_id: paymentId,
      provider_refund_id: null,
      payload: payload as Json,
      processed_at: new Date().toISOString()
    });

    await syncInvoiceStatus(admin, link.invoice_id, grossPaid, Number(link.amount_refunded ?? 0));
    return ok({ received: true, event: eventType });
  }

  if (eventType.startsWith("refund.")) {
    if (!refundEntity) {
      return ok({ received: true, ignored: true, reason: "missing_refund_entity" });
    }

    const paymentId = asString(refundEntity?.payment_id);
    const refundId = asString(refundEntity?.id);
    if (!paymentId || !refundId) {
      return ok({ received: true, ignored: true, reason: "missing_refund_mapping" });
    }

    const { data: priorEvent } = await admin
      .from("gateway_events")
      .select("org_id, invoice_id, provider_link_id")
      .eq("provider", "razorpay")
      .eq("provider_payment_id", paymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!priorEvent?.invoice_id || !priorEvent.provider_link_id) {
      return ok({ received: true, ignored: true, reason: "payment_not_linked" });
    }

    const { data: link } = await admin
      .from("invoice_payment_links")
      .select("id, org_id, invoice_id, amount_paid, amount_refunded")
      .eq("provider", "razorpay")
      .eq("provider_link_id", priorEvent.provider_link_id)
      .maybeSingle();

    if (!link) {
      return ok({ received: true, ignored: true, reason: "link_not_found" });
    }

    const refundAmount = amountFromSubunits(refundEntity.amount);
    const refundedTotal = Number((Number(link.amount_refunded ?? 0) + refundAmount).toFixed(2));

    await admin
      .from("invoice_payment_links")
      .update({
        amount_refunded: refundedTotal,
        status: asString(refundEntity.status) ?? "refund_processed",
        raw_response: payload as Json
      })
      .eq("id", link.id);

    await admin.from("gateway_events").insert({
      org_id: priorEvent.org_id,
      provider: "razorpay",
      event_id: eventId,
      event_type: eventType,
      invoice_id: priorEvent.invoice_id,
      provider_link_id: priorEvent.provider_link_id,
      provider_payment_id: paymentId,
      provider_refund_id: refundId,
      payload: payload as Json,
      processed_at: new Date().toISOString()
    });

    await syncInvoiceStatus(admin, priorEvent.invoice_id, Number(link.amount_paid ?? 0), refundedTotal);
    return ok({ received: true, event: eventType });
  }

  return ok({ received: true, ignored: true, event: eventType });
}
