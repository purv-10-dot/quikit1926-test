import { TimelineView } from "./_components/timeline-view";

export default function TimelinePage({ params }: { params: { id: string } }) {
  return <TimelineView projectId={params.id} />;
}
