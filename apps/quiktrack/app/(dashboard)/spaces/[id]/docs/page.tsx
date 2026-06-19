import { DocsView } from "./_components/docs-view";

export default function DocsPage({ params }: { params: { id: string } }) {
  return <DocsView projectId={params.id} />;
}
