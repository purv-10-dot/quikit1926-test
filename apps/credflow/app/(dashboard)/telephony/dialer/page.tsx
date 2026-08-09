// apps/credflow/app/(dashboard)/telephony/dialer/page.tsx
import { PageHeader } from "@/components/shared/page-header";
import { dialerStatus } from "@/lib/services/telephony/india-voice";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DialerWorkspace } from "./dialer-workspace";

export default function DialerPage() {
  const status = dialerStatus();
  return (
    <div>
      <PageHeader title="Dialer" subtitle="Click-to-call via IndiaVoice / RP Digital" />
      {!status.configured && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardBody className="text-sm text-amber-900">
            Provider not configured. Set <code>RP_DIGITAL_AUTHCODE</code> (preferred) or
            <code> RP_DIGITAL_BASIC_USER</code> + <code>RP_DIGITAL_BASIC_PASSWORD</code> as a
            fallback, plus <code>RP_DIGITAL_DESKPHONE</code>, in your environment to enable
            click-to-call. Your client IP must also be whitelisted on IndiaVoice&apos;s firewall.
          </CardBody>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Dial</CardTitle>
          </CardHeader>
          <CardBody>
            <DialerWorkspace />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Provider status</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-2 text-sm">
              <Item k="Configured" v={status.configured ? "Yes" : "No"} />
              <Item k="Base URL" v={status.baseUrl} />
              <Item k="Auth method" v={status.authMethod === "none" ? "Not set" : status.authMethod} />
              <Item k="Has credentials" v={status.hasCredentials ? "Yes" : "No"} />
              <Item k="Deskphone set" v={status.deskphoneSet ? "Yes" : "No"} />
              <Item k="Default agent number" v={status.callingPartyA || "—"} />
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-crm-border py-1.5 last:border-0">
      <dt className="text-crm-muted">{k}</dt>
      <dd className="text-crm-text">{v}</dd>
    </div>
  );
}
