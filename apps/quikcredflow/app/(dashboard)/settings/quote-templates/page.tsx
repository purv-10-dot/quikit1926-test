import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { QuoteTemplatesPage } from "@/components/settings/quote-templates-page";

export default function SettingsQuoteTemplatesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Quote templates"
        subtitle="B2B, SaaS, construction, and service layouts with branding."
      />
      <QuoteTemplatesPage />
    </PageContainer>
  );
}
