import { EpicsView } from "./_components/epics-view";

export default function EpicsPage({ params }: { params: { id: string } }) {
  return <EpicsView projectId={params.id} />;
}
