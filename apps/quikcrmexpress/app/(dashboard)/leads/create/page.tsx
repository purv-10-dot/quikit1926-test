import { getServerSession } from "next-auth";
import { Card, CardBody } from "@/components/ui/card";
import { LeadForm } from "@/components/leads/lead-form";
import { PageHeader } from "@/components/shared/page-header";
import { authOptions } from "@/lib/auth";

export default async function CreateLeadPage() {
  const session = await getServerSession(authOptions);
  const defaultOwnerId = session?.user?.id ?? "";
  const defaultOwnerName = session?.user?.name ?? session?.user?.email ?? "";

  return (
    <div className="w-full space-y-4">
      <PageHeader title="New Lead" />

      <div className="rounded-lg border border-crm-border bg-white px-4 py-3 sm:px-5">
        <p className="text-sm font-medium text-crm-text">Capture lead details</p>
        <p className="mt-1 text-xs text-crm-muted">
          Five steps — lead info, company, contact, requirements, then purchase & follow-up and create.
        </p>
      </div>

      <Card className="w-full overflow-hidden">
        <CardBody className="p-4 sm:p-5 lg:p-6">
          <LeadForm
            draftScope="create:page"
            defaultOwnerId={defaultOwnerId}
            defaultOwnerName={defaultOwnerName}
          />
        </CardBody>
      </Card>
    </div>
  );
}
