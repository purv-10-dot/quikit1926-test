import { TaskTableView } from "./_components/task-table-view";

export default function TaskTablePage({ params }: { params: { id: string } }) {
  return <TaskTableView projectId={params.id} />;
}
