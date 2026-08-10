"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, RotateCcw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import {
  Table,
  TableScroll,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { TableSkeletonRows, type SkeletonColumn } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { handleApiFormError } from "@/lib/forms/handle-api-form-error";
import {
  ContactModal,
  type ContactRow,
} from "@/components/contacts/contact-modal";
import {
  ContactAdvancedFilterModal,
  ContactAppliedFilterSummary,
} from "@/components/contacts/contact-advanced-filter";
import type {
  ContactFormServerError,
  ContactFormValue,
} from "@/components/contacts/contact-form";
import type { FilterPayload } from "@/types/lead-filter";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const EMPTY_FILTER: FilterPayload = { matchMode: "ALL", conditions: [] };

type Tab = "all" | "trash";

function readPageFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
function readPageSizeFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("limit"));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

interface PickerOption {
  id: string;
  label: string;
}

interface ListResponse {
  success: true;
  data: {
    items: ContactRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

function isFilterActive(filter: FilterPayload): boolean {
  return filter.conditions.length > 0;
}

function formContactToBody(value: ContactFormValue): Record<string, unknown> {
  const out: Record<string, unknown> = {
    firstName: value.firstName,
    lastName: value.lastName,
  };
  if (value.email) out.email = value.email;
  if (value.phone) out.phone = value.phone;
  if (value.title) out.title = value.title;
  if (value.accountId) out.accountId = value.accountId;
  if (value.ownerId) out.ownerId = value.ownerId;
  if (value.leadId) out.leadId = value.leadId;
  if (value.city) out.city = value.city;
  if (value.contactStage) out.contactStage = value.contactStage;
  if (value.source) out.source = value.source;
  return out;
}

export function ContactsListClient({
  canCreate,
  canEdit,
  canDelete,
  isAdmin,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 400);
  const [filter, setFilter] = useState<FilterPayload>(EMPTY_FILTER);
  const viewTrash = tab === "trash";
  const [page, setPageState] = useState<number>(() =>
    readPageFromUrl(new URLSearchParams(searchParams.toString())),
  );
  const [pageSize, setPageSizeState] = useState<number>(() =>
    readPageSizeFromUrl(new URLSearchParams(searchParams.toString())),
  );

  const writeUrl = useCallback(
    (nextPage: number, nextLimit: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (nextPage === 1) sp.delete("page");
      else sp.set("page", String(nextPage));
      if (nextLimit === DEFAULT_PAGE_SIZE) sp.delete("limit");
      else sp.set("limit", String(nextLimit));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState(next);
      writeUrl(next, pageSize);
    },
    [pageSize, writeUrl],
  );
  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      setPageState(1);
      writeUrl(1, next);
    },
    [writeUrl],
  );

