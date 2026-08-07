import { requireUser } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/require-permission";
import { getCompanyProfileForSettings } from "@/lib/services/company-profile";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { CompanyProfileEditForm } from "@/components/settings/company-profile-edit-form";

export default async function CompanyProfilePage() {
  const user = await requireUser();
  const profile = await getCompanyProfileForSettings(user.orgId);
  const canEdit =
    user.role === "Administrator" ||
    (await hasPermission(user, "settings", "edit"));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Company Profile"
        subtitle="Organization details used across quotes, documents, and team workflows."
      />
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardBody>
          <CompanyProfileEditForm initial={profile} canEdit={canEdit} />
        </CardBody>
      </Card>
    </div>
  );
}
