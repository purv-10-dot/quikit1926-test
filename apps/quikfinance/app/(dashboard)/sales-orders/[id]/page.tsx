import { SalesOrderDetail } from "@/components/sales-orders/SalesOrderDetail";

export default function SalesOrderDetailPage({ params }: { params: { id: string } }) {
  return <SalesOrderDetail id={params.id} />;
}
