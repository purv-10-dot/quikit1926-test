import { PurchaseOrderForm } from "@/components/purchase-orders/PurchaseOrderForm";

export default function EditPurchaseOrderPage({ params }: { params: { id: string } }) {
  return <PurchaseOrderForm purchaseOrderId={params.id} />;
}
