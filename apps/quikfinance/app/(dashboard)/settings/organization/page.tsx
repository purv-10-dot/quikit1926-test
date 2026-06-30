import { CompanySettingsForm } from "@/components/settings/CompanySettingsForm";
import { PageHeader } from "@/components/shared/PageHeader";

export default function OrganizationProfilePage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Organization Profile"
        description="Organization profile, logo, location, primary contact, and regional & accounting preferences."
      />
      <CompanySettingsForm />
    </div>
  );
}
