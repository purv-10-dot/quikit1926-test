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
  ShieldCheck,
  ShieldX,
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
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PrimaryButton,
  SecondaryButton,
} from "@/components/PageShell";
import { SelectInput } from "@/components/FormDrawer";
import {
  MENU_CATALOG,
  MATRIX_ACTIONS,
  buildDefaultMatrix,
  buildMatrixFromModules,
  mergeMatrix,
  groupByModule,
  type PermissionMatrix,
  type MatrixAction,
  type MatrixRow,
  type MenuItem,
} from "@/lib/rbac/menu-catalog";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";

/**
 * Icon + color mapping for the four action columns. Picked so a green
 * "view" stays calm while the destructive "delete" is red — admins
 * scanning the table pick out the high-risk column without reading.
 */
const ACTION_META: Record<MatrixAction, { icon: any; tone: string; label: string }> = {
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

  useEffect(() => {
    if (!user) return;
    // First load behaviour:
    //  - If the user already has a saved matrix, use it verbatim (merged
    //    onto the default scaffold so newly-added rows are present).
    //  - Otherwise seed from modulesAssigned: grant everything for assigned
    //    modules, deny the rest. Admins can then fine-tune and Save.
    const hasSavedMatrix =
      user.permissionMatrix &&
      typeof user.permissionMatrix === "object" &&
      Object.keys(user.permissionMatrix).length > 0;
    const base = hasSavedMatrix
      ? buildDefaultMatrix(false)
      : buildMatrixFromModules(user.modulesAssigned);
    const merged = hasSavedMatrix
      ? mergeMatrix(base, user.permissionMatrix)
      : base;
    setMatrix(merged);
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

  const toggleCell = (menuKey: string, action: MatrixAction) => {
    const item = MENU_CATALOG.find((m) => m.key === menuKey);
    if (!item || !item.supports[action]) return; // unsupported cell stays off
    setMatrix((prev) => ({
      ...prev,
      [menuKey]: {
        ...prev[menuKey],
        [action]: !prev[menuKey]?.[action],
      },
    }));
    setDirty(true);
  };

  const toggleRow = (menuKey: string, value: boolean) => {
    const item = MENU_CATALOG.find((m) => m.key === menuKey);
    if (!item) return;
    setMatrix((prev) => ({
      ...prev,
      [menuKey]: {
        add: item.supports.add && value,
        edit: item.supports.edit && value,
        delete: item.supports.delete && value,
        view: item.supports.view && value,
      },
    }));
    setDirty(true);
  };

  const grantAll = () => {
    setMatrix(buildDefaultMatrix(true));
    setDirty(true);
  };

  const revokeAll = () => {
    setMatrix(buildDefaultMatrix(false));
    setDirty(true);
  };

  // Re-apply module assignment → permission matrix. Overwrites whatever is
  // on screen with "all actions on for assigned modules, everything else off".
  // Useful after editing the user's Modules on the user form and wanting
  // the matrix to reflect that without hand-ticking every row.
  const syncFromModules = () => {
    if (!user) return;
    setMatrix(buildMatrixFromModules(user.modulesAssigned));
    setDirty(true);
  };

  const assignedModuleCount = user?.modulesAssigned?.length ?? 0;

  // Copy-rights template dropdown — preset matrices that match common
  // user types. Picking "ADMIN" grants everything; "USER" gives View
  // only across the board.
  const applyTemplate = (templateKey: string) => {
    if (templateKey === "ADMIN") {
      setMatrix(buildDefaultMatrix(true));
      setDirty(true);
      return;
    }
    if (templateKey === "USER") {
      const viewOnly = buildDefaultMatrix(false);
      for (const item of MENU_CATALOG) {
        if (item.supports.view) viewOnly[item.key].view = true;
      }
      setMatrix(viewOnly);
      setDirty(true);
      return;
    }
    if (templateKey === "SITE_ADMIN") {
      // Site Admin gets full rights on PROJECT MGMT / PURCHASE / STORE,
      // read-only on ORGANIZATION / MASTERS (except Locations which they own).
      const m = buildDefaultMatrix(true);
      for (const item of MENU_CATALOG) {
        if (
          (item.module === "ORGANIZATION" || item.module === "MASTERS") &&
          item.key !== "master.location"
        ) {
          m[item.key] = {
            add: false, edit: false, delete: false,
            view: item.supports.view,
          };
        }
      }
      setMatrix(m);
      setDirty(true);
      return;
    }
  };

  const grouped = useMemo(() => groupByModule(), []);
  const descriptor = user ? getUserTypeDescriptor(user.userType) : null;

  // Overall grant summary — "12 of 36 pages" — shown in the sticky footer
  // and as a micro-stat next to the user name. Recomputes on every matrix
  // change but cheap: iterates MENU_CATALOG once.
  const grantSummary = useMemo(() => {
    let granted = 0;
    let total = 0;
    for (const item of MENU_CATALOG) {
      total += 1;
      if (rowGranted(matrix[item.key])) granted += 1;
    }
    return { granted, total };
  }, [matrix]);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-24 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading user…
        </div>
      </PageContainer>
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
      <PageHeader
        title="User Management — Permissions"
        subtitle="Manage users, roles, and system access permissions"
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Users", href: "/settings/users" },
          { label: "Permissions" },
        ]}
      />
      {/* Layout intent: only the matrix table scrolls; the user-summary
          card, toolbar, page header (sticky), and save bar (fixed) stay
          fixed in place.

          Sizing math: dashboard top bar is h-14 (56px) and PageHeader
          is ~88px (py-4 + breadcrumb + title), so 144px = 9rem of
          chrome lives above this wrapper. The wrapper takes the rest
          of the viewport and uses a flex column inside to give the
          table the leftover height. The trailing `pb-24` reserves
          room for the fixed save bar so the table's bottom rows
          don't sit underneath it.

          The `min-h-[640px]` floor keeps the layout usable on short
          viewports — without it, the table could collapse to nothing. */}
      <div className="px-6 max-w-[1600px] mx-auto pt-6 pb-24 h-[calc(100vh-9rem)] min-h-[640px] flex flex-col">
        {/* ── User summary card ───────────────────────────────────────
            Avatar + two-row meta stack. Back to list is a small,
            low-emphasis link at top-right so it doesn't compete with
            the user identity.

            `shrink-0` keeps it at its natural height inside the flex
            column — without it, the table would push it to zero on
            short viewports. */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 mb-4 shrink-0">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white font-semibold text-base flex items-center justify-center shadow-sm">
              {initials(user.fullName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                <h2 className="text-lg font-bold text-gray-900 leading-tight">
                  {user.fullName}
                </h2>
                <span className="font-mono text-xs text-gray-500">
                  @{user.username}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    grantSummary.granted === 0
                      ? "bg-gray-50 text-gray-500 border-gray-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {grantSummary.granted} of {grantSummary.total} pages granted
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {descriptor && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <UserCircle2 className="w-3 h-3" />
                    {descriptor.label}
                  </span>
                )}
                {user.department && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-200">
                    {user.department}
                  </span>
                )}
                {assignedModuleCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                    <Layers className="w-3 h-3" />
                    {assignedModuleCount} module{assignedModuleCount === 1 ? "" : "s"} assigned
                  </span>
                )}
              </div>
              {descriptor?.shortDescription && (
                <p className="text-[11px] text-gray-500 mt-2 max-w-2xl leading-relaxed">
                  {descriptor.shortDescription}
                </p>
              )}
            </div>
            <Link
              href="/settings/users"
              className="text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded-md hover:bg-gray-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to List
            </Link>
          </div>
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────
            Quick Actions on the left, template copy on the right,
            thin vertical divider between. Wraps on small viewports.
            `shrink-0` keeps it at its natural height inside the flex
            column. */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 mb-4 shrink-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Quick Actions
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={grantAll}
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Grant All
                </button>
                <button
                  type="button"
                  onClick={revokeAll}
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                >
                  <ShieldX className="w-3.5 h-3.5" /> Revoke All
                </button>
                <button
                  type="button"
                  onClick={syncFromModules}
                  disabled={assignedModuleCount === 0}
                  title={
                    assignedModuleCount === 0
                      ? "Assign modules on the user form first"
                      : `Grant full rights on the ${assignedModuleCount} assigned module(s), deny the rest`
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Layers className="w-3.5 h-3.5" /> Sync from Modules
                </button>
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200 hidden sm:block" />

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Copy from Template
              </label>
              <div className="min-w-[220px]">
                <SelectInput
                  value=""
                  onChange={(v) => {
                    if (v) applyTemplate(v);
                  }}
                  placeholder="— Select a template —"
                  options={[
                    { value: "ADMIN", label: "Admin (all rights)" },
                    { value: "SITE_ADMIN", label: "Site Admin (no admin masters)" },
                    { value: "USER", label: "User (view-only)" },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

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
                <tr className="bg-gray-50 border-b-2 border-gray-200 text-[10px] uppercase font-bold text-gray-600 tracking-wider">
                  <th className="px-4 py-3 text-left w-[38%]">Menu Name</th>
                  <th className="px-4 py-3 text-left w-[28%]">Page URL</th>
                  {MATRIX_ACTIONS.map((a) => {
                    const Icon = ACTION_META[a].icon;
                    return (
                      <th key={a} className="px-2 py-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          <Icon className={`w-3.5 h-3.5 ${ACTION_META[a].tone}`} />
                          <span>{ACTION_META[a].label}</span>
                        </div>
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

      {/* ── Sticky save bar ──────────────────────────────────────────
          Always visible at the bottom so the admin can save without
          scrolling back up. Shows dirty state, overall grant count,
          and save feedback (error + success) inline. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="text-xs text-gray-600">
              <span className="font-semibold text-gray-900">
                {grantSummary.granted}
              </span>
              <span className="text-gray-400"> / {grantSummary.total}</span>
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
              disabled={!dirty || saveMutation.isPending}
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
  onToggleCell,
  onToggleRow,
}: {
  module: string;
  items: MenuItem[];
  matrix: PermissionMatrix;
  onToggleCell: (menuKey: string, action: MatrixAction) => void;
  onToggleRow: (menuKey: string, value: boolean) => void;
}) {
  // Count rows where ANY supported action is granted so the group header
  // can show "3 of 8 rows" at a glance — tells the admin where to focus
  // without expanding every module.
  const rowsGranted = items.filter((item) => rowGranted(matrix[item.key])).length;
  const rowsTotal = items.length;

  // "Whole module" toggle tri-state:
  //   - allOn   → every supported action on every row is granted
  //   - none    → nothing in the module is granted
  //   - partial → somewhere in between (checkbox shown indeterminate)
  const allOn = items.every((item) =>
    MATRIX_ACTIONS.every((a) => !item.supports[a] || matrix[item.key]?.[a])
  );
  const none = rowsGranted === 0;
  const partial = !allOn && !none;

  const toggleGroup = () => {
    // From partial/none → turn everything on; from allOn → turn off.
    const target = !allOn;
    for (const item of items) onToggleRow(item.key, target);
  };

  return (
    <>
      <tr className="bg-gradient-to-r from-indigo-50/80 via-indigo-50/60 to-transparent border-t-2 border-indigo-100">
        <td className="px-4 py-2.5" colSpan={2}>
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={allOn}
              ref={(el) => {
                if (el) el.indeterminate = partial;
              }}
              onChange={toggleGroup}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 group-hover:text-indigo-700">
              {module}
            </span>
            <span
              className={`ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                allOn
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : partial
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}
            >
              {rowsGranted} / {rowsTotal}
            </span>
          </label>
        </td>
        <td colSpan={4} className="text-right pr-4">
          <span className="text-[10px] font-medium text-indigo-600/70 uppercase tracking-wider">
            {allOn ? "All granted" : none ? "None granted" : "Partial"}
          </span>
        </td>
      </tr>
      {items.map((item, idx) => {
        const row = matrix[item.key] ?? { add: false, edit: false, delete: false, view: false };
        const anyGranted = rowGranted(row);
        // Subtle zebra shading inside each module so long lists stay
        // scan-able. Hover raises the row contrast.
        const zebra = idx % 2 === 1 ? "bg-gray-50/40" : "bg-white";
        return (
          <tr
            key={item.key}
            className={`${zebra} border-t border-gray-100 hover:bg-orange-50/30 transition-colors`}
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
                    className="text-sm text-gray-800 hover:text-orange-600 hover:underline decoration-dotted underline-offset-2 transition-colors"
                    title={`Open ${item.label}`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-800">{item.label}</span>
                )}
              </div>
            </td>
            <td className="px-4 py-2.5 text-[11px] font-mono text-gray-400">
              {item.url ?? "—"}
            </td>
            {MATRIX_ACTIONS.map((a) => {
              const supported = item.supports[a];
              const checked = !!row[a];
              return (
                <td key={a} className="px-2 py-1.5 text-center">
                  <label
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                      !supported
                        ? "cursor-not-allowed opacity-30"
                        : checked
                        ? "bg-orange-50 hover:bg-orange-100 cursor-pointer"
                        : "hover:bg-gray-100 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!supported}
                      onChange={() => onToggleCell(item.key, a)}
                      className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed"
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
