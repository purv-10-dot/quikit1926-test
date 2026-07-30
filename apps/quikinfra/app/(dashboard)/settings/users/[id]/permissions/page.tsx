"use client";

/**
 * Per-user Permission Matrix — Add / Edit / Delete / View per menu row.
 *
 * Accessed via the "Rights" button on the User Management list page.
 * Persists to the same /api/settings/users/:id endpoint — the matrix is
 * stored as `user.permissionMatrix` on the row so it travels with the
 * user record through the existing demo-store (and later, the Prisma
 * migration path — just point this at the same Prisma model).
 *
 * Design mirrors the reference screenshot: module group headers,
 * per-row Add/Edit/Delete/View checkboxes, Grant All / Revoke All
 * quick actions, Copy Rights From template selector, Save/Close toolbar.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Check,
  CheckCircle2,
  AlertCircle,
  UserCircle2,
  Lock,
  type LucideIcon,
} from "lucide-react";
import {
  PageFrame,
  PageHeader,
  PageContainer,
  PrimaryButton,
  SecondaryButton,
} from "@/components/PageShell";
import {
  MENU_CATALOG,
  MATRIX_ACTIONS,
  buildDefaultMatrix,
  buildModuleScopedMatrix,
  mergeMatrix,
  groupByModule,
  type PermissionMatrix,
  type MatrixAction,
  type MatrixRow,
  type MenuItem,
} from "@/lib/rbac/menu-catalog";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";
import { siblingMenuKeys } from "@/lib/rbac/matrixV2Bridge";

/**
 * Icon + color mapping for the four action columns. Picked so a green
 * "view" stays calm while the destructive "delete" is red — admins
 * scanning the table pick out the high-risk column without reading.
 */
const ACTION_META: Record<MatrixAction, { icon: LucideIcon; tone: string; label: string }> = {
  add: { icon: Plus, tone: "text-emerald-600", label: "Add" },
  edit: { icon: Pencil, tone: "text-amber-600", label: "Edit" },
  delete: { icon: Trash2, tone: "text-rose-600", label: "Delete" },
  view: { icon: Eye, tone: "text-sky-600", label: "View" },
};

function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

/** Count a row as "any action granted" for the summary counters. */
function rowGranted(row: MatrixRow | undefined): boolean {
  if (!row) return false;
  return !!(row.add || row.edit || row.delete || row.view);
}

async function fetchUser(id: string) {
  const res = await fetch(`/api/settings/users/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function saveMatrix(id: string, matrix: PermissionMatrix) {
  const res = await fetch(`/api/settings/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissionMatrix: matrix }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Failed to save");
  }
  return res.json();
}

