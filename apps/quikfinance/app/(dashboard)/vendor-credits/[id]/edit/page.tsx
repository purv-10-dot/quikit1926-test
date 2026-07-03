import { VendorCreditForm } from "@/components/vendor-credits/VendorCreditForm";

export default function EditVendorCreditPage({ params }: { params: { id: string } }) {
  return <VendorCreditForm vendorCreditId={params.id} />;
}