  // Mirror URL → state on browser back/forward.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const nextPage = readPageFromUrl(sp);
    const nextSize = readPageSizeFromUrl(sp);
    setPageState((cur) => (cur === nextPage ? cur : nextPage));
    setPageSizeState((cur) => (cur === nextSize ? cur : nextSize));
  }, [searchParams]);

  const [items, setItems] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [serverError, setServerError] = useState<ContactFormServerError | undefined>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [accountOptions, setAccountOptions] = useState<PickerOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<PickerOption[]>([]);
  const [leadOptions, setLeadOptions] = useState<PickerOption[]>([]);
  const [pickersLoading, setPickersLoading] = useState(false);
  const [filterOwnerOptions, setFilterOwnerOptions] = useState<
    { value: string; label: string }[]
  >([]);

  const filterActive = useMemo(() => isFilterActive(filter), [filter]);

  useEffect(() => {
    void fetch("/api/users/picker", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: { id: string; name: string }[] } | null) => {
        if (!j?.items?.length) return;
        setFilterOwnerOptions(
          j.items.map((u) => ({ value: u.name, label: u.name })),
        );
      })
      .catch(() => {
        /* best-effort */
      });
  }, []);

  const filterDynamicOptions = useMemo(
    () => ({
      ownerName: filterOwnerOptions,
      ownerId: ownerOptions.map((o) => ({ value: o.id, label: o.label })),
    }),
    [filterOwnerOptions, ownerOptions],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let res: Response;
      if (filterActive) {
        res = await fetch("/api/contacts/filter", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filter,
            page,
            pageSize,
            sortBy: "createdAt",
            sortDir: "desc",
            ...(viewTrash ? { onlyDeleted: true } : {}),
            ...(debounced.trim() ? { search: debounced.trim() } : {}),
          }),
        });
      } else {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (viewTrash) params.set("trashed", "true");
        if (debounced.trim()) params.set("q", debounced.trim());
        res = await fetch(`/api/contacts?${params.toString()}`, {
          credentials: "include",
        });
      }
      if (!res.ok) {
        const parsed = await handleApiFormError(res);
        throw new Error(parsed.formError ?? "Failed to load contacts");
      }
      const body = (await res.json()) as ListResponse;
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to load contacts";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [filterActive, filter, page, pageSize, debounced, viewTrash]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to page 1 whenever search or filter changes — but skip the very
  // first render so a deep-link like `/contacts?page=3` isn't immediately
  // clobbered back to page 1.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filter, tab]);

  const loadPickers = useCallback(async () => {
    if (
      accountOptions.length > 0 ||
      ownerOptions.length > 0 ||
      leadOptions.length > 0
    ) {
      return;
    }
    setPickersLoading(true);
    try {
      const [accRes, userRes, leadRes] = await Promise.all([
        fetch("/api/accounts/picker?limit=100"),
        fetch("/api/users/picker"),
        fetch("/api/leads/picker?limit=100"),
      ]);
      if (accRes.ok) {
        const body = await accRes.json();
        const items: { id: string; name: string }[] = body?.data?.items ?? [];
        setAccountOptions(items.map((a) => ({ id: a.id, label: a.name })));
      }
      if (userRes.ok) {
        const body = await userRes.json();
        const items: { id: string; name: string }[] = body?.items ?? body?.data?.items ?? [];
        setOwnerOptions(items.map((u) => ({ id: u.id, label: u.name })));
      }
      if (leadRes.ok) {
        const body = await leadRes.json();
        const items: { id: string; name: string; company: string | null }[] =
          body?.data?.items ?? [];
        setLeadOptions(
          items.map((l) => ({
            id: l.id,
            label: l.company ? `${l.name} — ${l.company}` : l.name,
          })),
        );
      }
    } catch {
      // Pickers are best-effort; the form falls back to id-only entry if they fail.
    } finally {
      setPickersLoading(false);
    }
  }, [accountOptions.length, ownerOptions.length, leadOptions.length]);

  function openAdd() {
    if (!canCreate) return;
    setServerError(undefined);
    setAdding(true);
    void loadPickers();
  }
  function openEdit(row: ContactRow) {
    setServerError(undefined);
    setEditing(row);
    void loadPickers();
  }
  function closeModal() {
    setEditing(null);
    setAdding(false);
    setServerError(undefined);
  }

  async function submitCreate(value: ContactFormValue) {
    setSaving(true);
    setServerError(undefined);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(formContactToBody(value)),
      });
      if (!res.ok) {
        const parsed = await handleApiFormError(res);
        setServerError({
          formError: parsed.formError,
          fieldErrors: parsed.fieldErrors,
          existingId: parsed.existingId,
        });
        return;
      }
      toast.success("Contact added");
      closeModal();
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(value: ContactFormValue) {
    if (!editing) return;
    setSaving(true);
    setServerError(undefined);
    try {
      const res = await fetch(`/api/contacts/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(formContactToBody(value)),
      });
      if (!res.ok) {
        const parsed = await handleApiFormError(res);
        setServerError({
          formError: parsed.formError,
          fieldErrors: parsed.fieldErrors,
          existingId: parsed.existingId,
        });
        return;
      }
      toast.success("Contact saved");
      closeModal();
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    if (!editing) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${editing.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const parsed = await handleApiFormError(res);
        toast.error(parsed.formError ?? "Failed to delete");
        return;
      }
      toast.success("Contact moved to Trash");
      closeModal();
      void load();
    } finally {
      setDeleting(false);
    }
  }

  const onRestore = useCallback(
    async (row: ContactRow) => {
      if (!canDelete) return;
      try {
        const res = await fetch(`/api/contacts/${row.id}/restore`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Restore failed");
        }
        toast.success("Contact restored");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [canDelete, load, toast],
  );

  const onSoftDelete = useCallback(
    async (row: ContactRow) => {
      if (!canDelete) return;
      const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Contact";
      const ok = await confirm({
        title: "Move to Trash?",
        description: `"${name}" will be moved to Trash. You can restore it later.`,
        confirmLabel: "Move to Trash",
        cancelLabel: "Cancel",
        tone: "warning",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/contacts/${row.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Delete failed");
        }
        toast.success("Contact moved to Trash");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [canDelete, confirm, load, toast],
  );

  const onPermanentDelete = useCallback(
    async (row: ContactRow) => {
      if (!isAdmin) return;
      const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Contact";
      const ok = await confirm({
        title: "Permanently delete this contact?",
        description: `"${name}" will be permanently removed. Linked leads will be unlinked. This cannot be undone.`,
        confirmLabel: "Permanently delete",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/contacts/${row.id}/permanent`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || "Permanent delete failed");
        }
        toast.success("Contact permanently deleted");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Permanent delete failed");
      }
    },
    [confirm, isAdmin, load, toast],
  );

  const onBulkMoveToTrash = useCallback(async () => {
    if (!canDelete) return;
    const ok = await confirm({
      title: "Move all contacts to Trash?",
      description:
        "Every active contact you can access will be moved to Trash. You can restore them individually from the Trash tab.",
      confirmLabel: "Move all to Trash",
      cancelLabel: "Cancel",
      tone: "warning",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/contacts/bulk-delete", {
        method: "POST",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !(j as { success?: boolean }).success) {
        throw new Error((j as { error?: string }).error || "Bulk delete failed");
      }
      const count = (j as { data?: { count?: number } }).data?.count ?? 0;
      toast.success(
        count === 1 ? "1 contact moved to Trash" : `${count} contacts moved to Trash`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  }, [canDelete, confirm, load, toast]);

  const onEmptyTrash = useCallback(async () => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Permanently delete all trashed contacts?",
      description: `All ${total} contact(s) in Trash will be permanently removed. Linked leads will be unlinked. This cannot be undone.`,
      confirmLabel: "Delete all permanently",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/contacts/trash", {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !(j as { success?: boolean }).success) {
        throw new Error((j as { error?: string }).error || "Empty trash failed");
      }
      const count = (j as { data?: { count?: number } }).data?.count ?? 0;
      toast.success(
        count === 1
          ? "1 contact permanently deleted"
          : `${count} contacts permanently deleted`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Empty trash failed");
    } finally {
      setBulkBusy(false);
    }
  }, [confirm, isAdmin, load, toast, total]);

  const tabs = useMemo<{ key: Tab; label: string }[]>(() => {
    const base: { key: Tab; label: string }[] = [{ key: "all", label: "All contacts" }];
    if (canDelete) base.push({ key: "trash", label: "Trash" });
    return base;
  }, [canDelete]);

  const showActionsCol = canDelete;
  const colCount = 6 + (showActionsCol ? 1 : 0) + (viewTrash ? 1 : 0);

  return (
    <div className="space-y-3">
      {canDelete && tabs.length > 1 && (
        <div className="inline-flex max-w-full overflow-x-auto rounded border border-crm-border bg-white p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={[
                "shrink-0 rounded px-3 py-1.5",
                tab === t.key
                  ? "bg-crm-blue text-white"
                  : "text-crm-text hover:bg-crm-panel",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {viewTrash && canDelete && (
        <TrashBanner
          count={total}
          onExit={() => {
            setTab("all");
            setPage(1);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
            size={14}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              viewTrash ? "Search trashed contacts…" : "Search name, email, phone…"
            }
            className="pl-8"
            data-testid="contacts-search"
          />
        </div>

        {!viewTrash && (
          <Button
            variant="secondary"
            type="button"
            onClick={() => setShowAdvanced(true)}
            className="inline-flex items-center gap-1"
          >
            <SlidersHorizontal size={14} />
            Advanced filter
            {filterActive && (
              <span className="ml-1 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700">
                On
              </span>
            )}
          </Button>
        )}

        {canDelete && !viewTrash && (
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setTab("trash");
              setPage(1);
            }}
            className="inline-flex items-center gap-1"
          >
            <Trash2 size={14} />
            Trash
          </Button>
        )}

        {canDelete && !viewTrash && total > 0 && (
          <Button
            variant="secondary"
            type="button"
            disabled={bulkBusy}
            onClick={() => void onBulkMoveToTrash()}
            className="inline-flex items-center gap-1 text-red-700 hover:bg-red-50"
          >
            <Trash2 size={14} />
            Move all to Trash
          </Button>
        )}

        {viewTrash && isAdmin && total > 0 && (
          <Button
            variant="secondary"
            type="button"
            disabled={bulkBusy}
            onClick={() => void onEmptyTrash()}
            className="inline-flex items-center gap-1 text-red-700 hover:bg-red-50"
          >
            <Trash2 size={14} />
            Delete all permanently
          </Button>
        )}

        {!viewTrash && (
          <Button
            type="button"
            onClick={openAdd}
            disabled={!canCreate}
            title={
              canCreate
                ? "Add a new contact"
                : "You don't have permission to create contacts"
            }
            className="ml-auto inline-flex items-center gap-1"
            data-testid="contacts-add-button"
          >
            <Plus size={14} /> Add contact
          </Button>
        )}
      </div>

      {!viewTrash && (
        <ContactAppliedFilterSummary
          filter={filter}
          onClear={() => setFilter(EMPTY_FILTER)}
        />
      )}

      {loadError && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{loadError}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <div className="crm-card overflow-hidden">
        <TableScroll minWidth={760} bleed={false}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH hideBelow="md">Phone</TH>
                <TH hideBelow="md">Title</TH>
                <TH hideBelow="lg">Account</TH>
                <TH hideBelow="lg">Owner</TH>
                {viewTrash && <TH hideBelow="md">Deleted</TH>}
                {showActionsCol && (
                  <TH aria-label="Actions" className="w-28 text-center" />
                )}
              </TR>
            </THead>
            <TBody>
              {loading && items.length === 0 ? (
                <TableSkeletonRows
                  rows={10}
                  columns={
                    [
                      { widthClass: "w-32" },
                      { widthClass: "w-40" },
                      { widthClass: "w-28", hideBelow: "md" },
                      { widthClass: "w-24", hideBelow: "md" },
                      { widthClass: "w-32", hideBelow: "lg" },
                      { widthClass: "w-24", hideBelow: "lg" },
                      ...(viewTrash ? [{ widthClass: "w-24", hideBelow: "md" as const }] : []),
                      ...(showActionsCol ? [{ widthClass: "w-16" }] : []),
                    ] satisfies SkeletonColumn[]
                  }
                />
              ) : !loading && items.length === 0 ? (
                <TR>
                  <TD colSpan={colCount} className="py-8 text-center text-crm-muted">
                    {viewTrash
                      ? debounced
                        ? "No trashed contacts match your search."
                        : "No contacts in Trash."
                      : debounced || filterActive
                        ? "No contacts match — try adjusting search or clear filters."
                        : "No contacts yet."}
                  </TD>
                </TR>
              ) : (
                items.map((c) => {
                  const fullName =
                    `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "—";
                  return (
                    <TR
                      key={c.id}
                      onClick={() => {
                        if (viewTrash) return;
                        router.push(`/contacts/${c.id}`);
                      }}
                      className={[
                        viewTrash
                          ? "bg-amber-50/30 hover:bg-amber-50/60"
                          : "cursor-pointer hover:bg-blue-50/30",
                      ].join(" ")}
                    >
                      <TD>
                        <Link
                          href={`/contacts/${c.id}`}
                          className={[
                            "font-medium hover:underline",
                            viewTrash
                              ? "pointer-events-none text-crm-muted"
                              : "text-crm-blue",
                          ].join(" ")}
                          onClick={(e) => e.stopPropagation()}
                          aria-disabled={viewTrash}
                          tabIndex={viewTrash ? -1 : undefined}
                        >
                          {fullName}
                        </Link>
                      </TD>
                      <TD className="truncate">{c.email || "—"}</TD>
                      <TD
                        hideBelow="md"
                        className="whitespace-nowrap tabular-nums"
                      >
                        {c.phone || "—"}
                      </TD>
                      <TD hideBelow="md">{c.title || "—"}</TD>
                      <TD hideBelow="lg">{c.accountName || "—"}</TD>
                      <TD hideBelow="lg">{c.ownerName || "—"}</TD>
                      {viewTrash && (
                        <TD hideBelow="md" className="text-xs text-crm-muted whitespace-nowrap">
                          <ContactDeletedAtCell value={c.deletedAt ?? null} />
                        </TD>
                      )}
                      {showActionsCol && (
                        <TD className="text-center">
                          <ContactRowActions
                            row={c}
                            viewTrash={viewTrash}
                            isAdmin={isAdmin}
                            onDelete={onSoftDelete}
                            onRestore={onRestore}
                            onPermanentDelete={onPermanentDelete}
                          />
                        </TD>
                      )}
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
        showPageNumbers
      />

      <ContactAdvancedFilterModal
        open={showAdvanced}
        initial={filter}
        onClose={() => setShowAdvanced(false)}
        onApply={(payload) => {
          setFilter(payload);
          setPage(1);
        }}
        dynamicOptions={filterDynamicOptions}
      />

      <ContactModal
        open={adding || !!editing}
        mode={adding ? "create" : "edit"}
        contact={editing}
        canEdit={adding ? canCreate : canEdit}
        canDelete={canDelete}
        saving={saving}
        deleting={deleting}
        serverError={serverError}
        accountOptions={accountOptions}
        ownerOptions={ownerOptions}
        leadOptions={leadOptions}
        pickersLoading={pickersLoading}
        onClose={closeModal}
        onSubmit={(v) => (adding ? submitCreate(v) : submitEdit(v))}
        onDelete={canDelete ? submitDelete : undefined}
      />
    </div>
  );
}

function ContactRowActions({
  row,
  viewTrash,
  isAdmin,
  onDelete,
  onRestore,
  onPermanentDelete,
}: {
  row: ContactRow;
  viewTrash: boolean;
  isAdmin: boolean;
  onDelete: (row: ContactRow) => void;
  onRestore: (row: ContactRow) => void;
  onPermanentDelete: (row: ContactRow) => void;
}) {
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  if (viewTrash) {
    return (
      <div className="inline-flex items-center justify-center divide-x divide-amber-200/60 overflow-hidden rounded-md ring-1 ring-amber-200/60 bg-white shadow-sm">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onRestore(row);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-crm-blue transition hover:bg-crm-blue-soft"
          aria-label="Restore contact"
          title="Restore — return to active contacts"
        >
          <RotateCcw size={12} />
          Restore
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onPermanentDelete(row);
            }}
            className="inline-flex items-center justify-center px-2 py-1 text-red-600 transition hover:bg-red-50"
            aria-label="Permanently delete contact"
            title="Permanently delete — cannot be undone"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onDelete(row);
      }}
      className="rounded-md p-1.5 text-crm-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 focus:opacity-100"
      aria-label="Move contact to trash"
      title="Move to Trash"
    >
      <Trash2 size={14} />
    </button>
  );
}

function ContactDeletedAtCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-crm-muted">—</span>;
  const date = new Date(value);
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  let rel: string;
  if (diffMin < 1) rel = "just now";
  else if (diffMin < 60) rel = `${diffMin}m ago`;
  else if (diffHr < 24) rel = `${diffHr}h ago`;
  else rel = `${diffDay}d ago`;
  return (
    <span title={date.toLocaleString("en-IN")}>
      {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · {rel}
    </span>
  );
}
