import { InvoiceDetail } from "@/components/invoices/InvoiceDetail";
import { EInvoicePanel } from "@/components/invoices/EInvoicePanel";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <InvoiceDetail id={params.id} />
      <EInvoicePanel invoiceId={params.id} />
    </div>
  );
}
