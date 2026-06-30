import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { getRazorpayWebhookUrl, isRazorpayConfigured } from "@/lib/razorpay";

export default function IntegrationsPage() {
  const razorpayConfigured = isRazorpayConfigured();

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Integrations" description="Operational connectors for collection, imports, and accounting automation." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Razorpay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Status: <span className={razorpayConfigured ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>{razorpayConfigured ? "Configured" : "Pending setup"}</span></p>
            <p>Use invoice payment links to collect online payments and sync webhook events back into receivables.</p>
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              Webhook URL:
              <div className="mt-1 font-mono text-[11px]">{getRazorpayWebhookUrl()}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Import Workbench</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Tally, Zoho Books, CSV, and bank statement imports are now handled through the new import center.</p>
            <p>OCR-assisted bill drafting is available from the OCR Bills page, and period locks can be managed from the accounting close workspace.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
