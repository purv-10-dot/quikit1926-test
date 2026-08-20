"use client";

/**
 * Admin surface: who has QuikChat access + who's still pending an invite.
 * Data source `/api/settings/users` and `/api/org/roles`, `{ success, data }`
 * envelope (matches RolesTab's convention). Themed with the app's real qc-*
 * design tokens (theme.css) so it matches every other Settings panel in both
 * light and dark mode, instead of hardcoded Tailwind gray/white.
 */

import { useEffect, useState } from "react";
import { Loader2, Plus, RotateCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { InviteUserModal, type RoleOption } from "./InviteUserModal";
import { InviteResultDialog, type InviteResult } from "./InviteResultDialog";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: "active" | "pending";
  inviteMethod: "native" | "sso" | null;
  invitedAt: string | null;
  acceptedAt: string | null;
}

function nameOf(u: UserRow): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email;
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; invite: InviteResult } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/settings/users"),
        fetch("/api/org/roles"),
      ]);
      const usersJson = await usersRes.json();
      const rolesJson = await rolesRes.json();
      if (!usersJson.success) {
        setError(usersJson.error || "Failed to load users");
        return;
      }
      setUsers(usersJson.data as UserRow[]);
      if (rolesJson.success) setRoles(rolesJson.data as RoleOption[]);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resend(user: UserRow) {
    setResendingId(user.id);
    setError("");
    try {
      const res = await fetch(`/api/settings/users/${user.id}/resend-invite`, { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to resend invite");
        return;
      }
      setResult({ email: user.email, invite: json.data.invite as InviteResult });
    } catch {
      setError("Network error resending invite");
    } finally {
      setResendingId(null);
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--qc-text)",
            }}
          >
            <UserPlus size={16} aria-hidden /> Users &amp; Invites
          </div>
          <div style={{ fontSize: 12.5, color: "var(--qc-text-3)", marginTop: 2 }}>
            Invite people into QuikChat by email or SSO.
          </div>
        </div>
        <Button variant="primary" onClick={() => setInviting(true)}>
          <Plus size={14} /> Invite person
        </Button>
      </div>

      {error && (
        <div className="qc-set-note qc-set-note--danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="qc-set-section">
        <div className="qc-set-section__body">
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "16px 0",
                fontSize: 12.5,
                color: "var(--qc-text-3)",
              }}
            >
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: "16px 0", fontSize: 12.5, color: "var(--qc-text-3)" }}>
              No one has QuikChat access yet. Click <strong>Invite person</strong> to add someone.
            </div>
          ) : (
            <>
              <div className="qc-user-row qc-user-row--header">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Sign-in</span>
                <span>Status</span>
                <span />
              </div>
              {users.map((u) => (
                <div className="qc-user-row" key={u.id}>
                  <div className="qc-user-name">{nameOf(u)}</div>
                  <div className="qc-user-email">{u.email}</div>
                  <div className="qc-user-cell">{u.role}</div>
                  <div className="qc-user-cell">
                    {u.inviteMethod === "sso" ? "Google / Microsoft" : "Email & password"}
                  </div>
                  <div>
                    <span
                      className={`qc-status-pill qc-status-pill--${u.status === "active" ? "active" : "pending"}`}
                    >
                      {u.status === "active" ? "Active" : "Pending"}
                    </span>
                  </div>
                  <div className="qc-user-actions">
                    {u.status === "pending" ? (
                      <button
                        type="button"
                        className="qc-iconbtn"
                        title="Resend invitation"
                        aria-label="Resend invitation"
                        onClick={() => resend(u)}
                        disabled={resendingId === u.id}
                      >
                        {resendingId === u.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RotateCw size={14} />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {inviting && (
        <InviteUserModal
          roles={roles}
          onClose={() => setInviting(false)}
          onInvited={(email, invite) => {
            setInviting(false);
            setResult({ email, invite });
            load();
          }}
        />
      )}

      {result && (
        <InviteResultDialog
          email={result.email}
          result={result.invite}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}
