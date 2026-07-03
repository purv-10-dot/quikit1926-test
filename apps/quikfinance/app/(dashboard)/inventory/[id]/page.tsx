import { ItemDetail } from "@/components/inventory/ItemDetail";

export default function ItemDetailPage({ params }: { params: { id: string } }) {
  return <ItemDetail id={params.id} />;
}
