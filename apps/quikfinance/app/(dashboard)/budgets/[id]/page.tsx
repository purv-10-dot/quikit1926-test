import { BudgetDetail } from "@/components/budgets/BudgetDetail";

export default function BudgetDetailPage({ params }: { params: { id: string } }) {
  return <BudgetDetail id={params.id} />;
}
