"use client";

/**
 * Activity Scope — FREE_SCOPE project screen (a MANUAL BOQ).
 *
 * Folders, sub-folders & leaf line items that anchor the lifecycle of a
 * Free-Scope (non-BOQ) project in place of an imported BOQ. Line items carry
 * the same shape as a BOQ line (category / unit / tender qty / scope / rate);
 * the only difference is they're entered by hand instead of imported from
 * Excel. Leaf items feed the Estimation / WO / DPR / RAB pickers.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Lock, Unlock, FolderPlus, FilePlus, ListTree, Search,
  ChevronRight, ChevronDown, Folder, FileText, Pencil, Trash2,
} from "lucide-react";
import { useProjects, useUOMs } from "@/hooks/use-masters";
import {
  useActivityTreeInfinite,
  useActivityFolders,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
  useSetActivitiesLock,
  type ActivityTreeRow,
} from "@/hooks/use-projects";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from "@/components/PageShell";
import {
  FormDrawer,
  FormSection,
  FormRow,
  Field,
  TextInput,
  NumberInput,
  SelectInput,
  DateInput,
} from "@/components/FormDrawer";

const CATEGORY_OPTIONS = [
  { value: "Civil", label: "Civil" },
  { value: "Electrical", label: "Electrical" },
  { value: "Road", label: "Road" },
  { value: "Plumbing", label: "Plumbing" },
  { value: "Other", label: "Other" },
];

const emptyFolder = { code: "", description: "", parentId: "" };
const emptyLine = {
  code: "",
  description: "",
  category: "",
  uomId: "",
  tenderQty: "",
  scopeQty: "",
  rate: "",
  startDate: "",
  endDate: "",
  parentId: "",
};

export default function ActivitiesPage() {
  const { data: projectsResp } = useProjects();
  const { data: uomsResp } = useUOMs();

  const freeScopeProjects = useMemo(
    () =>
      (projectsResp?.data ?? []).filter(
        (p) => p?.executionMode === "FREE_SCOPE" && p?.status !== "inactive",
      ),
    [projectsResp?.data],
  );

  const uomOptions = useMemo(() => {
    const rows = (uomsResp?.data ?? []) as Array<{ id: string; code?: string; name?: string }>;
    return rows.map((u) => ({ value: u.id, label: u.code ?? u.name ?? u.id }));
  }, [uomsResp?.data]);

  const [projectId, setProjectId] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset search + collapse state when switching projects — a term from the
  // previous project would otherwise hide the new one behind zero matches.
  useEffect(() => {
    setSearchInput("");
    setSearch("");
    setCollapsed(new Set());
  }, [projectId]);

  const {
    data: treeResult,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityTreeInfinite(projectId || null, { search, pageSize: 100 });

  const rows: ActivityTreeRow[] = useMemo(
    () => (treeResult?.pages ?? []).flatMap((p) => p.data ?? []),
    [treeResult],
  );
  // total / lock state are computed server-side over the FULL scope, so they
  // stay accurate across pages — read them off the first page.
  const total = treeResult?.pages?.[0]?.total ?? 0;
  const anyLocked = treeResult?.pages?.[0]?.isLocked ?? false;
  // With a search term the server returns flat matches, not a tree slice.
  const isSearching = search.trim().length > 0;

  // Scroll sentinel — loads the next depth-first page just before the user
  // reaches the end of the table.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  // Folder options for the "Parent folder" pickers — fetched separately so
  // every folder is offered even when only part of the tree is loaded.
  const { data: foldersResp } = useActivityFolders(projectId || null);
  const folderOptions = useMemo(() => {
    const folders = foldersResp?.data ?? [];
    return folders.map((r) => ({
      value: r.id,
      label: `${r.path ? `${r.path} · ` : ""}${r.description}`,
    }));
  }, [foldersResp?.data]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Flatten to a visible list honouring collapse state — parents before their
  // children (DFS), each sorted by sortOrder within its parent.
  //
  // While searching the server already returned flat matches from across the
  // hierarchy: their parents may not be in `rows` at all, so tree-walking from
  // roots would drop them. Render the matches as-is instead.
  const { visible, childCount } = useMemo(() => {
    if (isSearching) {
      return { visible: rows, childCount: () => 0 };
    }
    const childrenBy = new Map<string, ActivityTreeRow[]>();
    const roots: ActivityTreeRow[] = [];
    for (const r of rows) {
      if (r.parentId) {
        const arr = childrenBy.get(r.parentId) ?? [];
        arr.push(r);
        childrenBy.set(r.parentId, arr);
      } else {
        roots.push(r);
      }
    }
    const bySort = (a: ActivityTreeRow, b: ActivityTreeRow) => a.sortOrder - b.sortOrder;
    roots.sort(bySort);
    childrenBy.forEach((a) => a.sort(bySort));
    const list: ActivityTreeRow[] = [];
    const walk = (n: ActivityTreeRow) => {
      list.push(n);
      if (n.isGroup && !collapsed.has(n.id)) {
        (childrenBy.get(n.id) ?? []).forEach(walk);
      }
    };
    roots.forEach(walk);
    return {
      visible: list,
      childCount: (id: string) => childrenBy.get(id)?.length ?? 0,
    };
  }, [rows, collapsed, isSearching]);

  const createMutation = useCreateActivity();
  const updateMutation = useUpdateActivity();
  const deleteMutation = useDeleteActivity();
  const lockMutation = useSetActivitiesLock();

  const [folderOpen, setFolderOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [folderForm, setFolderForm] = useState(emptyFolder);
  const [lineForm, setLineForm] = useState(emptyLine);
  const [lineError, setLineError] = useState("");
  const [folderError, setFolderError] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActivityTreeRow | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const busy = createMutation.isPending || updateMutation.isPending;

  // Read-only amount preview in the line-item drawer = Tender Qty × Rate.
  const lineAmount =
    lineForm.tenderQty !== "" &&
    lineForm.rate !== "" &&
    !Number.isNaN(Number(lineForm.tenderQty)) &&
    !Number.isNaN(Number(lineForm.rate))
      ? (Number(lineForm.tenderQty) * Number(lineForm.rate)).toLocaleString("en-IN", {
          maximumFractionDigits: 2,
        })
      : "";

  const createFolder = async () => {
    setFolderError("");
    if (!projectId) return;
    if (!folderForm.description.trim()) return setFolderError("Name is required.");
    const data = {
      isGroup: true,
      activityCode: folderForm.code.trim() || undefined,
      description: folderForm.description.trim(),
      parentId: folderForm.parentId || null,
    };
    try {
      if (editingFolderId) {
        await updateMutation.mutateAsync({ projectId, activityId: editingFolderId, data });
      } else {
        await createMutation.mutateAsync({ projectId, data });
      }
    } catch (e: unknown) {
      return setFolderError(e instanceof Error ? e.message : "Could not save the folder.");
    }
    setFolderForm(emptyFolder);
    setEditingFolderId(null);
    setFolderOpen(false);
  };

  const createLine = async () => {
    setLineError("");
    if (!projectId) return;
    if (!lineForm.description.trim()) return setLineError("Description is required.");
    if (!lineForm.uomId) return setLineError("UOM is required.");
    if (lineForm.tenderQty === "") return setLineError("Tender Qty is required.");
    if (lineForm.rate === "") return setLineError("Rate is required.");
    const data = {
      isGroup: false,
      activityCode: lineForm.code.trim() || undefined,
      description: lineForm.description.trim(),
      category: lineForm.category || null,
      uomId: lineForm.uomId,
      tenderQty: lineForm.tenderQty !== "" ? Number(lineForm.tenderQty) : null,
      scopeQty: lineForm.scopeQty !== "" ? Number(lineForm.scopeQty) : null,
      rate: lineForm.rate !== "" ? Number(lineForm.rate) : null,
      startDate: lineForm.startDate || null,
      endDate: lineForm.endDate || null,
      parentId: lineForm.parentId || null,
    };
    try {
      if (editingLineId) {
        await updateMutation.mutateAsync({ projectId, activityId: editingLineId, data });
      } else {
        await createMutation.mutateAsync({ projectId, data });
      }
    } catch (e: unknown) {
      return setLineError(e instanceof Error ? e.message : "Could not save the line item.");
    }
    setLineForm(emptyLine);
    setEditingLineId(null);
    setLineOpen(false);
  };

  const setLine = <K extends keyof typeof emptyLine>(key: K, val: string) =>
    setLineForm((f) => ({ ...f, [key]: val }));

  const openFolder = (parentId = "") => {
    setEditingFolderId(null);
    setFolderError("");
    setFolderForm({ ...emptyFolder, parentId });
    setFolderOpen(true);
  };
  const openLine = (parentId = "") => {
    setEditingLineId(null);
    setLineError("");
    setLineForm({ ...emptyLine, parentId });
    setLineOpen(true);
  };
  const editFolder = (r: ActivityTreeRow) => {
    setEditingFolderId(r.id);
    setFolderError("");
    setFolderForm({ code: r.activityCode, description: r.description, parentId: r.parentId ?? "" });
    setFolderOpen(true);
  };
  const editLine = (r: ActivityTreeRow) => {
    setEditingLineId(r.id);
    setLineError("");
    setLineForm({
      code: r.activityCode,
      description: r.description,
      category: r.category ?? "",
      uomId: r.uomId ?? "",
      tenderQty: r.tenderQty != null ? String(r.tenderQty) : "",
      scopeQty: r.scopeQty != null ? String(r.scopeQty) : "",
      rate: r.rate != null ? String(r.rate) : "",
      startDate: r.startDate ?? "",
      endDate: r.endDate ?? "",
      parentId: r.parentId ?? "",
    });
    setLineOpen(true);
  };

  const addButtons = (
    <div className="flex items-center gap-2">
      <SecondaryButton onClick={() => openFolder()} disabled={!projectId}>
        <FolderPlus className="w-4 h-4" /> Folder
      </SecondaryButton>
      <PrimaryButton onClick={() => openLine()} disabled={!projectId}>
        <FilePlus className="w-4 h-4" /> Line item
      </PrimaryButton>
    </div>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Projects" }, { label: "Activity Scope" }]}
        title="Activity Scope"
        subtitle="Manual BOQ for Free-Scope (non-BOQ) projects — line items carry the same tender / scope / rate fields and anchor estimation, WO, DPR & RAB"
        actions={addButtons}
      />

      <PageContainer>
        {/* Toolbar: project selector + search + baseline lock */}
        <div className="flex items-center gap-3 mb-6">
          <div className="min-w-[280px]">
            <SelectInput
              value={projectId}
              onChange={setProjectId}
              placeholder={freeScopeProjects.length ? "Select a Free-Scope project…" : "No Free-Scope projects"}
              options={freeScopeProjects.map((p) => ({
                value: p.id,
                label: `${p.name}${p.code ? ` (${p.code})` : ""}`,
              }))}
            />
          </div>
          {projectId && (
            <div className="relative min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search code or description…"
                className="w-full text-sm pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
          )}
          {projectId && total > 0 && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {isSearching
                ? `${total} match${total === 1 ? "" : "es"}`
                : `${rows.length} of ${total} loaded`}
            </span>
          )}
          {projectId && rows.length > 0 && (
            <SecondaryButton
              onClick={() => lockMutation.mutateAsync({ projectId, locked: !anyLocked })}
              disabled={lockMutation.isPending}
            >
              {anyLocked ? (
                <><Unlock className="w-4 h-4" /> Unlock baseline</>
              ) : (
                <><Lock className="w-4 h-4" /> Lock baseline</>
              )}
            </SecondaryButton>
          )}
        </div>

        {!projectId ? (
          <div className="rounded-xl border border-gray-200 bg-white">
            <EmptyState
              icon={<ListTree className="w-7 h-7" />}
              title="Pick a project"
              description="Select a Free-Scope project to build its activity tree."
            />
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading activities…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white">
            {isSearching ? (
              <EmptyState
                icon={<Search className="w-7 h-7" />}
                title="No matches"
                description={`Nothing in this scope matches “${search}”. Clear the search to see the full tree.`}
              />
            ) : (
              <EmptyState
                icon={<ListTree className="w-7 h-7" />}
                title="No activities yet"
                description="Add folders to group work and line items for the activities you'll estimate, execute and bill."
                action={addButtons}
              />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="bg-accent-50 text-left text-xs font-semibold uppercase text-gray-600">
                  <th className="px-4 py-3 w-28">Code</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3 text-left w-28">Category</th>
                  <th className="px-4 py-3 text-right w-28">Tender</th>
                  <th className="px-4 py-3 text-right w-24">Scope</th>
                  <th className="px-4 py-3 text-right w-28">Rate</th>
                  <th className="px-4 py-3 text-right w-32">Amount</th>
                  <th className="px-4 py-3 text-right w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-accent-50/40">
                    <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">
                      {r.activityCode}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: isSearching ? 0 : r.depth * 20 }}
                      >
                        {r.isGroup && childCount(r.id) > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggle(r.id)}
                            className="p-0.5 rounded hover:bg-gray-200 text-gray-500 shrink-0"
                            title={collapsed.has(r.id) ? "Expand" : "Collapse"}
                          >
                            {collapsed.has(r.id) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="inline-block w-4 shrink-0" />
                        )}
                        {r.isGroup ? (
                          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-accent-400 shrink-0" />
                        )}
                        <span className={r.isGroup ? "font-semibold text-gray-900" : "text-gray-800"}>
                          {r.description}
                        </span>
                        {/* Search results are flat, so the breadcrumb is the
                            only clue to where the row sits in the tree. */}
                        {isSearching && r.path && (
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">
                            in {r.path}
                          </span>
                        )}
                        {r.locked && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-left text-gray-600">
                      {r.isGroup ? "" : r.category ?? ""}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                      {r.isGroup || r.tenderQty == null
                        ? ""
                        : `${r.tenderQty}${r.uomCode ? ` ${r.uomCode}` : ""}`}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                      {r.isGroup || !r.scopeQty ? "" : `${r.scopeQty}`}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                      {r.isGroup || r.rate == null ? "" : `₹${r.rate}`}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800 tabular-nums">
                      {r.isGroup || r.tenderQty == null || r.rate == null
                        ? ""
                        : `₹${(r.tenderQty * r.rate).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {r.isGroup && (
                          <>
                            <button
                              type="button"
                              onClick={() => openFolder(r.id)}
                              title="Add sub-folder"
                              className="p-1 rounded hover:bg-accent-50 text-gray-400 hover:text-accent-600"
                            >
                              <FolderPlus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLine(r.id)}
                              title="Add line item"
                              className="p-1 rounded hover:bg-accent-50 text-gray-400 hover:text-accent-600"
                            >
                              <FilePlus className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => (r.isGroup ? editFolder(r) : editLine(r))}
                          title="Edit"
                          className="p-1 rounded hover:bg-accent-50 text-gray-400 hover:text-accent-600"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeleteError(""); setDeleteTarget(r); }}
                          title="Delete"
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Scroll sentinel — pulls the next depth-first page into view
                before the user reaches the end of the loaded rows. */}
            {hasNextPage && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-6 text-xs text-gray-400"
              >
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading more activities…
                  </span>
                ) : (
                  <span>Scroll to load more</span>
                )}
              </div>
            )}
          </div>
        )}
      </PageContainer>

      {/* New folder */}
      <FormDrawer
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        title={editingFolderId ? "Edit folder" : "New folder"}
        width="md"
        onSubmit={createFolder}
        submitLabel={editingFolderId ? "Save" : "Create"}
        loading={busy}
      >
        {folderError && (
          <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {folderError}
          </div>
        )}
        <FormSection title="Folder">
          <Field label="Name" required hint="Code is auto-generated (BOQ-style path, e.g. 1.2)">
            <TextInput value={folderForm.description} onChange={(v) => setFolderForm((f) => ({ ...f, description: v }))} placeholder="e.g. Substructure" />
          </Field>
          <Field label="Parent folder" hint="Leave blank for a top-level folder">
            <SelectInput value={folderForm.parentId} onChange={(v) => setFolderForm((f) => ({ ...f, parentId: v }))} placeholder="— Top level —" options={folderOptions.filter((o) => o.value !== editingFolderId)} />
          </Field>
        </FormSection>
      </FormDrawer>

      {/* New line item — same fields as a BOQ line, entered by hand */}
      <FormDrawer
        open={lineOpen}
        onClose={() => setLineOpen(false)}
        title={editingLineId ? "Edit line item" : "New line item"}
        width="md"
        onSubmit={createLine}
        submitLabel={editingLineId ? "Save" : "Create"}
        loading={busy}
      >
        {lineError && (
          <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {lineError}
          </div>
        )}
        <FormSection title="Details">
          <Field label="Name" required hint="Code is auto-generated (BOQ-style path, e.g. 1.2.1)">
            <TextInput value={lineForm.description} onChange={(v) => setLine("description", v)} placeholder="e.g. Earthwork excavation (day-work)" />
          </Field>
          <FormRow>
            <Field label="Category">
              <SelectInput value={lineForm.category} onChange={(v) => setLine("category", v)} placeholder="Select category…" options={CATEGORY_OPTIONS} />
            </Field>
            <Field label="UOM" required>
              <SelectInput value={lineForm.uomId} onChange={(v) => setLine("uomId", v)} placeholder="Select unit…" options={uomOptions} />
            </Field>
          </FormRow>
          <Field label="Parent folder" hint="Optional — place this line under a folder">
            <SelectInput value={lineForm.parentId} onChange={(v) => setLine("parentId", v)} placeholder="— Top level —" options={folderOptions} />
          </Field>
        </FormSection>
        <FormSection title="Quantities & Rate">
          <FormRow>
            <Field label="Tender Qty" required>
              <NumberInput value={lineForm.tenderQty} onChange={(v) => setLine("tenderQty", v)} min={0} step="0.0001" placeholder="0" />
            </Field>
            <Field label="Scope Qty" hint="Optional — revised/variation qty (e.g. tender 100 → scope 150)">
              <NumberInput value={lineForm.scopeQty} onChange={(v) => setLine("scopeQty", v)} min={0} step="0.0001" placeholder="0" />
            </Field>
          </FormRow>
          <Field label="Rate (₹)" required>
            <NumberInput value={lineForm.rate} onChange={(v) => setLine("rate", v)} min={0} step="0.01" placeholder="0.00" />
          </Field>
          <Field label="Amount (₹)" hint="Auto — Tender Qty × Rate">
            <div className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 font-medium">
              {lineAmount ? `₹${lineAmount}` : "—"}
            </div>
          </Field>
        </FormSection>
        <FormSection title="Schedule">
          <FormRow>
            <Field label="Start Date">
              <DateInput value={lineForm.startDate} onChange={(v) => setLine("startDate", v)} />
            </Field>
            <Field label="End Date">
              <DateInput value={lineForm.endDate} onChange={(v) => setLine("endDate", v)} min={lineForm.startDate || undefined} />
            </Field>
          </FormRow>
        </FormSection>
      </FormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(""); }}
        onConfirm={async () => {
          if (!deleteTarget || !projectId) return;
          setDeleteError("");
          try {
            await deleteMutation.mutateAsync({ projectId, activityId: deleteTarget.id });
            setDeleteTarget(null);
          } catch (e: unknown) {
            setDeleteError(e instanceof Error ? e.message : "Failed to delete activity.");
          }
        }}
        title={`Delete ${deleteTarget?.isGroup ? "folder" : "line item"}?`}
        message={
          <>
            <span className="font-semibold">{deleteTarget?.activityCode}</span> {deleteTarget?.description}
            {deleteTarget?.isGroup ? " and everything inside it will be removed." : ""}
            {deleteError && (
              <span className="mt-2 block rounded bg-red-50 border border-red-200 px-2 py-1.5 text-xs text-red-700">
                {deleteError}
              </span>
            )}
          </>
        }
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
      />
    </>
  );
}
