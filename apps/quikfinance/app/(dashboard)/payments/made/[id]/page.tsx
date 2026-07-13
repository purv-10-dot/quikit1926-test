import { PaymentMadeDetail } from "@/components/payments/PaymentMadeDetail";

export default function PaymentMadeDetailPage({ params }: { params: { id: string } }) {
  return <PaymentMadeDetail id={params.id} />;
}
