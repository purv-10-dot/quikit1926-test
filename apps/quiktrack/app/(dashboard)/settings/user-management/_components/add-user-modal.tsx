"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import {
  Button,
  Input,
  Select,
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
} from "@quikit/ui";
import { ProjectsPicker } from "./projects-picker";

interface AppRole {
  id: string;
  name: string;
  isDefault: boolean;
}

interface SearchResult {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  hasQuikTrackAccess: boolean;
}

export function AddUserModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<AddUserDrawer onClose={onClose} />, document.body);
}

function AddUserDrawer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appRoleId, setAppRoleId] = useState(""); // "" → org default
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [linkExistingUserId, setLinkExistingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email typeahead.
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [showHits, setShowHits] = useState(false);
  const emailWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(email.trim()), 250);
    return () => clearTimeout(t);
  }, [email]);

  useEffect(() => {
    if (!showHits) return;
    function onDown(e: MouseEvent) {
      if (!emailWrapRef.current?.contains(e.target as Node)) setShowHits(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showHits]);

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "org-roles"],
    queryFn: async () => {
      const r = await fetch("/api/org/roles");
      const j = await r.json();
      return (j.data as AppRole[]) ?? [];
    },
  });

  const searchQ = useQuery({
    queryKey: ["quiktrack", "user-search", debouncedEmail],
    queryFn: async () => {
      const r = await fetch(`/api/users/search?q=${encodeURIComponent(debouncedEmail)}&limit=10`);
      const j = await r.json();
      return (j.data as SearchResult[]) ?? [];
    },
    enabled: debouncedEmail.length >= 2 && !linkExistingUserId,
  });

  function pickHit(hit: SearchResult) {
    if (hit.hasQuikTrackAccess) return; // disabled row — no-op
    setFirstName(hit.firstName);
    setLastName(hit.lastName);
    setEmail(hit.email);
    setLinkExistingUserId(hit.userId);
    setPassword("");
    setShowHits(false);
  }

  function clearLink() {
    setLinkExistingUserId(null);
    setFirstName("");
    setLastName("");
    setEmail("");
  }

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        firstName,
        lastName,
        email,
        ...(linkExistingUserId
          ? { linkExistingUserId }
          : { password }),
        ...(appRoleId ? { appRoleId } : {}),
        ...(projectIds.length > 0 ? { projectIds } : {}),
      };
      const r = await fetch("/api/org/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const isLinking = !!linkExistingUserId;
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    (isLinking || password.length >= 8);

  const roles = rolesQ.data ?? [];
  const hits = searchQ.data ?? [];

  return (
    <RightPanel
      open
      onClose={onClose}
      title="Add User"
      subtitle={
        isLinking
          ? "Linking an existing org member — password not required"
          : "Invite a new member to the organisation"
      }
      size="sm"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={() => mut.mutate()}
            label={mut.isPending ? "Adding…" : "Add User"}
            saving={mut.isPending}
            disabled={!canSubmit || mut.isPending}
          />
        </RightPanelFooter>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Jane"
          disabled={isLinking}
        />
        <Input
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Doe"
          disabled={isLinking}
        />
      </div>

      {/* Email with typeahead */}
      <div ref={emailWrapRef} className="relative">
        <label className="block text-sm">
          <span className="text-gray-700 mb-1 block">Email</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (linkExistingUserId) setLinkExistingUserId(null);
                setShowHits(true);
              }}
              onFocus={() => !isLinking && setShowHits(true)}
              placeholder="jane@company.com"
              className={`w-full h-9 pl-9 pr-9 text-sm border rounded-md focus:outline-none focus:ring-1 ${
                isLinking
                  ? "border-blue-400 bg-blue-50 focus:ring-blue-400"
                  : "border-gray-200 focus:ring-blue-400"
              }`}
            />
            {isLinking && (
              <button
                type="button"
                onClick={clearLink}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-blue-100 text-blue-600"
                aria-label="Clear link"
                title="Clear and add as a new user"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </label>
        {isLinking && (
          <p className="mt-1 text-xs text-blue-700">
            Linking existing org member — password not required.
          </p>
        )}

        {showHits && !isLinking && debouncedEmail.length >= 2 && hits.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
            {hits.map((h) => (
              <button
                key={h.userId}
                type="button"
                disabled={h.hasQuikTrackAccess}
                onClick={() => pickHit(h)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm border-b border-gray-100 last:border-b-0 ${
                  h.hasQuikTrackAccess
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-blue-50"
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-[10px] font-semibold flex items-center justify-center">
                  {(h.firstName[0] ?? "?") + (h.lastName[0] ?? "")}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{h.firstName} {h.lastName}</span>
                  <span className="block text-xs text-gray-500 truncate">{h.email}</span>
                </span>
                {h.hasQuikTrackAccess ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Already in
                  </span>
                ) : (
                  <Check className="h-3.5 w-3.5 text-blue-600 opacity-0 group-hover:opacity-100" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isLinking && (
        <Input
          label="Temporary password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      )}

      <Select
        label="Role"
        value={appRoleId}
        onChange={(e) => setAppRoleId(e.target.value)}
        options={[
          { value: "", label: "Use org default" },
          ...roles.map((r) => ({
            value: r.id,
            label: r.isDefault ? `${r.name} (default)` : r.name,
          })),
        ]}
      />

      <ProjectsPicker
        selected={projectIds}
        onChange={setProjectIds}
        label="Add to projects"
        placeholder="None — assign later"
      />
      <p className="-mt-2 text-[11px] text-gray-400">
        New user joins each selected project as a member. Project-role
        assignment can be done from the project&apos;s User Management page
        after invite.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </RightPanel>
  );
}
