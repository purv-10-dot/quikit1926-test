"use client";

/**
 * "Invite a person" form. Admin picks native email (temp password, set a new
 * one on first login) or SSO (Google/Microsoft — validated server-side via
 * MX lookup before the invite is created). Posts to POST /api/settings/users.
 * Built on the shared `Modal` + `.qc-input` design system so it matches every
 * other dialog in the app (theme.css), instead of a hand-rolled light-only card.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import type { InviteResult } from "./InviteResultDialog";

export interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

export function InviteUserModal({
  roles,
  onClose,
  onInvited,
}: {
  roles: RoleOption[];
  onClose: () => void;
  onInvited: (email: string, result: InviteResult) => void;
}) {
  const defaultRoleId = roles.find((r) => r.isDefault)?.id ?? roles[0]?.id ?? "";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [method, setMethod] = useState<"native" | "sso">("native");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !roleId) {
      setError("First name, last name, email and role are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          roleId,
          invitationMethod: method,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to send invitation");
        return;
      }
      onInvited(json.data.email, json.data.invite);
    } catch {
      setError("Network error sending invitation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite a person"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="qc-label">First name</label>
            <input
              className="qc-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Priya"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="qc-label">Last name</label>
            <input
              className="qc-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Sharma"
            />
          </div>
        </div>

        <div>
          <label className="qc-label">Email</label>
          <input
            type="email"
            className="qc-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@company.com"
          />
        </div>

        <div>
          <label className="qc-label">Role</label>
          <select
            className="qc-input"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="qc-label" style={{ marginBottom: 6, display: "block" }}>
            Sign-in method
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className={`qc-option${method === "native" ? " qc-option--active" : ""}`}>
              <input
                type="radio"
                name="method"
                checked={method === "native"}
                onChange={() => setMethod("native")}
              />
              <span>
                <span className="qc-option__title">Email &amp; password</span>
                <span className="qc-option__desc">
                  We email a temporary password. They set a new one on first sign-in.
                </span>
              </span>
            </label>
            <label className={`qc-option${method === "sso" ? " qc-option--active" : ""}`}>
              <input
                type="radio"
                name="method"
                checked={method === "sso"}
                onChange={() => setMethod("sso")}
              />
              <span>
                <span className="qc-option__title">Google / Microsoft (SSO)</span>
                <span className="qc-option__desc">
                  They sign in with their existing work account. No password is created.
                </span>
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="qc-set-note qc-set-note--danger" role="alert">
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
