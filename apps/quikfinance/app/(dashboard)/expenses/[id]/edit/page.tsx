import { ExpenseForm } from "@/components/forms/ExpenseForm";

export default function EditExpensePage({ params }: { params: { id: string } }) {
  return <ExpenseForm expenseId={params.id} />;
}
