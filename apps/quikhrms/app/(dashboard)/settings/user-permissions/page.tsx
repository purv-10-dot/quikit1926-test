"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Search, Lock, Ban } from "lucide-react";
import { Select } from "@/components/hrms/select";
import { PageBackground } from "@/components/hrms/page-background";
import { PERMISSION_TREE, ACTIONS } from "@/lib/rbac/permissions-tree";

/**
 * Per-user Effective Permissions page.
 *
 * Each row in the matrix = one (resource, action). Cells:
 *   - locked + checked  = granted via the user's role (RolePermission)
 *   - empty checkbox    = no grant; click to add a UserPermissionExtra
 *   - checked checkbox (no lock) = extra grant; click to revoke
 *
 * Save commits only the extras (UserPermissionExtra rows). Role grants are
 * managed on /hrms/settings/roles.
 */

interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  jobTitle: string | null;
  status: string;
  role?: { code: string; name: string } | null;
  roleId?: string | null;
}

interface RoleDetail {
  id: string;
  name: string;
  permissions: { code: string }[];
}

export default function UserPermissionsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftGrants, setDraftGrants] = useState<Set<string>>(new Set());
  const [draftDenies, setDraftDenies] = useState<Set<string>>(new Set());

  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: empResp } = useQuery({
    queryKey: ["users-permissions", "employees", statusFilter],
    queryFn: () =>
      api.get<EmployeeRow[]>(
        `/api/v1/hrms/employees?limit=1000&picker=1${statusFilter ? `&status=${statusFilter}` : ""}`,
      ),
  });
  const employees = empResp?.data ?? [];

  const expanded = employees.find((e) => e.id === expandedId);

  // Role of expanded employee (for role-derived locked cells).
  const { data: roleResp } = useQuery({
    queryKey: ["users-permissions", "role", expanded?.roleId],
    queryFn: () => api.get<RoleDetail>(`/api/v1/hrms/settings/roles/${expanded!.roleId}`),
    enabled: !!expanded?.roleId,
  });
  const roleCodes = useMemo(
    () => new Set(roleResp?.data?.permissions.map((p) => p.code) ?? []),
    [roleResp?.data?.permissions],
  );

  // Current extras for expanded employee.
  const { data: extrasResp } = useQuery({
    queryKey: ["users-permissions", "extras", expanded?.id],
    queryFn: () =>
      api.get<{ grants: string[]; denies: string[] }>(`/api/v1/hrms/employees/${expanded!.id}/permissions`),
    enabled: !!expanded,
  });

  useEffect(() => {
    setDraftGrants(new Set(extrasResp?.data?.grants ?? []));
    setDraftDenies(new Set(extrasResp?.data?.denies ?? []));
  }, [extrasResp?.data?.grants, extrasResp?.data?.denies, expanded?.id]);

  const saveMut = useMutation({
    mutationFn: (payload: { grants: string[]; denies: string[] }) =>
      api.put(`/api/v1/hrms/employees/${expanded!.id}/permissions`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-permissions", "extras", expanded?.id] });
      toast.success("Extras saved");
    },
  });

  const savedGrants = useMemo(
    () => new Set(extrasResp?.data?.grants ?? []),
    [extrasResp?.data?.grants],
  );
  const savedDenies = useMemo(
    () => new Set(extrasResp?.data?.denies ?? []),
    [extrasResp?.data?.denies],
  );
  const isDirty = useMemo(() => {
    const setsEqual = (a: Set<string>, b: Set<string>) => {
      if (a.size !== b.size) return false;
      for (const x of a) if (!b.has(x)) return false;
      return true;
    };
    return !setsEqual(savedGrants, draftGrants) || !setsEqual(savedDenies, draftDenies);
  }, [savedGrants, savedDenies, draftGrants, draftDenies]);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      e.workEmail.toLowerCase().includes(q) ||
      e.employeeCode.toLowerCase().includes(q)
    );
  });

  // Tri-state cycle for non-role cells: empty → GRANT → DENY → empty
  // For role-locked cells: toggle DENY override only.
  const cycleCell = (code: string) => {
    const inRole = roleCodes.has(code);
    const grants = new Set(draftGrants);
    const denies = new Set(draftDenies);

    if (inRole) {
      // Role cell: toggle deny override.
      if (denies.has(code)) denies.delete(code);
      else denies.add(code);
      setDraftDenies(denies);
      return;
    }

    if (grants.has(code)) {
      grants.delete(code);
      denies.add(code);
    } else if (denies.has(code)) {
      denies.delete(code);
    } else {
      grants.add(code);
    }
    setDraftGrants(grants);
    setDraftDenies(denies);
  };

  return (
    <div className="bg-white">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-4">
        <h1 className="text-base font-semibold text-gray-900">Users — Effective Permissions</h1>
        <span className="text-xs text-gray-400">{employees.length} {statusFilter ? statusFilter.toLowerCase() : "total"} members</span>
        <div className="ml-auto flex items-center gap-2">
          <Select
            clearable
            placeholder="All statuses"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: "Active", label: "Active" },
              { value: "PreBoarding", label: "PreBoarding" },
              { value: "OnLeave", label: "OnLeave" },
              { value: "OnNotice", label: "OnNotice" },
              { value: "Suspended", label: "Suspended" },
              { value: "Relieved", label: "Relieved" },
              { value: "Absconding", label: "Absconding" },
            ]}
          />
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-md w-72 focus:outline-none focus:ring-1 focus:ring-[#22c55e]"
            />
          </div>
        </div>
      </div>

      {/* Employee list */}
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500">
            <th className="px-4 py-2.5 text-left">User</th>
            <th className="px-4 py-2.5 text-left">Email</th>
            <th className="px-4 py-2.5 text-left">Role</th>
            <th className="px-4 py-2.5 text-left">Status</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((emp) => (
            <Fragment key={emp.id}>
              <tr
                className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                  emp.id === expandedId ? "bg-green-50/30" : ""
                }`}
                onClick={() => setExpandedId(emp.id === expandedId ? null : emp.id)}
              >
                <td className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <span>{emp.firstName} {emp.lastName}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{emp.workEmail}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[11px] font-medium px-2 py-1 bg-gray-100 text-gray-700 rounded">
                    {emp.role?.name ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] font-medium flex items-center gap-1 ${emp.status === "Active" ? "text-green-600" : "text-gray-400"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" /> {emp.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400">{emp.id === expandedId ? "▼" : "▶"}</td>
              </tr>
              {emp.id === expandedId && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <div className="bg-white border-y border-gray-200">
                      <div className="px-5 py-3 flex items-center gap-3 border-b border-gray-100">
                        <h3 className="text-[13px] font-semibold">Effective permissions</h3>
                        <span className="text-[11px] font-medium uppercase px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                          Role: {emp.role?.name ?? "none"}
                        </span>
                        <button
                          onClick={() => setExpandedId(null)}
                          className="ml-auto text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mx-6 mt-3 px-4 py-2 bg-green-600 text-white text-xs rounded-md flex items-start gap-2">
                        <span className="text-amber-300">ℹ</span>
                        <span>
                          Click cycles: <b>empty → <span className="text-amber-300">grant</span> → <span className="text-red-300">deny</span> → empty</b>.
                          Role cells (<Lock size={10} className="inline" />) can be denied as override.
                        </span>
                      </div>
                      <div className="p-4">
                        <UserMatrix
                          roleCodes={roleCodes}
                          grants={draftGrants}
                          denies={draftDenies}
                          onToggle={cycleCell}
                        />
                      </div>
                      <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
                        <button
                          onClick={() => saveMut.mutate({ grants: Array.from(draftGrants), denies: Array.from(draftDenies) })}
                          disabled={!isDirty || saveMut.isPending}
                          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40"
                        >
                          {saveMut.isPending ? "Saving..." : "Save extras"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserMatrix({
  roleCodes,
  grants,
  denies,
  onToggle,
}: {
  roleCodes: Set<string>;
  grants: Set<string>;
  denies: Set<string>;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-[0.04em]">
            <th className="text-left px-4 py-2.5 font-semibold text-gray-700 w-1/2">Entity</th>
            {ACTIONS.map((a) => (
              <th key={a} className="text-center px-4 py-2.5 font-semibold text-gray-700">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_TREE.map((mod) => {
            const moduleCodes = mod.leaves.flatMap((leaf) =>
              ACTIONS.map((a) => leaf.actions[a].code).filter((c): c is string => Boolean(c)),
            );
            const roleHits = moduleCodes.filter((c) => roleCodes.has(c)).length;
            return (
              <Fragment key={mod.key}>
                <tr className="bg-gray-50/40 border-t border-gray-200">
                  <td className="px-4 py-2.5 font-semibold text-gray-800">
                    {mod.label}
                    <span className="ml-2 text-[11px] font-semibold px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                      {roleHits} role
                    </span>
                  </td>
                  {ACTIONS.map((a) => (
                    <td key={a} className="px-4 py-2.5" />
                  ))}
                </tr>
                {mod.leaves.map((leaf) => (
                  <tr key={leaf.resource} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 pl-10 text-gray-600">└ {leaf.label}</td>
                    {ACTIONS.map((a) => {
                      const code = leaf.actions[a].code;
                      if (!code) {
                        return (
                          <td key={a} className="text-center px-4 py-2.5 text-gray-300">—</td>
                        );
                      }
                      const fromRole = roleCodes.has(code);
                      const isGrant = grants.has(code);
                      const isDeny = denies.has(code);
                      // Effective: role-grant minus deny override + extra grant
                      let state: "empty" | "role" | "grant" | "deny" | "role-denied" = "empty";
                      if (fromRole && isDeny) state = "role-denied";
                      else if (fromRole) state = "role";
                      else if (isDeny) state = "deny";
                      else if (isGrant) state = "grant";
                      return (
                        <td key={a} className="text-center px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => onToggle(code)}
                            title={
                              state === "role" ? "From role — click to deny" :
                              state === "role-denied" ? "Role grant overridden by deny — click to remove deny" :
                              state === "grant" ? "Extra grant — click to deny" :
                              state === "deny" ? "Denied — click to remove" :
                              "No grant — click to add grant"
                            }
                            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 cursor-pointer"
                          >
                            {state === "role" && (
                              <span className="inline-flex items-center gap-0.5">
                                <span className="w-4 h-4 rounded-sm bg-gray-400 text-white flex items-center justify-center text-[10px]">✓</span>
                                <Lock size={10} className="text-gray-400" />
                              </span>
                            )}
                            {state === "role-denied" && (
                              <span className="inline-flex items-center gap-0.5">
                                <span className="w-4 h-4 rounded-sm bg-red-500 text-white flex items-center justify-center"><Ban size={10} /></span>
                                <Lock size={10} className="text-gray-400" />
                              </span>
                            )}
                            {state === "grant" && (
                              <span className="w-4 h-4 rounded-sm bg-amber-500 text-white flex items-center justify-center text-[10px]">✓</span>
                            )}
                            {state === "deny" && (
                              <span className="w-4 h-4 rounded-sm bg-red-500 text-white flex items-center justify-center"><Ban size={10} /></span>
                            )}
                            {state === "empty" && (
                              <span className="w-4 h-4 rounded-sm border border-gray-300" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
