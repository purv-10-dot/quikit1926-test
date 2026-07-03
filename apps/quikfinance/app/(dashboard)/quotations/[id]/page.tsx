import { QuotationDetail } from "@/components/quotations/QuotationDetail";

export default function QuotationDetailPage({ params }: { params: { id: string } }) {
  return <QuotationDetail id={params.id} />;
}
