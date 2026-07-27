"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Save, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const CONFIG_API = "/api/settings/activity-targets";
const USERS_API = "/api/users/picker";

interface UserAssignment {
  enabled: boolean;
  dailyTarget?: number;
}

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
      const [cfgRes, usersRes] = await Promise.all([
        fetch(CONFIG_API, { credentials: "include" }),
        fetch(USERS_API, { credentials: "include" }),
      ]);
      const cfgJson = await cfgRes.json();
      const usersJson = await usersRes.json();

      if (!cfgRes.ok || !cfgJson?.success) {
        throw new Error(cfgJson?.error ?? "Failed to load activity targets");
      }
      const cfg = cfgJson.data as TargetConfig;
      setDefaultDailyTarget(String(cfg.defaultDailyTarget));
      setWeeklyWorkingDays(String(cfg.weeklyWorkingDays));
      applyConfigToRows(cfg);
      setUsers(Array.isArray(usersJson?.items) ? usersJson.items : []);
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

  function rowFor(userId: string): RowState {
    return rows[userId] ?? { enabled: false, target: "" };
  }

  function toggleAssign(userId: string, enabled: boolean) {
    setRows((prev) => ({ ...prev, [userId]: { ...rowFor(userId), enabled } }));
  }

  function setTarget(userId: string, target: string) {
    setRows((prev) => ({ ...prev, [userId]: { ...rowFor(userId), target } }));
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

      const res = await fetch(CONFIG_API, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to save");
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
                {users.map((u) => {
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
                {users.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="text-center text-crm-muted">
                      No active users found.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
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
