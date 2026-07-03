import { BillDetail } from "@/components/bills/BillDetail";

export default function BillDetailPage({ params }: { params: { id: string } }) {
  return <BillDetail id={params.id} />;
}
