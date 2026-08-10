import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";

export default function OutboundCampaignsPage() {
  return (
    <div>
      <PageHeader title="Outbound Campaigns" subtitle="Bulk dial campaigns" />
      <Card>
        <CardBody>
          <p className="text-sm text-crm-muted">
            {/* TODO(post-mvp): port full outbound campaign builder from quikcrm-frontend/src/pages/telephony/OutboundCampaignPage.tsx */}
            Outbound campaign builder — coming soon.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
