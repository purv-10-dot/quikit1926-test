import { IssueFullView } from "@/components/issue-full-view/issue-full-view";

export default function IssueWorkPage({
  params,
}: {
  params: { id: string; issueId: string };
}) {
  return <IssueFullView projectId={params.id} issueId={params.issueId} />;
}
