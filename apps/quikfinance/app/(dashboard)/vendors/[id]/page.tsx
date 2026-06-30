import { CustomerOverview } from "@/components/customers/CustomerOverview";

export default function VendorDetailPage({ params }: { params: { id: string } }) {
  return <CustomerOverview id={params.id} kind="vendor" />;
}
