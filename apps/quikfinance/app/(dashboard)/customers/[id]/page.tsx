import { CustomerOverview } from "@/components/customers/CustomerOverview";

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return <CustomerOverview id={params.id} />;
}