export default function UserPermissionMatrixPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params?.id as string;
  const qc = useQueryClient();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ["settings-user", userId],
    queryFn: () => fetchUser(userId),
    enabled: !!userId,
  });

  // Local editable matrix — seeded from user.permissionMatrix merged
  // onto the default scaffold so newly-added menu rows are present.
  const [matrix, setMatrix] = useState<PermissionMatrix>(() => buildDefaultMatrix(false));
  const [dirty, setDirty] = useState(false);

  // Lock the matrix ONLY for the CENTRAL admin — the org's own owner,
  // identified by quikit.OrgMember.role (org_admin / admin / super_admin).
  // That account came in as org_admin and has unrestricted access by
  // design, so its per-page permissions must never be editable. An admin
  // INVITED through the app holds the same app-level "admin" role but has
  // OrgMember.role = "member", so their matrix stays fully editable. This
  // mirrors the `isCentralAdmin` definition in src/lib/auth/context.ts.
  const CENTRAL_MEMBERSHIP_ROLES = [
    "super_admin",
    "platform_super_admin",
    "org_admin",
    "admin",
  ];
  const locked = CENTRAL_MEMBERSHIP_ROLES.includes(
    String(
      (user as { membershipRole?: string } | undefined)?.membershipRole ?? "",
    ).toLowerCase(),
  );

  useEffect(() => {
    if (!user) return;
    // Module-driven display: the matrix shows ONLY the user's assigned
    // modules (view-ticked by default), with the admin's own within-module
    // customizations preserved. Pages in unassigned modules stay off — this
    // avoids the old "granted-unless-revoked" noise where unrelated pages
    // (Assets, Quality delete, Approvals, …) appeared ticked just because a
    // revoke wasn't written or they shared a v2 resource with an assigned
    // module. Admins fine-tune within the assigned modules and Save.
    const seeded = buildModuleScopedMatrix(
      user.modulesAssigned,
      user.permissionMatrix,
    );
    setMatrix(seeded);
    setDirty(false);
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () => saveMatrix(userId, matrix),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["settings-user", userId] });
      qc.invalidateQueries({ queryKey: ["settings-users"] });
    },
  });

  // Pages that share one v2 resource (e.g. every MASTERS page →
  // construction.masters) cannot be granted/revoked independently — the
  // permission store is resource-level. So a toggle fans out to ALL pages
  // sharing the resource. Without this, unchecking a single page wrote no
  // revoke (matrixToRevokes only revokes a shared resource when EVERY page
  // on it is denied) and the cell reverted to checked on reload.
  const toggleCell = (menuKey: string, action: MatrixAction) => {
    if (locked) return; // central admin matrix is read-only
    const item = MENU_CATALOG.find((m) => m.key === menuKey);
    if (!item || !item.supports[action]) return; // unsupported cell stays off
    const nextValue = !matrix[menuKey]?.[action];
    const keys = siblingMenuKeys(menuKey);
    setMatrix((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        const sib = MENU_CATALOG.find((m) => m.key === k);
        if (!sib || !sib.supports[action]) continue; // skip pages lacking it
        const row = { ...next[k], [action]: nextValue };
        // View is a prerequisite for any action: you can't add/edit/delete a
        // page you can't see. So enabling add/edit/delete auto-enables view,
        // and disabling view clears add/edit/delete.
        if (nextValue && action !== "view" && sib.supports.view) {
          row.view = true;
        }
        if (!nextValue && action === "view") {
          if (sib.supports.add) row.add = false;
          if (sib.supports.edit) row.edit = false;
          if (sib.supports.delete) row.delete = false;
        }
        next[k] = row;
      }
      return next;
    });
    setDirty(true);
  };

  const toggleRow = (menuKey: string, value: boolean) => {
    if (locked) return; // central admin matrix is read-only
    const item = MENU_CATALOG.find((m) => m.key === menuKey);
    if (!item) return;
    const keys = siblingMenuKeys(menuKey);
    setMatrix((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        const sib = MENU_CATALOG.find((m) => m.key === k);
        if (!sib) continue;
        next[k] = {
          add: sib.supports.add && value,
          edit: sib.supports.edit && value,
          delete: sib.supports.delete && value,
          view: sib.supports.view && value,
        };
      }
      return next;
    });
    setDirty(true);
  };

  const assignedModuleCount = user?.modulesAssigned?.length ?? 0;

  const grouped = useMemo(() => groupByModule(), []);
  const descriptor = user ? getUserTypeDescriptor(user.userType) : null;

  // Pages that share one backend permission are controlled together (see
  // toggleCell/toggleRow). Surface those groups so admins understand why
  // ticking one row also ticks its neighbours — the permission store is
  // resource-level, not page-level, so independent control isn't possible
  // for these.
  const sharedGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: string[] = [];
    for (const item of MENU_CATALOG) {
      const keys = siblingMenuKeys(item.key);
      if (keys.length <= 1) continue;
      const id = [...keys].sort().join(",");
      if (seen.has(id)) continue;
      seen.add(id);
      const labels = keys
        .map((k) => MENU_CATALOG.find((m) => m.key === k)?.label)
        .filter((l): l is string => !!l);
      groups.push(labels.join(", "));
    }
    return groups;
  }, []);

  // Overall grant summary — "12 of 36 pages" — shown in the sticky footer
  // and as a micro-stat next to the user name. Recomputes on every matrix
  // change but cheap: iterates MENU_CATALOG once.
  const grantSummary = useMemo(() => {
    let granted = 0;
    let total = 0;
    for (const item of MENU_CATALOG) {
      total += 1;
      // Locked central admin = full access to every page by design, so the
      // counter always reads N/N regardless of any stale saved matrix.
      if (locked || rowGranted(matrix[item.key])) granted += 1;
    }
    return { granted, total };
  }, [matrix, locked]);

  if (isLoading) {
    return (
      <>
        <PageHeader
          title="User Management — Permissions"
          subtitle="Manage users, roles, and system access permissions"
          onBack={() => router.push("/settings/users")}
          breadcrumbs={[
            { label: "Settings", href: "/settings" },
            { label: "Users", href: "/settings/users" },
            { label: "Permissions" },
          ]}
        />
        <div className="px-6 max-w-[1600px] mx-auto pt-6 pb-24">
          {/* User summary card skeleton — same shape as the real card so
              the page doesn't reflow when data arrives. */}
          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 mb-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-accent-200" />
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-3 w-16 rounded bg-gray-100" />
              <div className="h-4 w-24 rounded bg-gray-100" />
              <div className="h-4 w-20 rounded bg-gray-100" />
              <div className="ml-auto flex items-center gap-2">
                <div className="h-3 w-20 rounded bg-gray-200" />
                <div className="h-1 w-24 rounded-full bg-gray-100" />
              </div>
            </div>
          </div>

          {/* Matrix skeleton — group header + a few rows */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-b from-gray-50 to-white border-b-2 border-gray-200 px-4 py-3 flex items-center gap-3 animate-pulse">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="flex-1" />
              <div className="h-5 w-12 rounded-full bg-emerald-100/70" />
              <div className="h-5 w-12 rounded-full bg-amber-100/70" />
              <div className="h-5 w-14 rounded-full bg-rose-100/70" />
              <div className="h-5 w-12 rounded-full bg-sky-100/70" />
            </div>
            {[0, 1].map((g) => (
              <div key={g}>
                <div className="bg-gradient-to-r from-indigo-50 via-indigo-50/60 to-white border-t-2 border-indigo-200/60 px-4 py-2.5 flex items-center gap-2.5 animate-pulse">
                  <div className="w-4 h-4 rounded border border-gray-300 bg-white" />
                  <div className="h-3 w-32 rounded bg-indigo-200/70" />
                  <div className="h-4 w-14 rounded-full bg-gray-100" />
                </div>
                {[0, 1, 2, 3].map((r) => (
                  <div
                    key={r}
                    className="border-t border-gray-100 px-4 py-2.5 pl-11 flex items-center gap-3 animate-pulse"
                  >
                    <div className="w-1 h-4 rounded-full bg-gray-200" />
                    <div className="h-4 w-44 rounded bg-gray-200" />
                    <div className="flex-1" />
                    <div className="h-3 w-32 rounded bg-gray-100" />
                    <div className="flex items-center gap-3 mr-2">
                      {[0, 1, 2, 3].map((c) => (
                        <div key={c} className="w-4 h-4 rounded border border-gray-200 bg-white" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Live status hint so screen readers + impatient eyes still
              get an explicit "we're loading" cue alongside the skeleton. */}
          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-500" />
            Loading user permissions…
          </div>
        </div>
      </>
    );
  }

  if (isError || !user) {
    return (
      <PageContainer>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
          Failed to load user. The user may have been deleted.
        </div>
      </PageContainer>
    );
  }

  return (
    <>
      <PageFrame>
      <PageHeader
        title="User Management — Permissions"
        subtitle="Manage users, roles, and system access permissions"
        onBack={() => router.push("/settings/users")}
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Users", href: "/settings/users" },
          { label: "Permissions" },
        ]}
      />
      {/* Layout intent: only the matrix table scrolls; the user-summary
          card, toolbar, page header and save bar (fixed) stay in place.

          Height comes from <PageFrame> (which is exactly as tall as the
          shell's <main>) rather than viewport math, so no second
          scrollbar can appear next to the matrix's own. The trailing
          `pb-24` reserves room for the fixed save bar so the table's
          bottom rows don't sit underneath it. */}
      <div className="px-6 max-w-[1600px] mx-auto w-full pt-6 pb-24 flex min-h-0 flex-1 flex-col">
        {/* ── User summary card ───────────────────────────────────────
            Avatar + two-row meta stack. Back to list is a small,
            low-emphasis link at top-right so it doesn't compete with
            the user identity.

            `shrink-0` keeps it at its natural height inside the flex
            column — without it, the table would push it to zero on
            short viewports. */}
        {/* Compact identity strip — avatar + name + chips on the left,
            grant counter + thin progress bar on the right. One line tall
            on desktop, wraps gracefully on narrow viewports. */}
        <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 mb-3 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-8 w-8 shrink-0 rounded-full bg-accent-500 text-white text-[11px] font-semibold flex items-center justify-center">
              {initials(user.fullName)}
            </div>
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {user.fullName}
              </span>
              <span className="text-[11px] text-gray-400">
                @{user.username}
              </span>
              {descriptor && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                  <UserCircle2 className="w-3 h-3" />
                  {descriptor.label}
                </span>
              )}
              {user.department && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {user.department}
                </span>
              )}
              {assignedModuleCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-50 text-accent-700">
                  <Layers className="w-3 h-3" />
                  {assignedModuleCount} module{assignedModuleCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="text-[11px] tabular-nums">
                <span className="font-semibold text-gray-900">
                  {grantSummary.granted}
                </span>
                <span className="text-gray-400"> / {grantSummary.total}</span>
                <span className="text-gray-500 ml-1">granted</span>
              </span>
              <div className="w-24 h-1 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    grantSummary.granted === 0
                      ? "bg-gray-300"
                      : grantSummary.granted / Math.max(grantSummary.total, 1) >= 0.7
                        ? "bg-emerald-500"
                        : "bg-amber-400"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (grantSummary.granted / Math.max(grantSummary.total, 1)) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Locked notice — the central org admin can't have per-page
            permissions edited; the matrix below is shown read-only. */}
        {locked && (
          <div className="mb-3 shrink-0 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800 leading-snug">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-600" />
            <span>
              <strong className="font-semibold">
                This is the central organisation admin
              </strong>{" "}
              — full access to every page by design. Permissions are locked
              for this account and can&apos;t be edited. (Admins you invite
              through the app remain editable here.)
            </span>
          </div>
        )}

        {/* Grouped-permission notice — some pages share one backend
            permission and are toggled together. Shown only when there are
            such groups and the matrix isn't locked. */}
        {!locked && sharedGroups.length > 0 && (
          <div className="mb-3 shrink-0 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800 leading-snug">
            <Layers className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-600" />
            <span>
              <strong className="font-semibold">
                Some pages share a single access permission
              </strong>{" "}
              and are controlled together — changing one updates its whole
              group. Grouped pages:{" "}
              {sharedGroups.map((g, i) => (
                <span key={g}>
                  {i > 0 && "; "}
                  <span className="font-medium">{g}</span>
                </span>
              ))}
              .
            </span>
          </div>
        )}

        {/* ── Matrix table ────────────────────────────────────────────
            The ONLY scrollable region on this page. The card frame
            stays put while its inner div scrolls Y; the sticky <thead>
            keeps the action column labels visible during scroll.
            `flex-1 min-h-0` is what lets the inner overflow-y-auto
            actually activate inside a flex parent — without min-h-0
            the row would refuse to shrink and the page would scroll
            the whole layout. */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-b from-gray-50 to-white border-b-2 border-gray-200 text-[10px] uppercase font-bold text-gray-600 tracking-wider shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
                  <th className="px-4 py-3 text-left w-[38%]">Menu Name</th>
                  <th className="px-4 py-3 text-left w-[28%]">Page URL</th>
                  {MATRIX_ACTIONS.map((a) => {
                    const Icon = ACTION_META[a].icon;
                    const chipTone = {
                      add: "bg-emerald-50 text-emerald-700 ring-emerald-200",
                      edit: "bg-amber-50 text-amber-700 ring-amber-200",
                      delete: "bg-rose-50 text-rose-700 ring-rose-200",
                      view: "bg-sky-50 text-sky-700 ring-sky-200",
                    }[a];
                    return (
                      <th key={a} className="px-2 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ring-inset ${chipTone}`}
                        >
                          <Icon className="w-3 h-3" />
                          <span className="tracking-wider">{ACTION_META[a].label}</span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([module, items]) => {
                  if (!items || items.length === 0) return null;
                  return (
                    <ModuleGroup
                      key={module}
                      module={module}
                      items={items}
                      matrix={matrix}
                      locked={locked}
                      onToggleCell={toggleCell}
                      onToggleRow={toggleRow}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </PageFrame>

      {/* ── Sticky save bar ──────────────────────────────────────────
          Always visible at the bottom so the admin can save without
          scrolling back up. Shows dirty state, overall grant count,
          and save feedback (error + success) inline. The thin top
          strip is a live progress meter of overall pages granted. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 shadow-lg">
        {/* <div className="h-1 w-full bg-gray-100/70 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              grantSummary.granted === 0
                ? "bg-gray-200"
                : grantSummary.granted / Math.max(grantSummary.total, 1) >= 0.7
                ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                : "bg-gradient-to-r from-amber-400 to-orange-500"
            }`}
            style={{
              width: `${Math.min(
                100,
                Math.round(
                  (grantSummary.granted / Math.max(grantSummary.total, 1)) * 100,
                ),
              )}%`,
            }}
          />
        </div> */}
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="text-xs text-gray-600">
              <span className="font-semibold text-gray-900 tabular-nums">
                {grantSummary.granted}
              </span>
              <span className="text-gray-400 tabular-nums"> / {grantSummary.total}</span>
              <span className="ml-1.5 text-gray-500">pages granted</span>
            </div>
            {dirty ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <AlertCircle className="w-3 h-3" /> Unsaved changes
              </span>
            ) : saveMutation.isSuccess ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            ) : null}
            {saveMutation.isError && (
              <span className="text-[11px] text-rose-600 truncate">
                {(saveMutation.error as Error)?.message ?? "Save failed"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SecondaryButton onClick={() => router.push("/settings/users")}>
              Close
            </SecondaryButton>
            <PrimaryButton
              onClick={() => saveMutation.mutate()}
              disabled={locked || !dirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Save Changes
                </>
              )}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </>
  );
}

function ModuleGroup({
  module,
  items,
  matrix,
  locked,
  onToggleCell,
  onToggleRow,
}: {
  module: string;
  items: MenuItem[];
  matrix: PermissionMatrix;
  /** Central admin → read-only: all cells forced checked + disabled. */
  locked: boolean;
  onToggleCell: (menuKey: string, action: MatrixAction) => void;
  onToggleRow: (menuKey: string, value: boolean) => void;
}) {
  // Count rows where ANY supported action is granted so the group header
  // can show "3 of 8 rows" at a glance — tells the admin where to focus
  // without expanding every module. Locked central admin = every row granted.
  const rowsGranted = locked
    ? items.length
    : items.filter((item) => rowGranted(matrix[item.key])).length;
  const rowsTotal = items.length;

  // "Whole module" toggle tri-state:
  //   - allOn   → every supported action on every row is granted
  //   - none    → nothing in the module is granted
  //   - partial → somewhere in between (checkbox shown indeterminate)
  const allOn =
    locked ||
    items.every((item) =>
      MATRIX_ACTIONS.every((a) => !item.supports[a] || matrix[item.key]?.[a])
    );
  const none = !locked && rowsGranted === 0;
  const partial = !allOn && !none;

  const toggleGroup = () => {
    // From partial/none → turn everything on; from allOn → turn off.
    const target = !allOn;
    for (const item of items) onToggleRow(item.key, target);
  };

  return (
    <>
      <tr className="bg-gradient-to-r from-indigo-50 via-indigo-50/60 to-white border-t-2 border-indigo-200/60">
        <td className="px-4 py-2.5 relative" colSpan={2}>
          <span aria-hidden className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-gradient-to-b from-indigo-400 to-indigo-600" />
          <label className={`flex items-center gap-2.5 group pl-2 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={allOn}
              disabled={locked}
              ref={(el) => {
                if (el) el.indeterminate = partial;
              }}
              onChange={toggleGroup}
              className={`w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 group-hover:text-indigo-700">
              {module}
            </span>
            <span
              className={`ml-1 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border tabular-nums ${
                allOn
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : partial
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}
            >
              <span
                aria-hidden
                className={`w-1.5 h-1.5 rounded-full ${
                  allOn ? "bg-emerald-500" : partial ? "bg-amber-500" : "bg-gray-400"
                }`}
              />
              {rowsGranted} / {rowsTotal}
            </span>
          </label>
        </td>
        <td colSpan={4} className="text-right pr-4">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              allOn
                ? "text-emerald-700 bg-emerald-50/70"
                : none
                ? "text-gray-500 bg-gray-50"
                : "text-amber-700 bg-amber-50/70"
            }`}
          >
            {allOn ? "All granted" : none ? "None granted" : "Partial"}
          </span>
        </td>
      </tr>
      {items.map((item, idx) => {
        const row = matrix[item.key] ?? { add: false, edit: false, delete: false, view: false };
        const anyGranted = locked || rowGranted(row);
        // Subtle zebra shading inside each module so long lists stay
        // scan-able. Hover raises the row contrast.
        const zebra = idx % 2 === 1 ? "bg-gray-50/40" : "bg-white";
        return (
          <tr
            key={item.key}
            className={`${zebra} border-t border-gray-100 hover:bg-accent-50 transition-colors`}
          >
            <td className="px-4 py-2.5 pl-11">
              <div className="flex items-center gap-2">
                <span
                  className={`w-1 h-4 rounded-full shrink-0 ${
                    anyGranted ? "bg-emerald-400" : "bg-gray-200"
                  }`}
                />
                {item.url ? (
                  <Link
                    href={item.url}
                    className="text-sm text-gray-800 hover:text-accent-600 hover:underline decoration-dotted underline-offset-2 transition-colors"
                    title={`Open ${item.label}`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-800">{item.label}</span>
                )}
              </div>
            </td>
            <td className="px-4 py-2.5 text-[11px] text-gray-400">
              {item.url ?? "—"}
            </td>
            {MATRIX_ACTIONS.map((a) => {
              const supported = item.supports[a];
              // Locked central admin → every supported cell shows granted + disabled.
              const checked = locked ? supported : !!row[a];
              return (
                <td key={a} className="px-2 py-1.5 text-center">
                  <label
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 ${
                      !supported
                        ? "cursor-not-allowed opacity-25"
                        : locked
                          ? "cursor-not-allowed"
                          : "hover:bg-gray-100 ring-1 ring-transparent hover:ring-gray-200 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked || !supported}
                      onChange={() => onToggleCell(item.key, a)}
                      className="w-4 h-4 rounded border-gray-300 text-accent-600 focus:ring-2 focus:ring-accent-500 disabled:cursor-not-allowed"
                    />
                  </label>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
