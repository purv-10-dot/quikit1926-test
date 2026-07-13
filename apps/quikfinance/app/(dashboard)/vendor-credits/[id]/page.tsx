import { VendorCreditDetail } from "@/components/vendor-credits/VendorCreditDetail";

export default function VendorCreditDetailPage({ params }: { params: { id: string } }) {
  return <VendorCreditDetail id={params.id} />;
}
