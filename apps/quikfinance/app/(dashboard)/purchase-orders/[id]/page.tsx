import { PurchaseOrderDetail } from "@/components/purchase-orders/PurchaseOrderDetail";

export default function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  return <PurchaseOrderDetail id={params.id} />;
}
