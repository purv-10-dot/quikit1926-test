import { SummaryView } from "./_components/summary-view";

export default function SummaryPage({ params }: { params: { id: string } }) {
  return <SummaryView projectId={params.id} />;
}
