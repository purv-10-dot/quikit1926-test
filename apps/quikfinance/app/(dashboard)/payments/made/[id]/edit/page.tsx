import { PaymentMadeForm } from "@/components/forms/PaymentMadeForm";

export default function EditPaymentMadePage({ params }: { params: { id: string } }) {
  return <PaymentMadeForm paymentId={params.id} />;
}
