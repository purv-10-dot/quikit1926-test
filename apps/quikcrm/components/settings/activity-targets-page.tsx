"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Save, BarChart3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/shared/pagination";
import { useToast } from "@/hooks/use-toast";

const CONFIG_API = "/api/settings/activity-targets";
const USERS_API = "/api/users/picker";
const TYPE_TARGETS_API = "/api/settings/activity-type-targets";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

interface UserAssignment {
  enabled: boolean;
  dailyTarget?: number;
}

/** An ACTIVE activity type from Settings → Activity Types. Never hardcoded. */
interface ActivityTypeOption {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  countsSources: string[];
}

/** userId → activityTypeId → raw input string ("" means 0). */
type TypeTargetGrid = Record<string, Record<string, string>>;

interface TargetConfig {
  defaultDailyTarget: number;
  weeklyWorkingDays: number;
  perUser: Record<string, UserAssignment>;
}

interface PickerUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
}

// Per-user editable row state. `enabled` = target assigned; `target` is the
// string input (blank = use the suggested org default while assigned).
interface RowState {
  enabled: boolean;
  target: string;
}

export function ActivityTargetsPageClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [defaultDailyTarget, setDefaultDailyTarget] = useState("10");
  const [weeklyWorkingDays, setWeeklyWorkingDays] = useState("5");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [users, setUsers] = useState<PickerUser[]>([]);

  // Activity Type-wise targets. `types` is loaded from the org's ACTIVE
  // CrmActivityType rows, so a type added in Settings → Activity Types appears
  // here automatically with no code change.
  const [types, setTypes] = useState<ActivityTypeOption[]>([]);
  const [typeGrid, setTypeGrid] = useState<TypeTargetGrid>({});

  // Client-side search + filters for the Assign Targets table. Purely a view
  // concern — filtering never touches `rows`, so hidden users keep their edits
  // and are still saved.
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination is a view concern too: both the Assign Targets table and the
  // Activity Type Targets grid render the SAME page slice, so the two sections
  // always show the same salespeople. Edits live in `rows`/`typeGrid` keyed by
  // userId, so paging away never discards an unsaved change.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const applyConfigToRows = useCallback((cfg: TargetConfig) => {
    const next: Record<string, RowState> = {};
    for (const [userId, a] of Object.entries(cfg.perUser ?? {})) {
      next[userId] = {
        enabled: a.enabled === true,
        target: a.dailyTarget !== undefined ? String(a.dailyTarget) : "",
      };
    }
    setRows(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, usersRes, typeRes] = await Promise.all([
        fetch(CONFIG_API, { credentials: "include" }),
        fetch(USERS_API, { credentials: "include" }),
        fetch(TYPE_TARGETS_API, { credentials: "include" }),
      ]);
      const cfgJson = await cfgRes.json();
      const usersJson = await usersRes.json();
      const typeJson = await typeRes.json();

      if (!cfgRes.ok || !cfgJson?.success) {
        throw new Error(cfgJson?.error ?? "Failed to load activity targets");
      }
      const cfg = cfgJson.data as TargetConfig;
      setDefaultDailyTarget(String(cfg.defaultDailyTarget));
      setWeeklyWorkingDays(String(cfg.weeklyWorkingDays));
      applyConfigToRows(cfg);
      setUsers(Array.isArray(usersJson?.items) ? usersJson.items : []);

      // Type-wise targets load independently: if this call fails the overall
      // target section must still work, so it only warns.
      if (typeRes.ok && typeJson?.success) {
        const loadedTypes: ActivityTypeOption[] = Array.isArray(typeJson.data?.types)
          ? typeJson.data.types
          : [];
        setTypes(loadedTypes);
        const grid: TypeTargetGrid = {};
        const stored = (typeJson.data?.targets ?? {}) as Record<string, Record<string, number>>;
        for (const [userId, byType] of Object.entries(stored)) {
          const entry: Record<string, string> = {};
          for (const [typeId, value] of Object.entries(byType)) entry[typeId] = String(value);
          grid[userId] = entry;
        }
        setTypeGrid(grid);
      } else {
        toast.error(typeJson?.error ?? "Failed to load activity type targets");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load activity targets");
    } finally {
      setLoading(false);
    }
  }, [toast, applyConfigToRows]);

  useEffect(() => {
    load();
  }, [load]);

  const weeklyPreview = useMemo(() => {
    const d = Number(defaultDailyTarget) || 0;
    const w = Number(weeklyWorkingDays) || 0;
    return d * w;
  }, [defaultDailyTarget, weeklyWorkingDays]);

  const assignedCount = useMemo(
    () => Object.values(rows).filter((r) => r.enabled).length,
    [rows],
  );

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.role) set.add(u.role);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const enabled = rows[u.id]?.enabled === true;
      const statusLabel = enabled ? "Assigned" : "No Target Assigned";

      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "assigned" && !enabled) return false;
      if (statusFilter === "unassigned" && enabled) return false;

      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.role ?? "").toLowerCase().includes(q) ||
        statusLabel.toLowerCase().includes(q)
      );
    });
  }, [users, rows, search, roleFilter, statusFilter]);

  // Clamp during render rather than in an effect, so tightening a filter can
  // never leave both tables blank for a frame on a now-out-of-range page.
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedUsers = useMemo(
    () => filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredUsers, safePage, pageSize],
  );

  const filtersActive = search.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";

  function clearFilters() {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setPage(1);
  }

  function rowFor(userId: string): RowState {
    return rows[userId] ?? { enabled: false, target: "" };
  }

  function toggleAssign(userId: string, enabled: boolean) {
    setRows((prev) => ({ ...prev, [userId]: { ...rowFor(userId), enabled } }));
  }

  function setTarget(userId: string, target: string) {
    setRows((prev) => ({ ...prev, [userId]: { ...rowFor(userId), target } }));
  }

  function typeTargetFor(userId: string, typeId: string): string {
    return typeGrid[userId]?.[typeId] ?? "";
  }

  function setTypeTarget(userId: string, typeId: string, value: string) {
    setTypeGrid((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [typeId]: value },
    }));
  }

  /**
   * Min-width for the type-targets table: the sticky Salesperson column, one
   * fixed-width cell per activity type, plus the trailing total. Driven by the
   * live type count so the columns never crush as an admin adds types — the
   * table simply grows wider and the wrapper scrolls.
   */
  const SALESPERSON_COL_PX = 220;
  const TYPE_COL_PX = 120;
  const TOTAL_COL_PX = 110;
  const typeTableMinWidth =
    SALESPERSON_COL_PX + types.length * TYPE_COL_PX + TOTAL_COL_PX;

  /** Sum of a user's per-type targets — shown as a per-row total. */
  function typeRowTotal(userId: string): number {
    const entry = typeGrid[userId] ?? {};
    return types.reduce((sum, t) => {
      const n = Number(entry[t.id]);
      return sum + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    }, 0);
  }

  async function save() {
    setSaving(true);
    try {
      // Only send entries that carry meaning: enabled users, and any user with a
      // stored target value. Unassigned users with no value are simply omitted
      // (= "No Target Assigned").
      const perUser: Record<string, UserAssignment> = {};
      for (const [userId, r] of Object.entries(rows)) {
        const trimmed = r.target.trim();
        const hasTarget = trimmed !== "" && Number.isFinite(Number(trimmed)) && Number(trimmed) >= 0;
        if (!r.enabled && !hasTarget) continue;
        const entry: UserAssignment = { enabled: r.enabled };
        if (hasTarget) entry.dailyTarget = Math.floor(Number(trimmed));
        perUser[userId] = entry;
      }

      const body = {
        defaultDailyTarget: Math.max(0, Math.floor(Number(defaultDailyTarget) || 0)),
        weeklyWorkingDays: Math.min(7, Math.max(1, Math.floor(Number(weeklyWorkingDays) || 5))),
        perUser,
      };

      // Per-activity-type targets. Every (user, type) cell the admin has touched
      // is sent — including explicit 0s, which are a real assignment ("tracked,
      // nothing expected") rather than a deletion. Blank inputs coerce to 0.
      const typeTargets: { userId: string; activityTypeId: string; dailyTarget: number }[] = [];
      for (const [userId, byType] of Object.entries(typeGrid)) {
        for (const [activityTypeId, raw] of Object.entries(byType)) {
          const trimmed = (raw ?? "").trim();
          const n = trimmed === "" ? 0 : Number(trimmed);
          if (!Number.isFinite(n) || n < 0) continue; // ignore junk input
          typeTargets.push({ userId, activityTypeId, dailyTarget: Math.floor(n) });
        }
      }

      const [res, typeRes] = await Promise.all([
        fetch(CONFIG_API, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        typeTargets.length > 0
          ? fetch(TYPE_TARGETS_API, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targets: typeTargets }),
            })
          : null,
      ]);

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to save");
      }
      if (typeRes) {
        const typeJson = await typeRes.json();
        if (!typeRes.ok || !typeJson?.success) {
          throw new Error(typeJson?.error ?? "Failed to save activity type targets");
        }
      }
      toast.success("Activity targets saved");
      applyConfigToRows(json.data as TargetConfig);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-crm-panel" />;
  }

  const suggested = defaultDailyTarget || "0";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-crm-text">Activity Targets</h2>
          <p className="mt-1 text-sm text-crm-muted">
            Targets are opt-in. No salesperson is tracked until you assign one. The organization
            default below is only a suggested value used when you assign a target.
          </p>
        </div>
        <Link
          href="/activity-tracker"
          className="inline-flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
        >
          <BarChart3 size={15} />
          Open Tracker
        </Link>
      </div>

      {/* Org-wide suggested default */}
      <Card className="crm-card">
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-crm-text">Suggested Default</h3>
            <p className="mt-1 text-xs text-crm-muted">
              Used to pre-fill a target when you assign one. Does not assign a target on its own.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Suggested daily target
              </span>
              <Input
                type="number"
                min={0}
                className="crm-input"
                value={defaultDailyTarget}
                onChange={(e) => setDefaultDailyTarget(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Working days / week
              </span>
              <Input
                type="number"
                min={1}
                max={7}
                className="crm-input"
                value={weeklyWorkingDays}
                onChange={(e) => setWeeklyWorkingDays(e.target.value)}
              />
            </label>
            <div className="flex flex-col justify-end">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Suggested weekly target
              </span>
              <div className="flex h-11 items-center rounded-lg border border-crm-border bg-crm-panel px-3 text-sm font-semibold text-crm-text">
                {weeklyPreview} activities / week
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Per-user assignment */}
      <Card className="crm-card">
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-crm-text">Assign Targets</h3>
            <p className="mt-1 text-xs text-crm-muted">
              Turn on <span className="font-medium">Assign Target</span> for each salesperson you want
              to track. Leave the target blank to use the suggested default ({suggested}/day).
              Unassigned users show <span className="font-medium">No Target Assigned</span> and are
              excluded from the tracker and all totals.{" "}
              <span className="font-medium text-crm-text">{assignedCount}</span> assigned.
            </p>
          </div>

          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
                size={14}
              />
              <Input
                className="crm-input pl-8"
                placeholder="Search by name, email, role or status…"
                aria-label="Search salespeople"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              className="w-auto"
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
            <Select
              className="w-auto"
              aria-label="Filter by target status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">No Target Assigned</option>
            </Select>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
              >
                <X size={14} />
                Clear Filters
              </button>
            )}
            <span className="text-xs text-crm-muted">
              Showing {filteredUsers.length} of {users.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Salesperson</TH>
                  <TH>Role</TH>
                  <TH>Assign Target</TH>
                  <TH>Daily Target</TH>
                </TR>
              </THead>
              <TBody>
                {pagedUsers.map((u) => {
                  const r = rowFor(u.id);
                  return (
                    <TR key={u.id}>
                      <TD>
                        <span className="font-medium text-crm-text">{u.name}</span>
                        {u.email && <span className="block text-xs text-crm-muted">{u.email}</span>}
                      </TD>
                      <TD className="text-crm-muted">{u.role}</TD>
                      <TD>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-crm-border text-accent-600 focus:ring-accent-400"
                            checked={r.enabled}
                            onChange={(e) => toggleAssign(u.id, e.target.checked)}
                          />
                          <span className={`text-xs font-medium ${r.enabled ? "text-crm-text" : "text-crm-muted"}`}>
                            {r.enabled ? "Assigned" : "No Target Assigned"}
                          </span>
                        </label>
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          min={0}
                          disabled={!r.enabled}
                          className="crm-input w-28 disabled:cursor-not-allowed disabled:opacity-50"
                          placeholder={`Default (${suggested})`}
                          value={r.target}
                          onChange={(e) => setTarget(u.id, e.target.value)}
                        />
                      </TD>
                    </TR>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="text-center text-crm-muted">
                      {users.length === 0
                        ? "No active users found."
                        : "No salespeople match the current search or filters."}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>

          {filteredUsers.length > 0 && (
            <Pagination
              page={safePage}
              pageSize={pageSize}
              total={filteredUsers.length}
              onPage={setPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
              showPageNumbers
            />
          )}
        </CardBody>
      </Card>

      {/* Activity Type-wise targets */}
      <Card className="crm-card">
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-crm-text">Activity Type Targets</h3>
            <p className="mt-1 text-xs text-crm-muted">
              Set a daily target per activity type for each salesperson. Types come from{" "}
              <Link href="/settings/activity-types" className="text-crm-blue underline">
                Settings → Activity Types
              </Link>{" "}
              — new types appear here automatically, and only active types are shown. Leave a cell
              blank for 0. These targets are separate from the overall daily target above; a
              salesperson can have either, both, or neither.
            </p>
            {filteredUsers.length > 0 && (
              <p className="mt-1 text-xs text-crm-muted">
                Showing the same salespeople as{" "}
                <span className="font-medium text-crm-text">Assign Targets</span> above — page{" "}
                <span className="font-medium text-crm-text">{safePage}</span> of{" "}
                <span className="font-medium text-crm-text">{totalPages}</span>. Unsaved edits are
                kept when you change page.
              </p>
            )}
          </div>

          {types.length === 0 ? (
            <p className="rounded-lg border border-crm-border bg-crm-panel px-4 py-6 text-center text-sm text-crm-muted">
              No active activity types found.{" "}
              <Link href="/settings/activity-types" className="text-crm-blue underline">
                Create an activity type
              </Link>{" "}
              to assign type-wise targets.
            </p>
          ) : (
            <TableScroll minWidth={typeTableMinWidth} bleed={false}>
              <Table>
                <THead>
                  <TR>
                    {/* Sticky first column; bg matches `.crm-table thead th`
                        so scrolled cells pass underneath it, not through it. */}
                    <TH className="sticky left-0 z-10 bg-crm-panel">Salesperson</TH>
                    {types.map((t) => (
                      <TH key={t.id} className="whitespace-nowrap">
                        {t.label}
                      </TH>
                    ))}
                    <TH className="whitespace-nowrap">Total / Day</TH>
                  </TR>
                </THead>
                <TBody>
                  {pagedUsers.map((u) => (
                    // Row carries an explicit background (and the hover tint) so
                    // the sticky first cell below can inherit it and stay opaque.
                    <TR key={u.id} className="bg-white hover:bg-crm-blue-soft">
                      {/* Sticky so the salesperson stays visible while scrolling
                          horizontally through a long list of type columns.
                          `bg-inherit` takes the row's own background, so the
                          row-hover tint still reads across this cell instead of
                          being masked by an opaque white. */}
                      <TD className="sticky left-0 z-10 bg-inherit">
                        <span className="font-medium text-crm-text">{u.name}</span>
                        {u.email && <span className="block text-xs text-crm-muted">{u.email}</span>}
                      </TD>
                      {types.map((t) => (
                        <TD key={t.id}>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            className="crm-input w-24"
                            placeholder="0"
                            aria-label={`${t.label} daily target for ${u.name}`}
                            value={typeTargetFor(u.id, t.id)}
                            onChange={(e) => setTypeTarget(u.id, t.id, e.target.value)}
                          />
                        </TD>
                      ))}
                      <TD className="font-semibold tabular-nums text-crm-text">
                        {typeRowTotal(u.id)}
                      </TD>
                    </TR>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TR>
                      <TD colSpan={types.length + 2} className="text-center text-crm-muted">
                        {users.length === 0
                          ? "No active users found."
                          : "No salespeople match the current search or filters."}
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </TableScroll>
          )}
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save size={15} className="mr-1.5" />
          {saving ? "Saving…" : "Save Targets"}
        </Button>
      </div>
    </div>
  );
}
