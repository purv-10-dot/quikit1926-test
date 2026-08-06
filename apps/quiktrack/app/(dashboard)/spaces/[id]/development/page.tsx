import { DevelopmentTabView } from "./_components/development-tab-view";

export default function DevelopmentPage({ params }: { params: { id: string } }) {
  return <DevelopmentTabView projectId={params.id} />;
}
