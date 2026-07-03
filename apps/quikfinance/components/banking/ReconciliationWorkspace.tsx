"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/utils/currency";

type ReconciliationPayload = {
  bank_account?: { id: string; name: string; institution_name: string | null } | null;
  summary: {
    statement_balance: number;
    book_balance: number;
    difference: number;
    last_reconciled_at: string | null;
  };
  rows: {
    id: string;
    statement_date: string;
    description: string;
    statement_amount: number;
    book_amount: number;
    status: string;
  }[];
};

export function ReconciliationWorkspace({ bankAccountId }: { bankAccountId: string }) {
  const [payloadText, setPayloadText] = useState("");
  const [statementStart, setStatementStart] = useState("2026-04-01");
  const [statementEnd, setStatementEnd] = useState("2026-04-30");
  const [statementBalance, setStatementBalance] = useState("0");

  const reconciliation = useQuery({
    queryKey: ["reconciliation", bankAccountId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/reconciliation?bank_account_id=${bankAccountId}`);
      if (!response.ok) {
        throw new Error("Bank reconciliation could not be loaded.");
      }
      const payload = (await response.json()) as { data?: ReconciliationPayload };
      return payload.data as ReconciliationPayload;
    }
  });

  const submitImport = async () => {
    if (!payloadText.trim()) {
      toast.error("Paste a statement CSV or JSON export first.");
      return;
    }

    const response = await fetch("/api/v1/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "import_statement",
        bank_account_id: bankAccountId,
        payload_text: payloadText
      })
    });

    if (!response.ok) {
      toast.error("Statement import failed.");
      return;
    }

    setPayloadText("");
    toast.success("Statement imported.");
    reconciliation.refetch();
  };

  const submitReconciliation = async () => {
    const response = await fetch("/api/v1/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reconcile",
        bank_account_id: bankAccountId,
        statement_start: statementStart,
        statement_end: statementEnd,
        statement_balance: Number(statementBalance)
      })
    });

    if (!response.ok) {
      toast.error("Reconciliation could not be saved.");
      return;
    }

    toast.success("Reconciliation saved.");
    reconciliation.refetch();
  };

  const data = reconciliation.data;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Bank reconciliation"
        description={`Import statements, review imported bank lines, and close the period for account ${data?.bank_account?.name ?? bankAccountId}.`}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Statement balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(data?.summary.statement_balance ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Book balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(data?.summary.book_balance ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Difference</CardTitle>
          </CardHeader>
          <CardContent className={data && data.summary.difference === 0 ? "text-2xl font-bold text-emerald-600" : "text-2xl font-bold text-amber-600"}>
            {formatMoney(data?.summary.difference ?? 0)}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Import statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="statement-payload">Paste CSV or JSON export</Label>
            <Textarea
              id="statement-payload"
              rows={10}
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              placeholder={"date,description,amount,reference\n2026-04-20,Northstar ACH,4000,ACH-4000"}
            />
            <Button onClick={submitImport}>Import statement</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Close reconciliation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="statement-start">Statement start</Label>
              <Input id="statement-start" type="date" value={statementStart} onChange={(event) => setStatementStart(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="statement-end">Statement end</Label>
              <Input id="statement-end" type="date" value={statementEnd} onChange={(event) => setStatementEnd(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="statement-balance">Statement balance</Label>
              <Input id="statement-balance" type="number" step="0.01" value={statementBalance} onChange={(event) => setStatementBalance(event.target.value)} />
            </div>
            <Button variant="secondary" onClick={submitReconciliation}>
              Save reconciliation
            </Button>
          </CardContent>
        </Card>
      </div>
      <DataTable
        title="Imported bank transactions"
        rows={data?.rows ?? []}
        columns={[
          { key: "statement_date", label: "Date", kind: "date" },
          { key: "description", label: "Description" },
          { key: "statement_amount", label: "Statement", kind: "money", align: "right" },
          { key: "book_amount", label: "Books", kind: "money", align: "right" },
          { key: "status", label: "Status", kind: "status" }
        ]}
      />
    </div>
  );
}
