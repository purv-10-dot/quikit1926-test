import { RunnerView } from "./_components/runner-view";

/**
 * The manual execution runner for one run.
 *
 * Nested under the project's `test` tab segment, so the space layout's route
 * guard (TAB_ROUTE_GATES → TestCase:view) already gates it. Recording a result
 * is separately gated server-side on TestResult:create.
 */
export default function RunnerPage({
  params,
}: {
  params: { id: string; runId: string };
}) {
  return <RunnerView projectId={params.id} runId={params.runId} />;
}
