import { getCustomerPortalPayload } from "@/lib/portals";
import { fail } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const payload = await getCustomerPortalPayload(params.token);
  if (!payload) {
    return fail(404, { code: "PORTAL_NOT_FOUND", message: "Portal link is invalid or expired." });
  }

  const rows = [
    ["Invoice", "Issue Date", "Due Date", "Total", "Balance Due", "Status"],
    ...payload.invoices.map((invoice) => [
      invoice.invoice_number,
      invoice.issue_date,
      invoice.due_date,
      String(invoice.total),
      String(invoice.balance_due),
      invoice.status
    ])
  ];

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-statement-${payload.customer?.display_name ?? "statement"}.csv"`
    }
  });
}
