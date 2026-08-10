import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadForm } from "@/components/leads/lead-form";
import { PageHeader } from "@/components/shared/page-header";

export default function CreateLeadPage() {
  return (
    <div className="w-full space-y-4">
      <PageHeader title="New Lead" />

      <div className="rounded-lg border border-crm-border bg-white px-4 py-3 sm:px-5">
        <p className="text-sm font-medium text-crm-text">Capture lead details</p>
        <p className="mt-1 text-xs text-crm-muted">
          Add contact information, qualification data, and ownership in one place.
        </p>
      </div>

      <Card className="w-full overflow-hidden">
        <CardHeader>
          <CardTitle>Lead details</CardTitle>
        </CardHeader>
        <CardBody className="p-4 sm:p-5 lg:p-6">
          <LeadForm draftScope="create:page" />
        </CardBody>
      </Card>
    </div>
  );
}
