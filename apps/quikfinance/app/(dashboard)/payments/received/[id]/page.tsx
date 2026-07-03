import { PaymentReceivedDetail } from "@/components/payments/PaymentReceivedDetail";

export default function PaymentReceivedDetailPage({ params }: { params: { id: string } }) {
  return <PaymentReceivedDetail id={params.id} />;
}
