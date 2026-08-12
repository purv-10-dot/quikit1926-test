import { RunListView } from "./_components/run-list-view";

/** Runs for one project — entry point to the runner. */
export default function ProjectRunsPage({ params }: { params: { id: string } }) {
  return <RunListView projectId={params.id} />;
}
