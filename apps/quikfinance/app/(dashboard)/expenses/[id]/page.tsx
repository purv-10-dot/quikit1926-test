import { ExpenseDetail } from "@/components/expenses/ExpenseDetail";

export default function ExpenseDetailPage({ params }: { params: { id: string } }) {
  return <ExpenseDetail id={params.id} />;
}
