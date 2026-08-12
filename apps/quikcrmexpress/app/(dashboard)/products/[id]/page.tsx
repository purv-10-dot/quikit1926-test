import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { PageContainer } from "@/components/ui/container";
import {
  ProductDashboardShell,
  type ProductFullRecord,
} from "@/components/products/product-dashboard-shell";
import { getFullProductRecord } from "@/lib/services/products/full-record";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  const record = await getFullProductRecord(user.orgId, id);
  if (!record) notFound();

  return (
    <PageContainer size="wide">
      <ProductDashboardShell record={record as unknown as ProductFullRecord} />
    </PageContainer>
  );
}
