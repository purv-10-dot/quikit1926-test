import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureHelpdeskUser } from "@/lib/helpdesk-context";
import { HelpdeskShell } from "@/components/layout/HelpdeskShell";

// Reads the session per request — never statically cached.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.orgId) {
    redirect("/login");
  }

  const tenantId = session.user.orgId;
  const externalUserId = session.user.id;

  
  // Ensure HdTenant + default HdApp + HdUser exist (auto-provision from session).
  const user = await ensureHelpdeskUser(tenantId, externalUserId, session);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });


  // All apps for this tenant.
  const apps = await prisma.app.findMany({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: { name: "asc" },
  });

  // Categories with agents.
  const categories = await prisma.category.findMany({
    where: { tenant_id: tenantId },
    include: {
      subcategories: { orderBy: { sort_order: "asc" } },
      agents: {
        include: {
          user: { select: { id: true, external_id: true, name: true, email: true, avatar_url: true, color: true, role: true, title: true } },
          app: { select: { id: true, name: true, code: true, icon: true, color: true, accent: true } },
        },
      },
    },
    orderBy: { sort_order: "asc" },
  });

  // Tickets (initial batch).
  const tickets = await prisma.ticket.findMany({
    where: { tenant_id: tenantId },
    include: {
      app: { select: { id: true, name: true, code: true, icon: true, color: true, accent: true } },
      category: { select: { id: true, name: true, icon: true } },
      subcategory: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true, email: true, avatar_url: true, color: true, role: true } },
      assignee: { select: { id: true, name: true, email: true, avatar_url: true, color: true, role: true, title: true } },
      _count: { select: { messages: true, attachments: true } },
    },
    orderBy: [{ sla_due_at: "asc" }, { created_at: "desc" }],
    take: 200,
  });

  // Serialize Date → ISO for the client shell.
  const serialized = JSON.parse(
    JSON.stringify({
      user,
      apps,
      categories,
      tickets,
      tenant: { id: tenant.id, name: tenant.name, code: tenant.code, accent: tenant.accent },
    }),
  );

  return (
    <HelpdeskShell
      initialUser={serialized.user}
      initialApps={serialized.apps}
      initialCategories={serialized.categories}
      initialTickets={serialized.tickets}
      tenant={serialized.tenant}
      currentAppId={serialized.apps[0]?.id ?? ""}
    />
  );
}
