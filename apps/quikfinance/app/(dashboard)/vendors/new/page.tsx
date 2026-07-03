import { CustomerForm } from "@/components/customers/CustomerForm";

export const dynamic = "force-dynamic";

export default function NewVendorPage() {
  return <CustomerForm kind="vendor" />;
}
