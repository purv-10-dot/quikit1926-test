import { CustomerForm } from "@/components/customers/CustomerForm";

export default function EditVendorPage({ params }: { params: { id: string } }) {
  return <CustomerForm kind="vendor" customerId={params.id} />;
}
