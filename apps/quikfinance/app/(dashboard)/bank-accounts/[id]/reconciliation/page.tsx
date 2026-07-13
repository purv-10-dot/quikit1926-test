import { ReconciliationWorkspace } from "@/components/banking/ReconciliationWorkspace";

export default function ReconciliationPage({ params }: { params: { id: string } }) {
  return <ReconciliationWorkspace bankAccountId={params.id} />;
}
