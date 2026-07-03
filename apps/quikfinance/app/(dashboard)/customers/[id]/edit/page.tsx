import { CustomerForm } from "@/components/customers/CustomerForm";

export default function EditCustomerPage({ params }: { params: { id: string } }) {
  return <CustomerForm customerId={params.id} />;
}
