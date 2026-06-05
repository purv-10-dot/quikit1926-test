import { requireUser } from "@/lib/auth/require";
import { PageHeader } from "@/components/shared/page-header";
import { CampaignCreateForm } from "@/components/marketing/campaign-create-form";

export default async function NewCampaignPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Create campaign"
        subtitle="Set up a new marketing campaign"
      />
      <CampaignCreateForm />
    </div>
  );
}
