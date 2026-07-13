import { InvoiceForm } from "@/components/invoices/InvoiceForm";

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  return <InvoiceForm invoiceId={params.id} />;
}
