"use client";

import { useState } from "react";
import { ExpenseForm } from "@/components/forms/ExpenseForm";
import { MileageForm } from "@/components/forms/MileageForm";
import { BulkExpenseForm } from "@/components/forms/BulkExpenseForm";
import { RecurringExpenseForm } from "@/components/forms/RecurringExpenseForm";
import { cn } from "@/lib/utils/cn";

const TABS = ["Record Expense", "Record Mileage", "Recurring Expense", "Bulk Add Expenses"] as const;
type Tab = (typeof TABS)[number];

export function ExpenseTabs() {
  const [tab, setTab] = useState<Tab>("Record Expense");
  return (
    <div className="space-y-5 animate-fade-up">
      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Record Expense" ? <ExpenseForm /> : tab === "Record Mileage" ? <MileageForm /> : tab === "Recurring Expense" ? <RecurringExpenseForm /> : <BulkExpenseForm />}
    </div>
  );
}
