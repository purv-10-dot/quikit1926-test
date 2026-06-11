import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { TasksExplorer } from "@/components/tasks/tasks-explorer";
import { ExportButton } from "@/components/reports/export-button";

export default async function TasksPage() {
  const user = await requireUser();

  // Assignee directory for the modal + table label resolution. The CRM
  // intentionally has no cross-schema relation from CrmTask → User, so we
  // pre-compute names server-side once per page render.
  const memberships = await prisma.orgMember.findMany({
    where: { orgId: user.orgId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  const assignees = memberships
    .map((m) => ({
      id: m.user.id,
      name: `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email || m.user.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Plan, track, and close out your work"
        actions={<ExportButton apiPath="/api/tasks" size="md" />}
      />
      <TasksExplorer currentUserId={user.userId} assignees={assignees} />
    </div>
  );
}
