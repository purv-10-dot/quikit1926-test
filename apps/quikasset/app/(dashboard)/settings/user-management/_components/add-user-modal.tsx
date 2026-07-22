"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalShell, PrimaryButton, GhostButton } from "./shared";
import { RolePill } from "./role-pill";
import type { Role, SearchUser } from "./types";

type InvitationMethod = "native" | "sso";

interface Props {
  roles: Role[];
  onClose: () => void;
  onCreated: () => void;
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

export function AddUserModal({ roles, onClose, onCreated, showToast }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [method, setMethod] = useState<InvitationMethod>("native");
  const [appRoleId, setAppRoleId] = useState<string>("");
  const [linkUserId, setLinkUserId] = useState<string | null>(null);

  // Employee-directory fields — the unified Add creates/links an AstEmployee
  // alongside the login. All optional; employeeId auto-generates when blank.
  const [employeeId, setEmployeeId] = useState("");
  const [contact, setContact] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [joiningDate, setJoiningDate] = useState("");

  const [results, setResults] = useState<SearchUser[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced org-member typeahead. Selecting a result links an existing
  // member instead of creating a brand-new user.
  const runSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/org/users/search?q=${encodeURIComponent(q)}&limit=8`);
        const json = await res.json();
        setResults(json?.data ?? []);
        setShowDropdown(true);
      } catch {
        setResults([]);
      }
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function selectExisting(u: SearchUser) {
    setLinkUserId(u.userId);
    setFirstName(u.firstName);
    setLastName(u.lastName);
    setEmail(u.email);
    setShowDropdown(false);
  }

  function clearSelection() {
    setLinkUserId(null);
    setFirstName("");
    setLastName("");
    setEmail("");
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = linkUserId
        ? { firstName, lastName, email, linkExistingUserId: linkUserId }
        : { firstName, lastName, email, invitationMethod: method };
      if (appRoleId) body.appRoleId = appRoleId;
      if (!linkUserId && method === "native" && password.trim()) body.password = password.trim();
      // Employee-directory fields (all optional).
      if (employeeId.trim()) body.employeeId = employeeId.trim();
      if (contact.trim()) body.contact = contact.trim();
      if (department.trim()) body.department = department.trim();
      if (designation.trim()) body.designation = designation.trim();
      if (joiningDate) body.joiningDate = joiningDate;

      const res = await fetch("/api/org/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not add user", json?.error ?? "Request failed", "error");
        return;
      }
      onCreated();
      if (json.data?.tempPassword) {
        setTempPassword(json.data.tempPassword);
        showToast("User added", "A temporary password was generated.");
      } else {
        showToast(linkUserId ? "Access granted" : "User added", `${email} now has QuikAsset access.`);
        onClose();
      }
    } catch {
      showToast("Could not add user", "Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  function copyTemp() {
    if (!tempPassword) return;
    void navigator.clipboard?.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Employee ID + Contact + Department are required when creating a new person.
  // When granting access to an existing member (link), they're not — that member
  // already has (or the server will link) an employee record.
  const employeeValid = employeeId.trim() !== "" && contact.trim() !== "" && department.trim() !== "";
  const valid =
    !!firstName.trim() && !!lastName.trim() && /.+@.+\..+/.test(email) && (!!linkUserId || employeeValid);

  // ── Temp-password reveal (shown once) ──
  if (tempPassword) {
    return (
      <ModalShell
        title="Temporary password"
        subtitle="Shown once — copy it now and share it securely with the user."
        onClose={() => {
          onClose();
        }}
        footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-100">
            <KeyRound className="h-6 w-6 text-accent-600" />
          </div>
          <p className="text-xs leading-relaxed text-gray-500">
            {email} was added. They must change this password on first sign-in.
          </p>
          <div className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <code className="flex-1 select-all font-mono text-sm text-gray-800">{tempPassword}</code>
            <button
              onClick={copyTemp}
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
              title="Copy"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Add user"
      subtitle="Invite a new person or grant an existing org member QuikAsset access."
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            {linkUserId ? "Grant access" : "Send invite"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Email + typeahead */}
        <div className="relative">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="email"
              value={email}
              disabled={!!linkUserId}
              onChange={(e) => {
                setEmail(e.target.value);
                runSearch(e.target.value);
              }}
              onFocus={() => results.length && setShowDropdown(true)}
              placeholder="name@company.com"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:opacity-60"
            />
          </div>
          {showDropdown && results.length > 0 && !linkUserId && (
            <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {results.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => selectExisting(u)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-800">
                      {u.firstName} {u.lastName}
                    </span>
                    <span className="block truncate text-[10px] text-gray-400">{u.email}</span>
                  </span>
                  {u.hasQuikAssetAccess && (
                    <span className="flex items-center gap-1 whitespace-nowrap text-[10px] text-green-600">
                      <ShieldCheck className="h-3 w-3" /> has access
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {linkUserId && (
          <div className="flex items-center justify-between rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-xs text-accent-700">
            <span>Granting access to an existing org member.</span>
            <button onClick={clearSelection} className="font-semibold underline">
              Change
            </button>
          </div>
        )}

        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              First name
            </label>
            <input
              value={firstName}
              disabled={!!linkUserId}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Last name
            </label>
            <input
              value={lastName}
              disabled={!!linkUserId}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:opacity-60"
            />
          </div>
        </div>

        {/* Invitation method (new users only) */}
        {!linkUserId && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Invitation method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["native", "sso"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    method === m
                      ? "border-accent-300 bg-accent-50 text-accent-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50",
                  )}
                >
                  <span className="block font-semibold">{m === "native" ? "Native" : "SSO"}</span>
                  <span className="block text-[10px] text-gray-400">
                    {m === "native" ? "Password sign-in" : "Google / Microsoft"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Password (native new users only) */}
        {!linkUserId && method === "native" && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Password <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to auto-generate a temporary password"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
        )}

        {/* App role */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Role
          </label>
          <select
            value={appRoleId}
            onChange={(e) => setAppRoleId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            <option value="">Default (Member)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {appRoleId && (
            <div className="mt-1.5">
              <RolePill name={roles.find((r) => r.id === appRoleId)?.name ?? null} />
            </div>
          )}
        </div>

        {/* Employee details — the unified Add creates a linked employee record.
            Employee ID / Contact / Department are required for a new person;
            optional when granting access to an existing member. */}
        <div className="border-t border-gray-100 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Employee details
            {linkUserId && (
              <span className="font-normal normal-case text-gray-400"> (optional)</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                Employee ID {!linkUserId && <span className="text-red-500">*</span>}
              </label>
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP-006"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                Contact {!linkUserId && <span className="text-red-500">*</span>}
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                Department {!linkUserId && <span className="text-red-500">*</span>}
              </label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Designation</label>
              <input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Joining date</label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
