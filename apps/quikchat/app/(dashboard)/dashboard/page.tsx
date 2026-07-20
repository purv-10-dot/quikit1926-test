import { getSession } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/ChatShell";
import { ensureUserRole, collapseToLatestRole } from "@/lib/authz/seed";

export const dynamic = "force-dynamic";


/**
 * The QuikChat workspace, served at `/dashboard` (standard app-flow route).
 * `/` is the public marketing landing; authenticated users are redirected here.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { channel?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // RBAC v2 seed-before-check: ensure org roles exist AND the caller is bound
  // to one (admin for org_admins, else Member) before any gated action.
  // Idempotent + cheap after the first bind per user.
  await ensureUserRole(session.userId, session.orgId);
  await collapseToLatestRole(session.userId, session.orgId);

  const [user, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.org.findUnique({ where: { id: session.orgId } }),
  ]);
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You";
  const workspaceName = org?.name ?? "Workspace";
  // Single source of truth for the socket URL (see .env NEXT_PUBLIC_REALTIME_WS_URL).
  const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_WS_URL || "";

  return (
    <ChatShell
      currentUserId={session.userId}
      displayName={displayName}
      avatarUrl={user?.avatar ?? undefined}
      workspaceName={workspaceName}
      orgId={session.orgId}
      realtimeUrl={realtimeUrl}
      initialChannelId={searchParams.channel}
    />
  );
}
