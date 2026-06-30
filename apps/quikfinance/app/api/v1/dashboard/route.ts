import { requireApiContext } from "@/lib/api/auth";
import { fail, ok } from "@/lib/api/responses";
import { buildDashboardData, fallbackDashboard } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  try {
    const data = await buildDashboardData(auth.context);
    return ok(data);
  } catch {
    return ok(fallbackDashboard);
  }
}
