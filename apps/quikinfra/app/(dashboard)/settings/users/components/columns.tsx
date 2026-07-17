"use client";

import { Send, ShieldCheck } from "lucide-react";
import { type MasterColumnDef } from "@/components/MasterListPage";
import { formatRoleLabel, getDescriptorByRoleName } from "@/lib/rbac/user-types";
import { USER_TYPE_COLORS } from "../lib/constants";
import type { UserRow } from "../lib/types";

export function buildUserColumns(deps: {
  resendingIds: Set<string>;
  router: { push: (href: string) => void };
  handleResendInvite: (row: UserRow) => void;
}): MasterColumnDef<UserRow>[] {
  const { resendingIds, router, handleResendInvite } = deps;
  return [
      {
        key: "fullName",
        label: "Name",
        render: (row) => {
          const displayName =
            row.firstName || row.lastName
              ? [row.firstName, row.lastName].filter(Boolean).join(" ")
              : row.fullName;
          return <div className="font-medium text-gray-900">{displayName}</div>;
        },
      },
      { key: "email", label: "Email" },
      {
        key: "userType",
        label: "Role",
        width: "210px",
        render: (row) => {
          // Prefer the lowercase `roleKey` from the API (matches CnAppRole.name).
          // Fall back to the legacy uppercase `userType` for older payloads.
          const roleName = (row.roleKey ?? row.userType ?? "").toString();
          const upperKey = roleName.toUpperCase().replace(/-/g, "_");
          const color =
            USER_TYPE_COLORS[upperKey] ?? "bg-gray-50 text-gray-700 border-gray-200";
          // Only the admin role can hold the optional "Grant Settings access"
          // extra. When present, show a second badge so it's visible at a
          // glance which admins can reach Settings (invite users / manage
          // roles) vs plain app-only admins.
          const showSettingsBadge =
            roleName.toLowerCase() === "admin" && !!row.hasSettingsAccess;
          return (
            <div className="flex flex-col items-start gap-1">
              <span
                className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${color}`}
              >
                {formatRoleLabel(roleName)}
              </span>
              {showSettingsBadge && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"
                  title="Can invite users, manage roles, and reach the Settings module"
                >
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                  Settings module access
                </span>
              )}
            </div>
          );
        },
      },
      { key: "department", label: "Department" },
      {
        key: "projectsAssigned",
        label: "Sites",
        width: "80px",
        render: (row) => {
          const roleName = (row.roleKey ?? row.userType ?? "").toString();
          const d = getDescriptorByRoleName(roleName);
          if (d.crossSite) return <span className="text-[10px] text-gray-500">All sites</span>;
          const n = row.projectsAssigned?.length ?? 0;
          return <span className="text-xs text-gray-700">{n}</span>;
        },
      },
      {
        key: "status",
        label: "Status",
        width: "180px",
        render: (row) => {
          const isInactive = row.status === "inactive";
          // Either signal counts as "accepted":
          //   acceptedAt   — quikit.OrgMember.acceptedAt, set when the
          //                  launcher's set-password flow completes
          //   lastLoginAt  — auth.User.lastSignInAt, set on every sign-in
          // The list endpoint overrides both with their v2 sources.
          const accepted = !!row.acceptedAt || !!row.lastLoginAt;
          const inviteOpen = !accepted && !!row.inviteTokenExpires;
          const expiresAtMs = row.inviteTokenExpires
            ? new Date(row.inviteTokenExpires).getTime()
            : 0;
          const inviteExpired = inviteOpen && expiresAtMs < Date.now();
          const sending = resendingIds.has(row.id);

          // Common wrapper — every variant returns the same flex
          // structure so the pill is always anchored to the same
          // top-left position, regardless of whether the variant adds
          // a secondary line (Resend countdown / Resend button).
          // Without this, Active/Inactive rows render as bare <span>s
          // and visually drift up/down relative to the multi-line
          // Invite Pending row.
          const PILL_BASE =
            "self-start text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap";

          if (isInactive) {
            return (
              <div className="flex flex-col items-start gap-0.5">
                <span className={`${PILL_BASE} bg-gray-50 text-gray-500 border-gray-200`}>
                  Inactive
                </span>
              </div>
            );
          }
          if (inviteExpired) {
            // Expired invites get an inline Resend action — sits BELOW
            // the pill (matches the Pending layout), not beside it, so
            // every multi-line variant has the same vertical rhythm.
            return (
              <div className="flex flex-col items-start gap-0.5">
                <span
                  className={`${PILL_BASE} bg-red-50 text-red-700 border-red-200`}
                  title="Invite link expired — resend to issue a new one"
                >
                  Invite Expired
                </span>
                <button
                  type="button"
                  disabled={sending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResendInvite(row);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 hover:text-orange-900 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline"
                  title="Send a fresh invite email"
                >
                  <Send className="w-3 h-3" />
                  {sending ? "Sending…" : "Resend"}
                </button>
              </div>
            );
          }
          if (inviteOpen) {
            const remainingMs = Math.max(0, expiresAtMs - Date.now());
            const remainingLabel = (() => {
              if (remainingMs <= 0) return "";
              const totalMin = Math.ceil(remainingMs / 60_000);
              if (totalMin < 60) return `${totalMin}m`;
              const hours = Math.ceil(totalMin / 60);
              return `${hours}h`;
            })();
            return (
              <div className="flex flex-col items-start gap-0.5">
                <span
                  className={`${PILL_BASE} bg-amber-50 text-amber-700 border-amber-200`}
                  title="Invite sent — waiting for the user to set their password"
                >
                  Invite Pending
                </span>
                {remainingLabel && (
                  <span className="text-[10px] text-gray-400">
                    Resend in {remainingLabel}
                  </span>
                )}
              </div>
            );
          }
          return (
            <div className="flex flex-col items-start gap-0.5">
              <span className={`${PILL_BASE} bg-green-50 text-green-700 border-green-200`}>
                Active
              </span>
            </div>
          );
        },
      },
      {
        key: "__permissions",
        label: "Permissions",
        width: "120px",
        sortable: false,
        render: (row) => (
          // Cell-level permission overrides live on a dedicated full-
          // width page (the matrix is too wide for the row-actions
          // column). Role + modules already grant the typical case at
          // invite time; this link is for the rare per-cell override.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/settings/users/${row.id}/permissions`);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 hover:underline"
            title="Configure per-menu Add/Edit/Delete/View permissions"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Permissions
          </button>
        ),
      },
  ];
}
