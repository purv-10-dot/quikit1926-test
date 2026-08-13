import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";

/**
 * Root route. QuikFlow has no public marketing landing, so:
 *   - authenticated + has access → redirect to /dashboard
 *   - bounced here without access (?reason=no_app_access) → show the popup
 *   - unauthenticated → middleware already routed to the launcher handoff
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
      <AppAccessDeniedPopup appName="QuikFlow" />
      <p className="text-sm text-gray-500">Loading QuikFlow…</p>
    </main>
  );
}
