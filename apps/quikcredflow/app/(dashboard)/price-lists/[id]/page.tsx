import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { PriceListDetailShell } from "@/components/price-lists/price-list-detail-shell";

export default async function PriceListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  return (
    <PageContainer size="wide">
      <Link
        href="/price-lists"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-crm-muted hover:text-crm-text"
      >
        <ArrowLeft size={14} /> Back to price lists
      </Link>
      <PageHeader title="Price list" subtitle="Enterprise pricing tiers, brackets, and audit trail." />
      <PriceListDetailShell priceListId={id} />
    </PageContainer>
  );
}
