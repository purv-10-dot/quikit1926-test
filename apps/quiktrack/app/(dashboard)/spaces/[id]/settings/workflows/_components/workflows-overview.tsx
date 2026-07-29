"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Users } from "lucide-react";
import { AssignTypesDialog } from "./assign-types-dialog";
import { MigrationDialog, type MigrationItem } from "./migration-dialog";
import { toOverviewRows, type WorkflowSchemeResponse } from "./types";

async function fetchScheme(projectId: string): Promise<WorkflowSchemeResponse> {
  const r = await fetch(`/api/projects/${projectId}/workflow-scheme`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as WorkflowSchemeResponse;
}

const QKEY = (projectId: string) => ["quiktrack", "workflow-scheme", projectId];

/**
 * Space settings → Workflows. The scheme overview (Jira "Workflow Scheme"
 * screen): each workflow + the work types assigned to it, an Edit action, the
 * Assign-issue-types dialog, and the DRAFT publish/discard banner.
 */
export function WorkflowsOverview({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  // When a publish needs status migration, hold the affected statuses so the
  // MigrationDialog can collect an old→new mapping and re-publish.
  const [migration, setMigration] = useState<MigrationItem[] | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: QKEY(projectId),
    queryFn: () => fetchScheme(projectId),
  });

  const scheme = data?.scheme ?? null;
  const anyDraftWorkflowId = scheme?.items[0]?.workflow.id ?? null;

  const publish = useMutation({
    mutationFn: async (vars: { wfId: string; statusMapping?: Record<string, string> }) => {
      const r = await fetch(`/api/workflows/${vars.wfId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statusMapping: vars.statusMapping ?? {} }),
      });
      const j = await r.json();
      if (r.status === 422 && j.code === "NEEDS_MIGRATION") {
        // Signal the caller to open the migration dialog rather than error out.
        const err = new Error("NEEDS_MIGRATION") as Error & { migration?: MigrationItem[] };
        err.migration = j.migration as MigrationItem[];
        throw err;
      }
      if (!r.ok || !j.success) throw new Error(j.error ?? "Publish failed");
    },
    onSuccess: () => {
      setMigration(null);
      qc.invalidateQueries({ queryKey: QKEY(projectId) });
    },
    onError: (err: Error & { migration?: MigrationItem[] }) => {
      if (err.migration) setMigration(err.migration);
    },
  });

  const discard = useMutation({
    mutationFn: async (wfId: string) => {
      const r = await fetch(`/api/workflows/${wfId}/draft`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Discard failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY(projectId) }),
  });

  const enable = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/workflow-scheme/enable`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to enable");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY(projectId) }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-8 py-8 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-8 py-8 text-sm text-red-600">
        {(error as Error).message}
      </div>
    );
  }

  const rows = scheme ? toOverviewRows(scheme) : [];

  return (
    <div className="px-8 py-8">
      {scheme?.hasDraft && anyDraftWorkflowId && (
        <div className="mb-5 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <span className="font-medium text-amber-900">
            There are unpublished changes.
          </span>
          <span className="text-amber-800">Publish this draft now?</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => publish.mutate({ wfId: anyDraftWorkflowId })}
              disabled={publish.isPending}
              className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {publish.isPending ? "Publishing…" : "Publish"}
            </button>
            <button
              type="button"
              onClick={() => discard.mutate(anyDraftWorkflowId)}
              disabled={discard.isPending}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            >
              Discard Draft
            </button>
          </div>
        </div>
      )}

      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-lg font-semibold text-gray-900">Workflows</h1>
        {scheme?.hasDraft && (
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            DRAFT
          </span>
        )}
      </div>
      <p className="mb-5 text-sm text-gray-500">
        {scheme?.name ?? "This space has no workflow scheme yet."}
      </p>

      {publish.error && (publish.error as Error).message !== "NEEDS_MIGRATION" && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(publish.error as Error).message}
        </div>
      )}

      {migration && anyDraftWorkflowId && (
        <MigrationDialog
          projectId={projectId}
          items={migration}
          applying={publish.isPending}
          error={
            publish.error && (publish.error as Error).message !== "NEEDS_MIGRATION"
              ? (publish.error as Error).message
              : null
          }
          onCancel={() => setMigration(null)}
          onApply={(statusMapping) => publish.mutate({ wfId: anyDraftWorkflowId, statusMapping })}
        />
      )}

      {scheme ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <Users className="h-4 w-4" /> Assign issue types
            </button>
          </div>

          <div className="overflow-hidden rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-accent-50 text-left text-gray-600">
                  <th className="px-4 py-2 font-medium">Workflow</th>
                  <th className="px-4 py-2 font-medium">Work Types</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.workflow.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.workflow.name}</div>
                      <div className="text-xs text-gray-500">
                        {row.workflow._count.workflowStatuses} statuses ·{" "}
                        {row.workflow._count.transitions} transitions
                        {!row.workflow.isActive && " · draft"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.workTypes.join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/spaces/${projectId}/settings/workflows/${row.workflow.id}`}
                        className="inline-flex items-center gap-1.5 text-accent-700 hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit workflow
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                      No workflows in this scheme yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {assignOpen && data && (
            <AssignTypesDialog
              projectId={projectId}
              scheme={scheme}
              issueTypes={data.issueTypes}
              onClose={() => setAssignOpen(false)}
              onSaved={() => {
                setAssignOpen(false);
                qc.invalidateQueries({ queryKey: QKEY(projectId) });
              }}
            />
          )}
        </>
      ) : (
        <div className="max-w-lg">
          <p className="mb-4 text-sm text-gray-500">
            This space doesn&apos;t use a configurable workflow yet. Enable one to
            control which status transitions are allowed, add conditions,
            validators, and post-functions, and set resolutions.
          </p>
          <button
            type="button"
            onClick={() => enable.mutate()}
            disabled={enable.isPending}
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {enable.isPending ? "Enabling…" : "Enable workflows for this space"}
          </button>
          {enable.error && (
            <p className="mt-3 text-sm text-red-600">{(enable.error as Error).message}</p>
          )}
          <p className="mt-3 text-xs text-gray-400">
            This provisions a &ldquo;classic default workflow&rdquo; over this
            space&apos;s existing statuses. Existing issues are unaffected until
            you publish changes.
          </p>
        </div>
      )}
    </div>
  );
}
