import { SalesOrderForm } from "@/components/sales-orders/SalesOrderForm";

export default function EditSalesOrderPage({ params }: { params: { id: string } }) {
  return <SalesOrderForm salesOrderId={params.id} />;
}
