"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useActiveBrandId } from "@/hooks/useActiveBrandId";
import { useRouter } from "next/navigation";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Crown,
  X,
  Plus,
  PlusCircle,
  Pencil,
  Trash2,
  MoreVertical,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Shield,
  User as UserIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkspaceRole = "admin" | "member";

interface BrandLite {
  _id: string;
  name: string;
}

interface UserAssignment {
  brandId: string;
  workspace: string;
  role: WorkspaceRole | "approver";
  roleId: string;
  virtual: boolean; // synthesized from Brand.userId — no real DB row
}

interface UserRow {
  userId: string;
  name: string;
  email: string;
  isAppAdmin: boolean;
  assignments: UserAssignment[];
}

interface InviteDraftRow {
  id: string;
  email: string;
  workspaceRoleMap: Record<string, WorkspaceRole>; // brandId → role
}

// ---------------------------------------------------------------------------
// Style constants — design-tokens.md
// ---------------------------------------------------------------------------

const glassCardStyle: React.CSSProperties = {
  background: "rgba(33, 33, 33, 0.14)",
  border: "1px solid rgba(255, 255, 255, 0.10)",
  borderRadius: 16,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  color: "#ffffff",
  fontSize: 14,
  padding: "0 14px",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.65)",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 8,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function RolePill({ role }: { role: WorkspaceRole | "approver" }) {
  const isAdminish = role === "admin" || role === "approver";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        background: isAdminish ? "#ffffff" : "rgba(255,255,255,0.10)",
        color: isAdminish ? "#0a0a0a" : "#ffffff",
        textTransform: "capitalize",
      }}
    >
      {isAdminish ? <Shield size={11} /> : <UserIcon size={11} />}
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Invite-link reveal modal — shown after a successful POST /api/invite
// ---------------------------------------------------------------------------

