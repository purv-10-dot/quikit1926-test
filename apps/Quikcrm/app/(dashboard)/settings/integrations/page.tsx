import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

const INTEGRATIONS = [
  { name: "IndiaVoice / RP Digital", status: "configured-via-env", description: "Click-to-call + webhook receiver" },
  { name: "PostgreSQL", status: "system", description: "Primary database (via Prisma)" },
  { name: "Redis", status: "system", description: "BullMQ queue backend" },
];

export default function IntegrationsPage() {
  return (
    <div>
      <PageHeader title="Integrations" />
      <Card>
        <CardHeader><CardTitle>Connected systems</CardTitle></CardHeader>
        <CardBody>
          <ul className="divide-y divide-crm-border">
            {INTEGRATIONS.map((i) => (
              <li key={i.name} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-crm-text">{i.name}</div>
                  <div className="text-xs text-crm-muted">{i.description}</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{i.status}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
