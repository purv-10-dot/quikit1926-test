"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import {
  StatusTable,
  TemplateTable,
  type StatusRow,
  type TemplateRow,
} from "./config-tables";

/**
 * Settings → Test statuses (org-scoped, read-only + repair).
 *
 * Why read-only for now: the nine statuses are a fixed vocabulary defined in
 * `lib/test/statuses.ts`, and `key` is what CI matches on when it posts results —
 * so editing is a separate, more careful piece of work. What this screen gives you
 * today is visibility (which statuses exist, which is the default) and a repair
 * action for the one failure that actually bit us.
 *
 * That failure: the migration seeded statuses with a CROSS JOIN over the orgs that
 * existed at the time, so any org created later had none and "Create run" died with
 * "No default test status is configured for this organisation." Provisioning now
 * happens on project creation and again as a backstop on run creation, so this
 * button should never be needed — it exists for the case where a status was
 * deleted, and so the state is inspectable instead of only surfacing as an error.
 */

export function TestStatusesView() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusesKey = ["quiktrack", "test-statuses"] as const;
  const { data: statuses, isLoading } = useApiData<StatusRow[]>(
    statusesKey,
    "/api/test/statuses",
    { staleTime: 0 },
  );

  const provisionKey = ["quiktrack", "test-statuses", "provision"] as const;
  const { data: provision } = useApiData<{
    missing: string[];
    missingTemplates: string[];
    complete: boolean;
  }>(provisionKey, "/api/test/statuses/provision", { staleTime: 0 });

  const templatesKey = ["quiktrack", "test-templates"] as const;
  const { data: templates } = useApiData<TemplateRow[]>(
    templatesKey,
    "/api/test/templates",
    { staleTime: 0 },
  );

  const rows = [...(statuses ?? [])].sort((a, b) => a.orderNo - b.orderNo);
  const missing = provision?.missing ?? [];
  const missingTemplates = provision?.missingTemplates ?? [];
  const hasDefault = rows.some((s) => s.isDefault);
  const templateRows = templates ?? [];

  const restore = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/test/statuses/provision", { method: "POST" });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: {
          created: string[];
          createdTemplates: string[];
          alreadyComplete: boolean;
        };
      };
      if (!json.success) {
        setError(json.error ?? "Could not restore the defaults.");
        return;
      }
      const created = json.data?.created ?? [];
      const createdTemplates = json.data?.createdTemplates ?? [];
      const parts: string[] = [];
      if (created.length > 0) {
        parts.push(
          `${created.length} status${created.length === 1 ? "" : "es"} (${created.join(", ")})`,
        );
      }
      if (createdTemplates.length > 0) {
        parts.push(
          `${createdTemplates.length} template${createdTemplates.length === 1 ? "" : "s"} (${createdTemplates.join(", ")})`,
        );
      }
      setMessage(
        parts.length === 0
          ? "Nothing to restore — all statuses and templates are already present."
          : `Restored ${parts.join(" and ")}.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statusesKey }),
        queryClient.invalidateQueries({ queryKey: provisionKey }),
        queryClient.invalidateQueries({ queryKey: templatesKey }),
      ]);
    } catch {
      setError("Could not restore the default statuses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    // Left-aligned, not centred: every other page under /settings starts at the
    // sidebar edge, and centring this one left a wide empty gutter beside the nav.
    <div className="max-w-3xl px-6 py-6">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">QuikTest configuration</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        The outcomes a tester can record and the case layouts they can choose. Both
        apply to <strong className="font-medium text-gray-700">every project</strong>{" "}
        in this organisation.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">Test statuses</h2>

      {/* State first: if something is missing, that is the only thing worth reading
          on this page. */}
      {missing.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {missing.length} status{missing.length === 1 ? " is" : "es are"} missing
          </p>
          <p className="mt-1 pl-6 text-xs leading-relaxed text-amber-800">
            Creating a test run needs these, so runs will fail until they are
            restored. Missing: {missing.join(", ")}.
          </p>
        </div>
      )}

      {missingTemplates.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {missingTemplates.length} case template
            {missingTemplates.length === 1 ? " is" : "s are"} missing
          </p>
          <p className="mt-1 pl-6 text-xs leading-relaxed text-amber-800">
            {/* This one fails QUIETLY, which is why it is worth stating: the editor
                falls back to the step layout rather than erroring, so the missing
                layouts just never appear. */}
            The case editor&apos;s Template dropdown will show fewer options (or
            &ldquo;No options&rdquo;) and fall back to the step-based layout. Missing:{" "}
            {missingTemplates.join(", ")}.
          </p>
        </div>
      )}

      {!hasDefault && rows.length > 0 && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-medium text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            No default status is set
          </p>
          <p className="mt-1 pl-6 text-xs leading-relaxed text-rose-800">
            A new test starts in the default status (normally Untested). Without one,
            creating a run fails. Restoring the defaults will re-add it.
          </p>
        </div>
      )}

      {message && (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <StatusTable rows={rows} loading={isLoading} />

      {/* Templates sit on the same page because they fail the same way and are fixed
          by the same button — splitting them would mean two screens for one class of
          problem. */}
      <h2 className="mt-8 text-sm font-semibold text-gray-900 dark:text-gray-100">Case templates</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Which layout the case editor offers — steps, a single expected result, BDD
        prose, or an exploratory charter.
      </p>

      <TemplateTable rows={templateRows} />

      {/* pb-10 so the row clears the floating chat bubble, which sits bottom-right
          and was clipping this button. `whitespace-nowrap` + `shrink-0` stop the
          label wrapping to two lines in a narrow column. */}
      <div className="mt-4 flex flex-wrap items-center gap-3 pb-10">
        <button
          type="button"
          onClick={restore}
          disabled={busy}
          className="shrink-0 whitespace-nowrap rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Restoring…" : "Restore missing defaults"}
        </button>
        <p className="min-w-0 flex-1 text-xs text-gray-400">
          Adds any missing statuses and templates. Existing ones, including renamed
          ones, are left untouched.
        </p>
      </div>
    </div>
  );
}
