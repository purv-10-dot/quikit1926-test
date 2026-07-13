import { IdeasTableView } from "./_components/ideas-table-view";

export default function IdeasPage({ params }: { params: { id: string } }) {
  return <IdeasTableView projectId={params.id} />;
}
