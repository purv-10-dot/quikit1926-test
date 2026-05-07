import { ListView } from "./_components/list-view";

export default function ListPage({ params }: { params: { id: string } }) {
  return <ListView projectId={params.id} />;
}
