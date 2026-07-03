import { ItemForm } from "@/components/inventory/ItemForm";

export default function EditItemPage({ params }: { params: { id: string } }) {
  return <ItemForm itemId={params.id} />;
}
