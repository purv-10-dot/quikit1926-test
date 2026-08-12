import { RepositoryView } from "./_components/repository-view";

/**
 * Per-project "Tests" tab — the project-scoped QuikTest surface.
 *
 * No RequirePerm here: project-scoped routes are gated by the space layout's
 * route guard, which reads TAB_ROUTE_GATES from lib/projectTabs.ts. The "test"
 * entry there requires TestCase:view, so a direct URL visit without the grant is
 * bounced before this renders.
 */
export default function ProjectTestPage({ params }: { params: { id: string } }) {
  return <RepositoryView projectId={params.id} />;
}
