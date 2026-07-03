import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalComments } from "@/components/portals/PortalComments";
import { PortalShell } from "@/components/portals/PortalShell";
import { SupportChat } from "@/components/portals/SupportChat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCustomerPortalPayload } from "@/lib/portals";
import { formatMoney } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

export default async function CustomerPortalPage({ params }: { params: { token: string } }) {
  const payload = await getCustomerPortalPayload(params.token);
  if (!payload) {
    notFound();
  }

  const outstanding = payload.invoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);

  return (
    <PortalShell
      title={`${payload.customer?.display_name ?? "Customer"} Portal`}
      description={`Welcome to ${payload.organization?.name ?? "QuikFinance"}. Review invoices, download your statement, and pay open balances securely.`}
      actions={[
        { label: "Download statement CSV", href: `/api/public/customer/${params.token}/statement`, external: true }
      ]}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Open invoices</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{payload.invoices.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Outstanding</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{formatMoney(outstanding)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Billing email</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{payload.customer?.email ?? "Not set"}</CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {payload.invoices.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">{invoice.invoice_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.issue_date} · Due {invoice.due_date} · {invoice.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatMoney(Number(invoice.total ?? 0))}</p>
                    <p className="text-sm text-muted-foreground">Balance {formatMoney(Number(invoice.balance_due ?? 0))}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/api/public/invoices/${invoice.id}/pdf?token=${params.token}`} target="_blank" className="rounded-full border px-4 py-2 text-sm font-semibold">
                    Open invoice PDF
                  </Link>
                  {invoice.payment_link?.short_url ? (
                    <Link href={invoice.payment_link.short_url} target="_blank" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                      Pay now
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <SupportChat token={params.token} customerName={payload.customer?.display_name ?? "Customer"} />
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <PortalComments token={params.token} />
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}
