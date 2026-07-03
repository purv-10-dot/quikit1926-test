import { BudgetForm } from "@/components/budgets/BudgetForm";

export default function EditBudgetPage({ params }: { params: { id: string } }) {
  return <BudgetForm budgetId={params.id} />;
}
