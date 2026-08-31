import { ReleasesView } from "./_components/releases-view";

export default function ReleasesPage({ params }: { params: { id: string } }) {
  return <ReleasesView projectId={params.id} />;
}
