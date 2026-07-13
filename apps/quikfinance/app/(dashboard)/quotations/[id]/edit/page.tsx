import { QuotationForm } from "@/components/quotations/QuotationForm";

export default function EditQuotationPage({ params }: { params: { id: string } }) {
  return <QuotationForm quotationId={params.id} />;
}
