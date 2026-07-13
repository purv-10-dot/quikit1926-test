import { notFound } from "next/navigation";
import { PortalComments } from "@/components/portals/PortalComments";
import { PortalShell } from "@/components/portals/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCaPortalPayload } from "@/lib/portals";
import { formatMoney } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

export default async function CaPortalPage({ params }: { params: { token: string } }) {
  const payload = await getCaPortalPayload(params.token);
  if (!payload) {
    notFound();
  }

  return (
    <PortalShell
      title={`${payload.portal.display_name ?? "CA"} Portal`}
      description={`Read-only accountant workspace for ${payload.organization?.name ?? "QuikFinance"} with exports, summaries, and collaboration notes.`}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Receivables</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{formatMoney(payload.summary.receivables)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payables</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{formatMoney(payload.summary.payables)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Output GST</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{formatMoney(payload.summary.gstCollected)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Input GST</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{formatMoney(payload.summary.gstInput)}</CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Recent invoices</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {payload.invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-semibold">{invoice.invoice_number}</p>
                  <p className="text-muted-foreground">{invoice.issue_date} · {invoice.status}</p>
                </div>
                <div className="text-right">
                  <p>{formatMoney(Number(invoice.total ?? 0))}</p>
                  <p className="text-muted-foreground">Bal {formatMoney(Number(invoice.balance_due ?? 0))}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent bills</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {payload.bills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-semibold">{bill.bill_number}</p>
                  <p className="text-muted-foreground">{bill.issue_date} · {bill.status}</p>
                </div>
                <div className="text-right">
                  <p>{formatMoney(Number(bill.total ?? 0))}</p>
                  <p className="text-muted-foreground">Bal {formatMoney(Number(bill.balance_due ?? 0))}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Audit feed</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {payload.auditLogs.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{item.entity_type}</p>
                <p className="text-muted-foreground">{item.action} · {new Date(item.created_at).toLocaleString("en-IN")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Collaboration</CardTitle></CardHeader>
          <CardContent>
            <PortalComments token={params.token} />
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
