import { BacklogView } from "./_components/backlog-view";

export default function BacklogPage({ params }: { params: { id: string } }) {
  return <BacklogView projectId={params.id} />;
}
