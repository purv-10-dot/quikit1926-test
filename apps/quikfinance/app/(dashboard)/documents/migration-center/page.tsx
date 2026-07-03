"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

const SOURCE_LABELS: Record<string, string> = {
  tally: "Tally",
  zoho_books: "Zoho Books",
  quickbooks: "QuickBooks",
  excel: "Excel/CSV",
  other: "Other"
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  partial: "bg-orange-100 text-orange-700"
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MigrationCenterPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/v1/migration/jobs");
      return res.json();
    }
  });

  const { data: rowsData, isLoading: rowsLoading } = useQuery({
    queryKey: ["import-rows", selectedJob],
    enabled: !!selectedJob,
    queryFn: async () => {
      const res = await fetch(`/api/v1/migration/jobs/${selectedJob}/rows`);
      return res.json();
    }
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/v1/migration/jobs/${jobId}/retry`, { method: "POST" });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["import-jobs"] })
  });

  const jobs = jobsData?.data ?? [];
  const rows = rowsData?.data ?? [];
  const rowsMeta = rowsData?.meta ?? {};

  const selectedJobData = jobs.find((j: Record<string, unknown>) => String(j.id) === selectedJob);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Migration Center"
        description="Import and track data migrations from Tally, Zoho Books, QuickBooks, or CSV files. Monitor row-level status and retry failed records."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Jobs</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{jobs.length}</p></CardContent></Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-green-600">Completed</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-green-600">{jobs.filter((j: Record<string, unknown>) => j.status === "completed").length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-red-600">Failed</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-red-600">{jobs.filter((j: Record<string, unknown>) => j.status === "failed" || j.status === "partial").length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-blue-600">Processing</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-blue-600">{jobs.filter((j: Record<string, unknown>) => j.status === "processing").length}</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold mb-3">Import Jobs</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Job</th>
                  <th className="text-left px-4 py-3 font-medium">Source</th>
                  <th className="text-right px-4 py-3 font-medium">Rows</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && jobs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No import jobs found.</td></tr>
                )}
                {jobs.map((job: Record<string, unknown>) => {
                  const total = Number(job.total_rows ?? 0);
                  const success = Number(job.success_rows ?? 0);
                  const failed = Number(job.failed_rows ?? 0);
                  const isSelected = selectedJob === String(job.id);
                  return (
                    <tr
                      key={String(job.id)}
                      className={`transition-colors cursor-pointer ${isSelected ? "bg-muted/50" : "hover:bg-muted/30"}`}
                      onClick={() => setSelectedJob(isSelected ? null : String(job.id))}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{String(job.file_name ?? "—")}</p>
                        <p className="text-xs text-muted-foreground">{job.created_at ? fmtDate(String(job.created_at)) : "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{SOURCE_LABELS[String(job.source)] ?? String(job.source ?? "—")}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-green-600">{success}</span>
                        {failed > 0 && <><span className="text-muted-foreground mx-1">/</span><span className="text-red-600">{failed}</span></>}
                        <span className="text-muted-foreground text-xs"> /{total}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[String(job.status)] ?? "bg-muted text-muted-foreground"}`}>
                          {String(job.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {(job.status === "failed" || job.status === "partial") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryMutation.mutate(String(job.id))}
                            disabled={retryMutation.isPending}
                          >
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-3">
            {selectedJobData
              ? `Row Details — ${String(selectedJobData.file_name ?? "")}`
              : "Row Details"}
          </h2>

          {!selectedJob && (
            <div className="rounded-lg border flex items-center justify-center h-48 text-muted-foreground text-sm">
              Click a job to inspect its rows
            </div>
          )}

          {selectedJob && (
            <>
              {rowsMeta.summary && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="rounded-md border px-3 py-2 text-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold">{rowsMeta.summary.total ?? 0}</p>
                  </div>
                  <div className="rounded-md border px-3 py-2 text-center border-green-200">
                    <p className="text-xs text-green-600">Success</p>
                    <p className="font-bold text-green-600">{rowsMeta.summary.success ?? 0}</p>
                  </div>
                  <div className="rounded-md border px-3 py-2 text-center border-red-200">
                    <p className="text-xs text-red-600">Failed</p>
                    <p className="font-bold text-red-600">{rowsMeta.summary.failed ?? 0}</p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Entity</th>
                      <th className="text-center px-3 py-2 font-medium">Status</th>
                      <th className="text-left px-3 py-2 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rowsLoading && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Loading rows…</td></tr>
                    )}
                    {!rowsLoading && rows.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No rows found.</td></tr>
                    )}
                    {rows.map((row: Record<string, unknown>, i: number) => {
                      const entityRef = row.entity_ref != null ? String(row.entity_ref) : null;
                      return (
                        <tr key={String(row.id ?? i)} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 text-right text-muted-foreground text-xs">{Number(row.row_number ?? i + 1)}</td>
                          <td className="px-3 py-2">
                            <span className="capitalize text-xs">{String(row.entity_type ?? "—")}</span>
                            {entityRef && <span className="text-muted-foreground text-xs ml-1">#{entityRef}</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={row.status === "success" ? "default" : row.status === "failed" ? "destructive" : "secondary"}>
                              {String(row.status ?? "pending")}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-red-600 max-w-xs truncate" title={String(row.error_message ?? "")}>
                            {row.error_message ? String(row.error_message) : "—"}
                          </td>
                        </tr>                      );                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
