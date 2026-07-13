"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoney } from "@/lib/utils/currency";

type PaymentLinkData = {
  invoice: {
    id: string;
    invoice_number: string;
    total: number;
    balance_due: number;
    currency: string;
    status: string;
    customer_name: string;
    customer_email: string | null;
  };
  payment_link: {
    id: string;
    provider_link_id: string;
    short_url: string | null;
    status: string;
    amount: number;
    amount_paid: number;
    amount_refunded: number;
    callback_url: string | null;
  } | null;
  share: {
    pdfUrl: string;
    whatsappUrl: string;
    upiUri: string | null;
    paymentUrl: string | null;
    customerPortalUrl: string | null;
    einvoice: { irn: string; ackNumber: string; ackDate: string };
    taxBreakup: { cgst: number; sgst: number; igst: number };
  } | null;
  configured: boolean;
  webhook_url: string;
};

export function InvoicePaymentLinkWorkspace({ invoiceId }: { invoiceId: string }) {
  const [allowPartial, setAllowPartial] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("14");

  const paymentLink = useQuery({
    queryKey: ["invoice-payment-link", invoiceId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/invoices/${invoiceId}/payment-link`);
      if (!response.ok) {
        throw new Error("Payment link data could not be loaded.");
      }
      const payload = (await response.json()) as { data?: PaymentLinkData };
      return payload.data as PaymentLinkData;
    }
  });

  const createLink = async () => {
    const response = await fetch(`/api/v1/invoices/${invoiceId}/payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allow_partial: allowPartial,
        expires_in_days: Number(expiresInDays)
      })
    });

    if (!response.ok) {
      toast.error("Payment link could not be created.");
      return;
    }

    toast.success("Payment link created.");
    paymentLink.refetch();
  };

  const cancelLink = async () => {
    const response = await fetch(`/api/v1/invoices/${invoiceId}/payment-link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      toast.error("Payment link could not be cancelled.");
      return;
    }

    toast.success("Payment link cancelled.");
    paymentLink.refetch();
  };

  const data = paymentLink.data;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Invoice Payment Link"
        description={`Collect invoice ${data?.invoice.invoice_number ?? invoiceId} through Razorpay payment links and keep refunds synced back into accounts receivable.`}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span>{data?.invoice.customer_name ?? "Loading..."}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total</span>
              <span>{formatMoney(data?.invoice.total ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Balance due</span>
              <span className="font-semibold">{formatMoney(data?.invoice.balance_due ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span>{data?.invoice.status ?? "draft"}</span>
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Razorpay webhook URL:
              <div className="mt-1 font-mono text-[11px] text-foreground">{data?.webhook_url ?? "Loading..."}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Create link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                checked={allowPartial}
                onChange={(event) => setAllowPartial(event.target.checked)}
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-sky-600"
              />
              <Label>Allow partial payments</Label>
            </div>
            <div>
              <Label htmlFor="expiry">Expiry in days</Label>
              <Input id="expiry" type="number" min="1" max="180" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} />
            </div>
            <Button onClick={createLink} disabled={!data?.configured}>
              Create Razorpay link
            </Button>
            {!data?.configured ? <p className="text-xs text-amber-600">Razorpay keys are not configured yet.</p> : null}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Latest link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data?.payment_link ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span>{data.payment_link.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Requested</span>
                <span>{formatMoney(data.payment_link.amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span>{formatMoney(data.payment_link.amount_paid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Refunded</span>
                <span>{formatMoney(data.payment_link.amount_refunded)}</span>
              </div>
              {data.payment_link.short_url ? (
                <Button asChild variant="secondary">
                  <Link href={data.payment_link.short_url} target="_blank">
                    Open payment link
                  </Link>
                </Button>
              ) : null}
              {["created", "partially_paid"].includes(data.payment_link.status) ? (
                <Button variant="secondary" onClick={cancelLink}>
                  Cancel link
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">No payment link has been created for this invoice yet.</p>
          )}
        </CardContent>
      </Card>
      {data?.share ? (
        <Card>
          <CardHeader>
            <CardTitle>Share & e-invoice</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <Button asChild variant="secondary">
                <Link href={data.share.pdfUrl} target="_blank">Download PDF</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={data.share.whatsappUrl} target="_blank">Share on WhatsApp</Link>
              </Button>
              {data.share.customerPortalUrl ? (
                <Button asChild variant="secondary">
                  <Link href={data.share.customerPortalUrl} target="_blank">Open customer portal</Link>
                </Button>
              ) : null}
              {data.share.upiUri ? (
                <div className="rounded-md border bg-muted/40 p-3 text-xs break-all">
                  <p className="font-semibold">UPI intent</p>
                  <p className="mt-1 text-muted-foreground">{data.share.upiUri}</p>
                </div>
              ) : null}
            </div>
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="font-semibold">GST breakup</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between"><span>CGST</span><span>{formatMoney(data.share.taxBreakup.cgst)}</span></div>
                  <div className="flex items-center justify-between"><span>SGST</span><span>{formatMoney(data.share.taxBreakup.sgst)}</span></div>
                  <div className="flex items-center justify-between"><span>IGST</span><span>{formatMoney(data.share.taxBreakup.igst)}</span></div>
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="font-semibold">E-invoice fields</p>
                <p className="mt-2">IRN: {data.share.einvoice.irn}</p>
                <p>Ack No: {data.share.einvoice.ackNumber}</p>
                <p>Ack Date: {data.share.einvoice.ackDate}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
