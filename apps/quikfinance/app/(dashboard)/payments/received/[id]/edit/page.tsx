import { PaymentReceivedForm } from "@/components/forms/PaymentReceivedForm";

export default function EditPaymentReceivedPage({ params }: { params: { id: string } }) {
  return <PaymentReceivedForm paymentId={params.id} />;
}
