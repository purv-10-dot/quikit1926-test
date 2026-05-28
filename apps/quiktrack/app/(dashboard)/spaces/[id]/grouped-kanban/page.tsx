import { GroupedKanbanView } from "./_components/grouped-kanban-view";

export const dynamic = "force-dynamic";

export default function GroupedKanbanPage({ params }: { params: { id: string } }) {
  return <GroupedKanbanView projectId={params.id} />;
}
