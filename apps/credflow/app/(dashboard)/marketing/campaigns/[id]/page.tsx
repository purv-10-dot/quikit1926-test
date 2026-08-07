import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import {
  CampaignDetailHeader,
  CampaignDetailTabs,
} from "@/components/marketing/campaign-detail-tabs";
import { serializeCampaign } from "@/lib/services/campaigns/serialize";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const row = await prisma.qcfCampaign.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!row) notFound();

  const campaign = serializeCampaign(row);

  return (
    <div>
      <Link
        href="/marketing/campaigns"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-crm-muted hover:text-crm-text"
      >
        <ArrowLeft size={14} />
        Back to campaigns
      </Link>
      <PageHeader title={campaign.name} />
      <CampaignDetailHeader campaign={campaign} />
      <CampaignDetailTabs campaign={campaign} />
    </div>
  );
}
