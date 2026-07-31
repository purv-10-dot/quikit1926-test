import { ReportsView } from "./_components/reports-view";

export default function ReportsPage({ params }: { params: { id: string } }) {
  return <ReportsView projectId={params.id} />;
}
