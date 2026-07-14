import { getSession } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/ChatShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { channel?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.org.findUnique({ where: { id: session.orgId } }),
  ]);
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You";
  const workspaceName = org?.name ?? "Workspace";
  const realtimeUrl = process.env.REALTIME_URL || "";

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
