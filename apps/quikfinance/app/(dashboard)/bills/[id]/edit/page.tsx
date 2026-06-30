import { BillForm } from "@/components/forms/BillForm";

export default function EditBillPage({ params }: { params: { id: string } }) {
  return <BillForm billId={params.id} />;
}
