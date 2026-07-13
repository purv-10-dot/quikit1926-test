"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { useI18n } from "@/lib/i18n";
import { todayISO } from "@/lib/utils/dates";

type SourceType = "invoice" | "bill";
type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "annually";
type Profile = {
  id: string;
  source_type: string;
  source_id: string;
  frequency: string;
  next_run_date: string;
  end_date: string | null;
  occurrence_count: number | null;
  is_active: boolean;
  profile_name: string | null;
  customer_name: string | null;
  amount: number | string | null;
};

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "annually"];

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function RecurringManager() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [sourceType, setSourceType] = useState<SourceType>("invoice");
  const [sourceId, setSourceId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(todayISO());
  const [occurrences, setOccurrences] = useState("");

  const { data: profiles = [] } = useQuery({
    queryKey: ["recurring"],
    queryFn: async () => (await fetchList("/api/v1/recurring")) as unknown as Profile[]
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["recurring-sources", sourceType],
    queryFn: async () => {
      const path = sourceType === "invoice" ? "/api/v1/invoices?per_page=100" : "/api/v1/bills?per_page=100";
      return (await fetchList(path)).map((row) => ({
        id: String(row.id),
        label: `${row[sourceType === "invoice" ? "invoice_number" : "bill_number"] ?? ""} · ${row.total ?? ""}`
      }));
    }
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["recurring"] });

  const create = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          source_id: sourceId,
          frequency,
          start_date: startDate,
          occurrence_count: occurrences ? Number(occurrences) : null
        })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Could not create profile");
      }
    },
    onSuccess: () => {
      toast.success(t("recurring.created", "Recurring profile created."));
      setSourceId("");
      refetch();
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const run = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/recurring/run", { method: "POST" });
      if (!response.ok) throw new Error("Run failed");
      return (await response.json()) as { data?: { generated?: number } };
    },
    onSuccess: (result) => {
      toast.success(t("recurring.ran", "Generated {n} document(s).", { n: result.data?.generated ?? 0 }));
      refetch();
      queryClient.invalidateQueries({ queryKey: ["module", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["module", "bills"] });
    },
    onError: () => toast.error(t("recurring.runFailed", "Could not run recurring profiles."))
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/v1/recurring/${id}`, { method: "DELETE" });
    },
    onSuccess: refetch
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={t("recurring.title", "Recurring transactions")}
          description={t("recurring.desc", "Schedule invoices and bills to generate automatically.")}
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
            <Play className="mr-2 h-4 w-4" />
            {t("recurring.runNow", "Run due now")}
          </Button>
          <Button asChild><Link href="/recurring/new"><Plus className="mr-2 h-4 w-4" />New Recurring Invoice</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("recurring.new", "New recurring profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!sourceId) {
                toast.error(t("recurring.pickSource", "Select a template document."));
                return;
              }
              create.mutate();
            }}
          >
            <div>
              <Label htmlFor="type">{t("recurring.type", "Type")}</Label>
              <select
                id="type"
                className={`${selectClass} mt-2`}
                value={sourceType}
                onChange={(event) => {
                  setSourceType(event.target.value as SourceType);
                  setSourceId("");
                }}
              >
                <option value="invoice">Invoice</option>
                <option value="bill">Bill</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="source">{t("recurring.template", "Template document")}</Label>
              <select id="source" className={`${selectClass} mt-2`} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">{t("common.select", "Select…")}</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>{source.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="freq">{t("recurring.frequency", "Frequency")}</Label>
              <select id="freq" className={`${selectClass} mt-2`} value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
                {FREQUENCIES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="start">{t("recurring.startDate", "Start date")}</Label>
              <Input id="start" type="date" className="mt-2" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="occ">{t("recurring.occurrences", "Occurrences (optional)")}</Label>
              <Input id="occ" type="number" min="1" className="mt-2" value={occurrences} onChange={(event) => setOccurrences(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={create.isPending}>{t("recurring.add", "Add profile")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("recurring.active", "Schedules")}</CardTitle>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recurring.none", "No recurring profiles yet.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Profile</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-left">{t("recurring.colType", "Type")}</th>
                    <th className="px-3 py-2 text-left">{t("recurring.colFreq", "Frequency")}</th>
                    <th className="px-3 py-2 text-left">{t("recurring.colNext", "Next run")}</th>
                    <th className="px-3 py-2 text-left">{t("recurring.colStatus", "Status")}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{profile.profile_name ?? "—"}</td>
                      <td className="px-3 py-2">{profile.customer_name ?? "—"}</td>
                      <td className="px-3 py-2 capitalize">{profile.source_type}</td>
                      <td className="px-3 py-2 capitalize">{profile.frequency}</td>
                      <td className="px-3 py-2 tabular-nums">{profile.next_run_date}</td>
                      <td className="px-3 py-2">{profile.is_active ? t("recurring.statusActive", "Active") : t("recurring.statusDone", "Ended")}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" aria-label={t("common.remove", "Remove")} onClick={() => remove.mutate(profile.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {t("recurring.runNow", "Run due now")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