function InviteLinkModal({
  link,
  onClose,
}: {
  link: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore — fall through */
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...glassCardStyle,
          width: "min(520px, 94vw)",
          padding: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={22} color="#22C55E" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, margin: 0 }}>
              Invitation ready
            </h3>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 }}>
              Email sending is disabled — copy this link and share it with the invitee.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <code
            style={{
              flex: 1,
              minWidth: 0,
              color: "rgba(255,255,255,0.85)",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {link}
          </code>
          <button
            type="button"
            onClick={copy}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.20)",
              background: copied ? "#22C55E" : "rgba(255,255,255,0.10)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, margin: "0 0 14px", lineHeight: 1.5 }}>
          The link is valid for 7 days. The invitee must sign in (or sign up) with the invited
          email to accept.
        </p>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            height: 40,
            borderRadius: 10,
            border: "none",
            background: "#ffffff",
            color: "#0a0a0a",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog (remove member)
// ---------------------------------------------------------------------------

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 230,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onCancel}
    >
      <div
        style={{ ...glassCardStyle, width: 420, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>
          {title}
        </h3>
        <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          {message}
        </p>
        {error && <p style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "rgba(255,255,255,0.75)",
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              border: "none",
              background: destructive ? "#EF4444" : "#ffffff",
              color: destructive ? "#ffffff" : "#0a0a0a",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite Form modal — SC1 layout: email, workspace dropdown, batch list
// ---------------------------------------------------------------------------

function InviteFormModal({
  brands,
  onClose,
  onLink,
}: {
  brands: BrandLite[];
  onClose: () => void;
  onLink: (link: string) => void;
}) {
  const [draftEmail, setDraftEmail] = useState("");
  const [draftRoles, setDraftRoles] = useState<Record<string, WorkspaceRole>>({});
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rows, setRows] = useState<InviteDraftRow[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const selectedCount = Object.keys(draftRoles).length;

  const toggleWorkspace = (brandId: string) => {
    setDraftRoles((prev) => {
      if (prev[brandId]) {
        const next = { ...prev };
        delete next[brandId];
        return next;
      }
      return { ...prev, [brandId]: "member" };
    });
  };

  const setRoleFor = (brandId: string, role: WorkspaceRole) => {
    setDraftRoles((prev) => ({ ...prev, [brandId]: role }));
  };

  const clearDraft = () => {
    setDraftEmail("");
    setDraftRoles({});
    setEditingRowId(null);
    setDropdownOpen(false);
  };

  const addToBatch = () => {
    const email = draftEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    if (selectedCount === 0) {
      setError("Pick at least one workspace.");
      return;
    }
    setError(null);
    setRows((prev) => {
      if (editingRowId) {
        return prev.map((r) =>
          r.id === editingRowId
            ? { ...r, email, workspaceRoleMap: { ...draftRoles } }
            : r
        );
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          email,
          workspaceRoleMap: { ...draftRoles },
        },
      ];
    });
    clearDraft();
  };

  const editRow = (row: InviteDraftRow) => {
    setDraftEmail(row.email);
    setDraftRoles({ ...row.workspaceRoleMap });
    setEditingRowId(row.id);
    setError(null);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
    if (editingRowId === rowId) clearDraft();
  };

  const send = async () => {
    if (!rows.length) {
      setError("Add at least one invite entry first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      let lastLink: string | null = null;
      for (const row of rows) {
        const workspaceRoles = Object.entries(row.workspaceRoleMap).map(([brandId, role]) => ({
          brandId,
          role,
        }));
        const res = await fetch("/api/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: row.email, workspaceRoles }),
        });
        const data = unwrap(await res.json().catch(() => ({})));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to create invite");
        }
        lastLink = data?.inviteLink ?? null;
      }
      if (lastLink) {
        onLink(lastLink);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to send invites.");
    } finally {
      setSending(false);
    }
  };

  const brandsById = useMemo(() => {
    const m = new Map<string, BrandLite>();
    for (const b of brands) m.set(b._id, b);
    return m;
  }, [brands]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(880px, 96vw)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          margin: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{ ...glassCardStyle, padding: "18px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#ffffff" }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.85)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Invite User</h2>
          </div>
        </div>

        {/* Form panel */}
        <div style={{ ...glassCardStyle, padding: 24 }}>
          <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 16 }}>
            Invite User Form
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) 44px",
              gap: 14,
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle}>User email</label>
              <input
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                placeholder="eg. user@gmail.com"
                style={inputStyle}
              />
            </div>

            <div style={{ position: "relative" }}>
              <label style={labelStyle}>Workspace &amp; Role</label>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                style={{
                  ...inputStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  color: selectedCount > 0 ? "#ffffff" : "rgba(255,255,255,0.55)",
                }}
              >
                <span>
                  {selectedCount > 0
                    ? `${selectedCount} workspace${selectedCount === 1 ? "" : "s"} selected`
                    : "Select workspace & role"}
                </span>
                {dropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {dropdownOpen && (
                <div
                  // Heavy glass surface — design-tokens.md "Brand-selector dropdown"
                  // Primary glass card tokens — design-tokens.md §1.
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    maxHeight: 280,
                    overflowY: "auto",
                    background: "rgba(33, 33, 33, 0.14)",
                    border: "1px solid rgba(255, 255, 255, 0.10)",
                    borderRadius: 16,
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                    padding: 8,
                  }}
                >
                  {brands.length === 0 ? (
                    <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, padding: 10, margin: 0 }}>
                      You aren't admin of any workspace yet.
                    </p>
                  ) : (
                    brands.map((b) => {
                      const role = draftRoles[b._id];
                      const checked = !!role;
                      return (
                        <div
                          key={b._id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 10px",
                            borderRadius: 10,
                            background: checked ? "rgba(255,255,255,0.10)" : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleWorkspace(b._id)}
                            style={{
                              width: 16,
                              height: 16,
                              accentColor: "#ffffff",
                              cursor: "pointer",
                            }}
                          />
                          <span style={{ flex: 1, color: "#ffffff", fontSize: 13 }}>{b.name}</span>
                          {checked && (
                            <div style={{ display: "flex", gap: 4 }}>
                              {(["member", "admin"] as const).map((r) => {
                                const active = role === r;
                                return (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRoleFor(b._id, r)}
                                    style={{
                                      padding: "4px 12px",
                                      borderRadius: 9999,
                                      border: active
                                        ? "1px solid rgba(255,255,255,0.40)"
                                        : "1px solid rgba(255,255,255,0.12)",
                                      background: active
                                        ? "rgba(255,255,255,0.18)"
                                        : "transparent",
                                      color: active ? "#ffffff" : "rgba(255,255,255,0.65)",
                                      fontSize: 11,
                                      fontWeight: active ? 600 : 500,
                                      cursor: "pointer",
                                      textTransform: "capitalize",
                                    }}
                                  >
                                    {r}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={addToBatch}
              aria-label={editingRowId ? "Save invite entry" : "Add invite entry"}
              style={{
                height: 44,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.10)",
                color: "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={18} />
            </button>
          </div>
          {editingRowId && (
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, margin: "8px 0 0" }}>
              Editing entry — click <strong>+</strong> to save.
            </p>
          )}
          {error && (
            <p style={{ color: "#EF4444", fontSize: 12, margin: "10px 0 0" }}>{error}</p>
          )}

          {/* Batch list */}
          <h3
            style={{
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              margin: "22px 0 10px",
            }}
          >
            Invite User List
          </h3>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 2.5fr 80px",
                gap: 0,
                background: "rgba(255,255,255,0.05)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {["User email", "Workspace & Role", "Action"].map((h, i) => (
                <div
                  key={h}
                  style={{
                    padding: "10px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.55)",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    textAlign: i === 2 ? "center" : "left",
                    borderRight: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>
            {rows.length === 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 2.5fr 80px",
                }}
              >
                <div style={{ padding: "12px 14px", color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  No invite entries yet
                </div>
                <div style={{ padding: "12px 14px", color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  Add email + workspace role above
                </div>
                <div style={{ padding: "12px 14px", textAlign: "center", color: "rgba(255,255,255,0.30)" }}>—</div>
              </div>
            ) : (
              rows.map((row, idx) => (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 2.5fr 80px",
                    borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    alignItems: "center",
                    minHeight: 52,
                  }}
                >
                  <div style={{ padding: "10px 14px", color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                    {row.email}
                  </div>
                  <div style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(row.workspaceRoleMap).map(([brandId, role]) => (
                      <span
                        key={brandId}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 9999,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.10)",
                          color: "#ffffff",
                          fontSize: 11,
                        }}
                      >
                        <span>{brandsById.get(brandId)?.name ?? brandId}</span>
                        <span style={{ width: 1, height: 10, background: "rgba(255,255,255,0.18)" }} />
                        <span style={{ color: "rgba(255,255,255,0.65)", textTransform: "capitalize" }}>
                          {role}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => editRow(row)}
                      aria-label="Edit"
                      style={{
                        background: "none",
                        border: "none",
                        color: "rgba(255,255,255,0.75)",
                        cursor: "pointer",
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label="Remove"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#F87171",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* CTA */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button
              type="button"
              onClick={send}
              disabled={sending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                height: 42,
                padding: "0 22px",
                borderRadius: 10,
                border: "none",
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 13,
                fontWeight: 600,
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? <Loader2 size={14} /> : <CheckCircle2 size={14} />}
              {sending ? "Sending…" : "Send Invitation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApprovalPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const sessionBrandId = useActiveBrandId();
  const callerId = (session?.user as { id?: string })?.id;

  // Members are redirected away — they don't have an Invite User page.
  const { isAdmin, isLoading: roleLoading } = useWorkspaceRole(sessionBrandId);
  useEffect(() => {
    if (!sessionBrandId || roleLoading) return;
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, roleLoading, sessionBrandId, router]);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [brands, setBrands] = useState<BrandLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [latestLink, setLatestLink] = useState<string | null>(null);

  // Per-row UI state for the action menu, role-change inflight, remove confirm.
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    roleId: string;
    workspace: string;
    name: string;
  } | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/invite", { credentials: "include" });
      const d = unwrap(await r.json().catch(() => ({})));
      if (r.ok) {
        setUsers(d.users ?? []);
        setBrands(d.brands ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Close the action menu on any outside click.
  useEffect(() => {
    if (!openMenuKey) return;
    const handler = () => setOpenMenuKey(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuKey]);

  const handleChangeRole = async (a: UserAssignment) => {
    if (a.virtual || a.role === "approver") return; // can't mutate synthetic rows
    const next: WorkspaceRole = a.role === "admin" ? "member" : "admin";
    setPendingRoleId(a.roleId);
    setOpenMenuKey(null);
    try {
      const res = await fetch(`/api/workspace-role/${a.roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: next }),
      });
      if (res.ok) await refresh();
    } finally {
      setPendingRoleId(null);
    }
  };

  const performRemove = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/workspace-role/${removeTarget.roleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const d = unwrap(await res.json().catch(() => ({})));
      if (!res.ok) {
        setRemoveError(d?.error || "Failed to remove member");
        return;
      }
      setRemoveTarget(null);
      await refresh();
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes qs-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes qs-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Outer wrapper — no padding (layout shell owns spacing). */}
      <div>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              aria-label="Back to dashboard"
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.85)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <h1 style={{ fontSize: 26, fontWeight: 500, color: "#ffffff", margin: 0 }}>
              Invite User
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setShowInvite(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              height: 40,
              padding: "0 18px",
              borderRadius: 10,
              border: "none",
              background: "#ffffff",
              color: "#0a0a0a",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <PlusCircle size={14} />
            Add User
          </button>
        </div>

        {/* User list table */}
        <div
          style={{
            ...glassCardStyle,
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1.5fr 2fr 2fr 1fr 80px",
              background: "rgba(255,255,255,0.05)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {["", "User Name", "Email", "Workspace", "Role", "Actions"].map((h, i) => (
              <div
                key={`${h}-${i}`}
                style={{
                  padding: "12px 16px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.55)",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  borderRight: i < 5 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  textAlign: i === 0 || i === 5 ? "center" : "left",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: "32px 16px" }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.05)",
                    marginBottom: 8,
                    animation: "qs-pulse 1.4s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, margin: 0 }}>
                No team members yet. Click <strong>Add User</strong> to invite someone.
              </p>
            </div>
          ) : (
            users.map((user) => {
              const rowSpan = Math.max(1, user.assignments.length);
              return (
                <div
                  key={user.userId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1.5fr 2fr 2fr 1fr 80px",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    minHeight: 56,
                    alignItems: "stretch",
                  }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{
                        width: 14,
                        height: 14,
                        accentColor: "#ffffff",
                        cursor: "pointer",
                      }}
                    />
                  </div>

                  {/* Name + crown */}
                  <div
                    style={{
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "10px 16px",
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <span>{user.name}</span>
                    {user.isAppAdmin && (
                      <Crown
                        size={13}
                        style={{ color: "#F59E0B", flexShrink: 0 }}
                        aria-label="App Admin"
                      />
                    )}
                  </div>

                  {/* Email */}
                  <div
                    style={{
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      padding: "10px 16px",
                      color: "rgba(255,255,255,0.85)",
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.email}
                  </div>

                  {/* Workspaces (one per row, vertically stacked) */}
                  <div
                    style={{
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {user.assignments.map((a, i) => (
                      <div
                        key={`${a.brandId}-${i}`}
                        style={{
                          flex: 1,
                          padding: "10px 16px",
                          color: "rgba(255,255,255,0.85)",
                          fontSize: 13,
                          borderTop: i > 0 ? "1px dashed rgba(255,255,255,0.06)" : "none",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {a.workspace}
                      </div>
                    ))}
                  </div>

                  {/* Role pill (one per row) */}
                  <div
                    style={{
                      borderRight: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {user.assignments.map((a, i) => (
                      <div
                        key={`role-${a.brandId}-${i}`}
                        style={{
                          flex: 1,
                          padding: "10px 16px",
                          borderTop: i > 0 ? "1px dashed rgba(255,255,255,0.06)" : "none",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {pendingRoleId === a.roleId ? (
                          <Loader2
                            size={14}
                            style={{
                              color: "rgba(255,255,255,0.55)",
                              animation: "qs-spin 1s linear infinite",
                            }}
                          />
                        ) : (
                          <RolePill role={a.role} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions kebab — one per assignment row */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {user.assignments.map((a, i) => {
                      const menuKey = `${user.userId}:${a.roleId}`;
                      const isOpen = openMenuKey === menuKey;
                      const isSelf = user.userId === callerId;
                      const isAppAdminRow = user.isAppAdmin && a.virtual;
                      // Synthetic (creator) rows can't be mutated.
                      // Self can't be removed.
                      const canChangeRole = !a.virtual && a.role !== "approver";
                      const canRemove = !a.virtual && !isSelf && !isAppAdminRow;

                      return (
                        <div
                          key={`act-${a.brandId}-${i}`}
                          style={{
                            flex: 1,
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderTop: i > 0 ? "1px dashed rgba(255,255,255,0.06)" : "none",
                            minHeight: 56 / rowSpan,
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {canChangeRole || canRemove ? (
                            <>
                              <button
                                type="button"
                                aria-label="Row actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuKey(isOpen ? null : menuKey);
                                }}
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: 8,
                                  border: "1px solid rgba(255,255,255,0.18)",
                                  background: "rgba(255,255,255,0.06)",
                                  color: "rgba(255,255,255,0.85)",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <MoreVertical size={14} />
                              </button>
                              {isOpen && (
                                <div
                                  role="menu"
                                  // Primary glass card tokens — design-tokens.md §1.
                                  style={{
                                    position: "absolute",
                                    top: 36,
                                    right: 6,
                                    zIndex: 30,
                                    minWidth: 200,
                                    padding: 6,
                                    borderRadius: 16,
                                    border: "1px solid rgba(255, 255, 255, 0.10)",
                                    background: "rgba(33, 33, 33, 0.14)",
                                    backdropFilter: "blur(24px)",
                                    WebkitBackdropFilter: "blur(24px)",
                                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                                  }}
                                >
                                  {canChangeRole && (
                                    <button
                                      type="button"
                                      onClick={() => handleChangeRole(a)}
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        gap: 8,
                                        padding: "8px 10px",
                                        borderRadius: 8,
                                        border: "none",
                                        background: "transparent",
                                        color: "rgba(255,255,255,0.85)",
                                        fontSize: 13,
                                        textAlign: "left",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <Shield size={13} />
                                      Make {a.role === "admin" ? "Member" : "Admin"}
                                    </button>
                                  )}
                                  {canRemove && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuKey(null);
                                        setRemoveError(null);
                                        setRemoveTarget({
                                          roleId: a.roleId,
                                          workspace: a.workspace,
                                          name: user.name,
                                        });
                                      }}
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        gap: 8,
                                        padding: "8px 10px",
                                        borderRadius: 8,
                                        border: "none",
                                        background: "transparent",
                                        color: "#F87171",
                                        fontSize: 13,
                                        textAlign: "left",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <Trash2 size={13} />
                                      Remove from Workspace
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.30)", fontSize: 12 }}>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showInvite && (
        <InviteFormModal
          brands={brands}
          onClose={() => {
            setShowInvite(false);
            refresh();
          }}
          onLink={(link) => setLatestLink(link)}
        />
      )}

      {latestLink && (
        <InviteLinkModal link={latestLink} onClose={() => setLatestLink(null)} />
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove from workspace"
          message={`Remove ${removeTarget.name} from ${removeTarget.workspace}? They will lose access immediately.`}
          confirmLabel="Remove"
          destructive
          loading={removeLoading}
          error={removeError}
          onCancel={() => {
            setRemoveTarget(null);
            setRemoveError(null);
          }}
          onConfirm={performRemove}
        />
      )}
    </>
  );
}
