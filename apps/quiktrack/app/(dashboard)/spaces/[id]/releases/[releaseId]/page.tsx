import { ReleaseDetailView } from "./_components/release-detail-view";

export default function ReleaseDetailPage({
  params,
}: {
  params: { id: string; releaseId: string };
}) {
  return <ReleaseDetailView projectId={params.id} releaseId={params.releaseId} />;
}
