import { DeliveryChallanDetail } from "@/components/delivery-challans/DeliveryChallanDetail";

export default function DeliveryChallanDetailPage({ params }: { params: { id: string } }) {
  return <DeliveryChallanDetail id={params.id} />;
}
