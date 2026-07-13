import { requireApiContext } from "@/lib/api/auth";
import { fail, ok } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { data, error } = await auth.context.db
    .from("support_tickets")
    .select("id, ticket_number, subject, priority, status, requested_by_name, requested_by_email, created_at")
    .eq("org_id", auth.context.orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return fail(400, { code: "SUPPORT_TICKETS_LIST_FAILED", message: error.message });
  }

  return ok(data ?? []);
}
