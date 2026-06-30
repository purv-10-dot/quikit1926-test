import { DeliveryChallanForm } from "@/components/delivery-challans/DeliveryChallanForm";

export default function EditDeliveryChallanPage({ params }: { params: { id: string } }) {
  return <DeliveryChallanForm challanId={params.id} />;
}
