import { InvoicePaymentLinkWorkspace } from "@/components/payments/InvoicePaymentLinkWorkspace";

export default function InvoicePaymentLinkPage({ params }: { params: { id: string } }) {
  return <InvoicePaymentLinkWorkspace invoiceId={params.id} />;
}
