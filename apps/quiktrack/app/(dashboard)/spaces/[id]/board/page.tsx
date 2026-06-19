import { BoardView } from "./_components/board-view";

export default function BoardPage({ params }: { params: { id: string } }) {
  return <BoardView projectId={params.id} />;
}
