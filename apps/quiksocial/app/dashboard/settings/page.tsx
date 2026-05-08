"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Settings,
  User,
  Building2,
  Users,
  Sparkles,
  Shield,
  CreditCard,
  Megaphone,
  Upload,
  X,
  ChevronDown,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  UserPlus,
  Mail,
  ExternalLink,
  BarChart3,
} from "lucide-react";
import { BACKGROUND_IMAGES, bgSrc, bgLabel, DEFAULT_BG } from "@/lib/constants/background-images";
import { SUPPORTED_TIMEZONES } from "@/lib/constants/timezones";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserProfile {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  backgroundImage?: string;
  timezone?: string;
  defaultPostTime?: string;
  authProvider?: string;
  aiPreferences?: AiPrefs;
  role?: string;
}

interface AiPrefs {
  defaultObjective?: string;
  alwaysIncludeLogo?: boolean;
  defaultCtaText?: string;
  preferredImageStyle?: string;
}

interface Brand {
  _id: string;
  name: string;
  websiteUrl?: string;
  defaultPostTime?: string;
  timezone?: string;
}

interface Member {
  _id: string;
  email: string;
  workspace: string;
  role: string;
  createdAt: string;
  userId: string;
}

interface UsageData {
  postsThisMonth: number;
  brandsCount: number;
  membersCount: number;
  limits: { posts: number; members: number; brands: number };
  plan: string;
  renewalDate?: string | null;
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  color: "#ffffff",
  fontSize: 13,
  padding: "10px 14px",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.65)",
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 6,
};

// Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
const cardStyle: React.CSSProperties = {
  background: "rgba(33, 33, 33, 0.14)",
  border: "1px solid rgba(255, 255, 255, 0.10)",
  borderRadius: 16,
  padding: 24,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
};

function SectionCard({
  title,
  description,
  children,
  danger,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        border: danger
          ? "1px solid rgba(239,68,68,0.35)"
          : "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ color: danger ? "#EF4444" : "#ffffff", fontSize: 15, fontWeight: 600, margin: 0 }}>
          {title}
        </h3>
        {description && (
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 4 }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function SaveBtn({
  onClick,
  loading,
  saved,
  label = "Save Changes",
}: {
  onClick: () => void;
  loading: boolean;
  saved: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        height: 40,
        padding: "0 24px",
        borderRadius: 10,
        border: "none",
        background: saved ? "#22C55E" : "#ffffff",
        color: "#0a0a0a",
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        transition: "background 0.2s",
      }}
    >
      {saved ? <><CheckCircle2 size={14} /> Saved</> : loading ? "Saving…" : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = "profile" | "workspace" | "team" | "ai" | "security" | "billing" | "whats-new";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <User size={14} /> },
  { id: "workspace", label: "Workspace", icon: <Building2 size={14} /> },
  { id: "team", label: "Team", icon: <Users size={14} /> },
  { id: "ai", label: "AI Preferences", icon: <Sparkles size={14} /> },
  { id: "security", label: "Security", icon: <Shield size={14} /> },
  { id: "billing", label: "Plans & Billing", icon: <CreditCard size={14} /> },
  { id: "whats-new", label: "What's New", icon: <Megaphone size={14} /> },
];

// ---------------------------------------------------------------------------
// Profile Tab
// ---------------------------------------------------------------------------

function ProfileTab({ user, onSaved }: { user: UserProfile; onSaved: (u: UserProfile) => void }) {
  const [name, setName] = useState(user.name ?? "");
  const [bg, setBg] = useState(user.backgroundImage ?? DEFAULT_BG);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError("Max file size is 5 MB"); return; }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setLoading(true);
    setError("");
    try {
      let avatarUrl = user.avatar ?? null;

      if (avatarFile) {
        const fd = new FormData();
        fd.append("file", avatarFile);
        const r = await fetch("/api/user/avatar", { method: "POST", body: fd, credentials: "include" });
        const d = unwrap(await r.json());
        if (!r.ok) { setError(d.error ?? "Avatar upload failed"); setLoading(false); return; }
        avatarUrl = d.url;
      }

      const r2 = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, backgroundImage: bg, avatar: avatarUrl }),
      });
      const d2 = unwrap(await r2.json());
      if (!r2.ok) { setError(d2.error ?? "Save failed"); return; }
      onSaved(d2.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Profile Picture */}
      <SectionCard title="Profile Picture" description="Upload a profile picture to personalize your account">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
                overflow: "hidden",
                border: "2px solid rgba(255,255,255,0.20)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <User size={28} color="rgba(255,255,255,0.35)" />
              )}
            </div>
            {avatarPreview && (
              <button
                type="button"
                onClick={() => { setAvatarPreview(null); setAvatarFile(null); }}
                style={{
                  position: "absolute", top: -4, right: -4,
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#EF4444", border: "2px solid #0a1a0a",
                  color: "#ffffff", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={10} />
              </button>
            )}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                height: 36, padding: "0 16px",
                borderRadius: 10, border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.08)", color: "#ffffff",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              <Upload size={14} /> Upload Photo
            </button>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 6 }}>
              JPG, PNG, GIF or WebP. Max size 5MB.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Profile Information */}
      <SectionCard title="Profile Information" description="Update your personal details">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={user.email}
              readOnly
              style={{ ...inputStyle, opacity: 0.55, cursor: "not-allowed" }}
            />
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 5 }}>
              Email cannot be changed. Contact support if needed.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Dashboard Background */}
      <SectionCard
        title="Dashboard Background"
        description={`Only the image name is saved. Default for new accounts: ${DEFAULT_BG}`}
      >
        <div
          style={{
            display: "flex", flexWrap: "wrap", gap: 10,
          }}
        >
          {BACKGROUND_IMAGES.map((img) => {
            const selected = bg === img;
            return (
              <button
                key={img}
                type="button"
                title={bgLabel(img)}
                onClick={() => setBg(img)}
                style={{
                  width: 52, height: 52, borderRadius: "50%",
                  padding: 0, border: selected
                    ? "3px solid #ffffff"
                    : "3px solid transparent",
                  outline: selected ? "2px solid rgba(255,255,255,0.45)" : "none",
                  outlineOffset: 2,
                  cursor: "pointer",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.10)",
                  flexShrink: 0,
                  transition: "border-color 0.15s",
                }}
              >
                <img
                  src={bgSrc(img)}
                  alt={bgLabel(img)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </button>
            );
          })}
        </div>
      </SectionCard>

      {error && <p style={{ color: "#EF4444", fontSize: 12 }}>{error}</p>}

      <div>
        <SaveBtn onClick={save} loading={loading} saved={saved} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace Tab
// ---------------------------------------------------------------------------

function WorkspaceTab({ brand, onBrandSaved }: { brand: Brand | null; onBrandSaved: (b: Brand) => void }) {
  const [name, setName] = useState(brand?.name ?? "");
  const [url, setUrl] = useState(brand?.websiteUrl ?? "");
  const [postTime, setPostTime] = useState(brand?.defaultPostTime ?? "09:00");
  const [timezone, setTimezone] = useState(brand?.timezone ?? "UTC");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const save = async () => {
    if (!brand) return;
    setSaving(true);
    setSaveErr("");
    try {
      const r = await fetch(`/api/brands/${brand._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, websiteUrl: url, defaultPostTime: postTime, timezone }),
      });
      const d = unwrap(await r.json());
      if (!r.ok) { setSaveErr(d.error ?? "Save failed"); return; }
      onBrandSaved(d.brand);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setSaveErr("Network error"); }
    finally { setSaving(false); }
  };

  const deleteBrand = async () => {
    if (!brand) return;
    setDeleting(true);
    setDeleteErr("");
    try {
      const r = await fetch(`/api/brands/${brand._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmName: deleteConfirm }),
      });
      const d = unwrap(await r.json());
      if (!r.ok) { setDeleteErr(d.error ?? "Delete failed"); return; }
      window.location.href = "/dashboard";
    } catch { setDeleteErr("Network error"); }
    finally { setDeleting(false); }
  };

  if (!brand) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.40)", fontSize: 14 }}>
        No workspace selected.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionCard title="Workspace Settings" description="Configure your brand workspace details">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Workspace Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Website URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Default Posting Time</label>
            <input type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)} style={inputStyle} />
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 5 }}>
              Used as the default time when scheduling posts in campaigns.
            </p>
          </div>
          <div>
            <label style={labelStyle}>Timezone</label>
            <div style={{ position: "relative" }}>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{ ...inputStyle, paddingRight: 36, appearance: "none" }}
              >
                {SUPPORTED_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value} style={{ background: "#1a2a1a" }}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
            </div>
          </div>
        </div>

        {saveErr && <p style={{ color: "#EF4444", fontSize: 12, marginTop: 10 }}>{saveErr}</p>}

        <div style={{ marginTop: 20 }}>
          <SaveBtn onClick={save} loading={saving} saved={saved} />
        </div>
      </SectionCard>

      {/* Danger Zone */}
      <SectionCard title="Danger Zone" description="Permanently delete this workspace and all its data." danger>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          This action is irreversible. All posts, campaigns, assets, and brand data will be deleted.
        </p>
        {showDeleteModal ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
              Type <strong style={{ color: "#EF4444" }}>{brand.name}</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={brand.name}
              style={{ ...inputStyle, borderColor: "rgba(239,68,68,0.35)" }}
            />
            {deleteErr && <p style={{ color: "#EF4444", fontSize: 12 }}>{deleteErr}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); setDeleteErr(""); }}
                style={{
                  height: 38, padding: "0 18px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.18)", background: "transparent",
                  color: "rgba(255,255,255,0.75)", fontSize: 13, cursor: "pointer",
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={deleteBrand}
                disabled={deleting || deleteConfirm !== brand.name}
                style={{
                  height: 38, padding: "0 18px", borderRadius: 10, border: "none",
                  background: "#EF4444", color: "#ffffff", fontSize: 13, fontWeight: 600,
                  cursor: (deleting || deleteConfirm !== brand.name) ? "not-allowed" : "pointer",
                  opacity: deleteConfirm !== brand.name ? 0.45 : 1,
                }}
              >{deleting ? "Deleting…" : "Delete Workspace"}</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            style={{
              height: 38, padding: "0 18px", borderRadius: 10,
              border: "1px solid rgba(239,68,68,0.45)", background: "transparent",
              color: "#EF4444", fontSize: 13, fontWeight: 500, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 7,
            }}
          >
            <AlertTriangle size={14} /> Delete Workspace
          </button>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Tab
// ---------------------------------------------------------------------------

function InviteModal({
  brands,
  activeBrandId,
  onClose,
  onInvited,
}: {
  brands: Brand[];
  activeBrandId: string | null;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [brandId, setBrandId] = useState(activeBrandId ?? brands[0]?._id ?? "");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim()) { setError("Email is required"); return; }
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), brandId, role }),
      });
      const d = unwrap(await r.json());
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      onInvited();
      onClose();
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.60)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(440px,94vw)", background: "rgba(33, 33, 33, 0.14)", border: "1px solid rgba(255, 255, 255, 0.10)", borderRadius: 16, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)", padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ color: "#ffffff", fontSize: 17, fontWeight: 600, margin: 0 }}>Invite Member</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" style={inputStyle} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div>
            <label style={labelStyle}>Workspace</label>
            <div style={{ position: "relative" }}>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={{ ...inputStyle, paddingRight: 36, appearance: "none" }}>
                {brands.map((b) => (
                  <option key={b._id} value={b._id} style={{ background: "#1a2a1a" }}>{b.name}</option>
                ))}
              </select>
              <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["member", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  style={{
                    flex: 1, height: 40, borderRadius: 10,
                    border: `1px solid ${role === r ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)"}`,
                    background: role === r ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                    color: role === r ? "#ffffff" : "rgba(255,255,255,0.55)",
                    fontSize: 13, fontWeight: role === r ? 600 : 400,
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >{r}</button>
              ))}
            </div>
          </div>
        </div>

        {error && <p style={{ color: "#EF4444", fontSize: 12, marginTop: 10 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={submit} disabled={loading} style={{ flex: 2, height: 40, borderRadius: 10, border: "none", background: "#ffffff", color: "#0a0a0a", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <UserPlus size={14} /> {loading ? "Sending…" : "Send Invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamTab({ brands, activeBrandId }: { brands: Brand[]; activeBrandId: string | null }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!activeBrandId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/invite?brandId=${activeBrandId}`, { credentials: "include" });
      const d = unwrap(await r.json());
      if (r.ok) setMembers(d.members ?? []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, [activeBrandId]);

  const changeRole = async (memberId: string, newRole: string) => {
    setChangingRole(memberId);
    try {
      const member = members.find((m) => m._id === memberId);
      if (!member || !activeBrandId) return;
      await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: member.email, brandId: activeBrandId, role: newRole }),
      });
      setMembers((prev) => prev.map((m) => (m._id === memberId ? { ...m, role: newRole } : m)));
    } catch {}
    finally { setChangingRole(null); }
  };

  const removeRole = async (memberId: string) => {
    // For now mark as pending removal — a full delete endpoint would be needed in production
    setRemovingId(memberId);
    await new Promise((r) => setTimeout(r, 600));
    setMembers((prev) => prev.filter((m) => m._id !== memberId));
    setRemovingId(null);
  };

  const rolePillStyle = (role: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center",
    padding: "3px 10px", borderRadius: 9999,
    fontSize: 11, fontWeight: 600,
    background: role === "admin" ? "rgba(59,130,246,0.18)" : "rgba(107,114,128,0.18)",
    color: role === "admin" ? "#3B82F6" : "#9CA3AF",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionCard title="Team Members" description="Manage who has access to this workspace">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              height: 36, padding: "0 16px",
              borderRadius: 10, border: "none",
              background: "#ffffff", color: "#0a0a0a",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <UserPlus size={14} /> Invite Member
          </button>
        </div>

        {loading ? (
          <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading…</p>
        ) : members.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            No team members yet. Invite someone to collaborate.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 12, padding: "10px 16px", background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Email", "Role", "Joined", ""].map((h, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
              ))}
            </div>

            {members.map((m, i) => (
              <div
                key={m._id}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr auto auto",
                  gap: 12, padding: "12px 16px", alignItems: "center",
                  borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                  background: removingId === m._id ? "rgba(239,68,68,0.06)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: "rgba(255,255,255,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.70)",
                      flexShrink: 0,
                    }}
                  >
                    {m.email[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.80)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</span>
                </div>

                <span style={rolePillStyle(m.role)}>{m.role}</span>

                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
                  {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>

                <div style={{ display: "flex", gap: 6, position: "relative" }}>
                  <div style={{ position: "relative" }}>
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m._id, e.target.value)}
                      disabled={changingRole === m._id}
                      style={{
                        height: 30, padding: "0 10px", borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.07)",
                        color: "#ffffff", fontSize: 12, cursor: "pointer",
                        appearance: "none",
                      }}
                    >
                      <option value="member" style={{ background: "#1a2a1a" }}>Member</option>
                      <option value="admin" style={{ background: "#1a2a1a" }}>Admin</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRole(m._id)}
                    disabled={removingId === m._id}
                    style={{
                      height: 30, width: 30, borderRadius: 8,
                      border: "1px solid rgba(239,68,68,0.30)",
                      background: "transparent", color: "#EF4444",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: removingId === m._id ? 0.5 : 1,
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {showInvite && (
        <InviteModal
          brands={brands}
          activeBrandId={activeBrandId}
          onClose={() => setShowInvite(false)}
          onInvited={fetchMembers}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Preferences Tab
// ---------------------------------------------------------------------------

const OBJECTIVES = ["Promotional", "Engagement", "Announcement", "Brand Awareness"];
const IMAGE_STYLES = ["Photorealistic", "Illustrated", "Minimal", "Typographic"];

function AiTab({ user, onSaved }: { user: UserProfile; onSaved: (u: UserProfile) => void }) {
  const prefs = user.aiPreferences ?? {};
  const [objective, setObjective] = useState<string>(prefs.defaultObjective ?? "Promotional");
  const [includeLogo, setIncludeLogo] = useState<boolean>(prefs.alwaysIncludeLogo ?? true);
  const [ctaText, setCtaText] = useState<string>(prefs.defaultCtaText ?? "");
  const [imageStyle, setImageStyle] = useState<string>(prefs.preferredImageStyle ?? "Photorealistic");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          aiPreferences: { defaultObjective: objective, alwaysIncludeLogo: includeLogo, defaultCtaText: ctaText, preferredImageStyle: imageStyle },
        }),
      });
      const d = unwrap(await r.json());
      if (!r.ok) { setError(d.error ?? "Save failed"); return; }
      onSaved(d.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  const PillGroup = ({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            style={{
              padding: "6px 14px", borderRadius: 9999,
              border: `1px solid ${active ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"}`,
              background: active ? "rgba(255,255,255,0.14)" : "transparent",
              color: active ? "#ffffff" : "rgba(255,255,255,0.55)",
              fontSize: 13, fontWeight: active ? 600 : 400,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >{o}</button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionCard title="AI Generation Preferences" description="These defaults apply to all new posts and campaigns">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={labelStyle}>Default Post Objective</label>
            <PillGroup options={OBJECTIVES} value={objective} onChange={setObjective} />
          </div>

          <div>
            <label style={labelStyle}>Preferred Image Style</label>
            <PillGroup options={IMAGE_STYLES} value={imageStyle} onChange={setImageStyle} />
          </div>

          <div>
            <label style={labelStyle}>Default CTA Text</label>
            <input
              type="text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="Shop Now"
              style={{ ...inputStyle, maxWidth: 280 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ color: "#ffffff", fontSize: 13, fontWeight: 500, margin: 0 }}>Always Include Logo</p>
              <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 12, marginTop: 3 }}>
                Logo will be composited on every generated image
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIncludeLogo(!includeLogo)}
              style={{
                width: 44, height: 24, borderRadius: 9999, border: "none",
                background: includeLogo ? "#22C55E" : "rgba(255,255,255,0.18)",
                cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%", background: "#ffffff",
                  position: "absolute", top: 3, transition: "left 0.2s",
                  left: includeLogo ? 22 : 3,
                }}
              />
            </button>
          </div>
        </div>

        {error && <p style={{ color: "#EF4444", fontSize: 12, marginTop: 12 }}>{error}</p>}

        <div style={{ marginTop: 20 }}>
          <SaveBtn onClick={save} loading={saving} saved={saved} label="Save Preferences" />
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security Tab
// ---------------------------------------------------------------------------

function SecurityTab({ user }: { user: UserProfile }) {
  const isCredentials = !user.authProvider || user.authProvider === "credentials";
  const [curr, setCurr] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurr, setShowCurr] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (next !== confirm) { setError("Passwords do not match"); return; }
    if (next.length < 8) { setError("New password must be at least 8 characters"); return; }
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: curr, newPassword: next }),
      });
      const d = unwrap(await r.json());
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      setCurr(""); setNext(""); setConfirm("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionCard title="Change Password" description="Update your account password">
        {isCredentials ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Current Password", value: curr, onChange: setCurr, show: showCurr, toggle: () => setShowCurr(!showCurr) },
              { label: "New Password", value: next, onChange: setNext, show: showNext, toggle: () => setShowNext(!showNext) },
              { label: "Confirm New Password", value: confirm, onChange: setConfirm, show: showNext, toggle: () => setShowNext(!showNext) },
            ].map(({ label, value, onChange, show, toggle }) => (
              <div key={label}>
                <label style={labelStyle}>{label}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 40 }}
                  />
                  <button type="button" onClick={toggle} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.40)", cursor: "pointer" }}>
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            ))}

            {error && <p style={{ color: "#EF4444", fontSize: 12 }}>{error}</p>}

            <div style={{ marginTop: 4 }}>
              <SaveBtn onClick={save} loading={saving} saved={saved} label="Update Password" />
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "16px 18px", borderRadius: 12,
              background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.25)",
            }}
          >
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.6 }}>
              You signed in with <strong style={{ color: "#3B82F6" }}>{user.authProvider === "google" ? "Google" : "Microsoft"}</strong> — no password to change.
              Manage your password through your {user.authProvider === "google" ? "Google" : "Microsoft"} account settings.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Active Sessions" description="Devices currently signed into your account">
        <div
          style={{
            padding: "16px 18px", borderRadius: 12,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div>
            <p style={{ color: "#ffffff", fontSize: 13, fontWeight: 500, margin: 0 }}>Current Session</p>
            <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 12, marginTop: 3 }}>Active now</p>
          </div>
          <span style={{ padding: "3px 10px", borderRadius: 9999, background: "rgba(34,197,94,0.15)", color: "#22C55E", fontSize: 11, fontWeight: 600 }}>
            Active
          </span>
        </div>
        <p style={{ color: "rgba(255,255,255,0.30)", fontSize: 12, marginTop: 10 }}>
          Session tracking will show all active devices in a future update.
        </p>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing Tab
// ---------------------------------------------------------------------------

function BillingTab() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/usage", { credentials: "include" })
      .then((r) => r.json()).then(unwrap)
      .then((d) => setUsage(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function ProgressBar({ value, max }: { value: number; max: number }) {
    const pct = Math.min(100, Math.round((value / max) * 100));
    const color = pct >= 90 ? "#EF4444" : pct >= 70 ? "#F59E0B" : "#22C55E";
    return (
      <div style={{ height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.10)", marginTop: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 9999, transition: "width 0.4s" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionCard title="Current Plan" description="Your subscription details">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", margin: 0 }}>
              {loading ? "…" : (usage?.plan ?? "Free")}
            </p>
            <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 13, marginTop: 4 }}>
              {usage?.renewalDate ? `Renews ${usage.renewalDate}` : "No billing cycle"}
            </p>
          </div>
          <a
            href="/pricing"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 38, padding: "0 18px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)", background: "transparent",
              color: "#ffffff", fontSize: 13, fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <ExternalLink size={14} /> Upgrade Plan
          </a>
        </div>
      </SectionCard>

      <SectionCard title="Usage" description="Your usage this month">
        {loading ? (
          <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 13 }}>Loading…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            {[
              { label: "Posts This Month", value: usage?.postsThisMonth ?? 0, max: usage?.limits.posts ?? 100, icon: <BarChart3 size={16} /> },
              { label: "Team Members", value: usage?.membersCount ?? 0, max: usage?.limits.members ?? 5, icon: <Users size={16} /> },
              { label: "Brands", value: usage?.brandsCount ?? 0, max: usage?.limits.brands ?? 3, icon: <Building2 size={16} /> },
            ].map(({ label, value, max, icon }) => (
              <div
                key={label}
                style={{
                  padding: "16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>{icon}</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{label}</span>
                </div>
                <p style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", margin: 0 }}>
                  {value} <span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.35)" }}>/ {max}</span>
                </p>
                <ProgressBar value={value} max={max} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What's New Tab
// ---------------------------------------------------------------------------

function WhatsNewTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionCard title="What's New" description="Latest updates to QuikSocial">
        <div
          style={{
            textAlign: "center", padding: "48px 24px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Megaphone size={24} color="rgba(255,255,255,0.40)" />
          </div>
          <p style={{ color: "#ffffff", fontSize: 15, fontWeight: 500, margin: 0 }}>Updates coming soon</p>
          <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 13, maxWidth: 320, lineHeight: 1.6 }}>
            Release notes and feature announcements will appear here. Check back after the next deployment.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data: session } = useSession();
  const sessionBrandId = (session?.user as any)?.activeBrandId as string | null;

  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrand, setActiveBrand] = useState<Brand | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/user/profile", { credentials: "include" }).then((r) => r.json()).then(unwrap),
      fetch("/api/brands", { credentials: "include" }).then((r) => r.json()).then(unwrap),
    ])
      .then(([userRes, brandsRes]) => {
        if (userRes.user) setUser(userRes.user);
        const list: Brand[] = brandsRes.brands ?? [];
        setBrands(list);
        const active = list.find((b) => b._id === sessionBrandId) ?? list[0] ?? null;
        setActiveBrand(active);
      })
      .catch(() => {})
      .finally(() => setLoadingUser(false));
  }, [sessionBrandId]);

  const handleBrandSaved = (updated: Brand) => {
    setBrands((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
    if (activeBrand?._id === updated._id) setActiveBrand(updated);
  };

  if (loadingUser) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <RefreshCw size={20} color="rgba(255,255,255,0.35)" style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ textAlign: "center", padding: "64px 0", color: "rgba(255,255,255,0.40)" }}>
        Failed to load settings.
      </div>
    );
  }

  return (
    /* Outer page wrapper — no padding/margin/max-width. The
       dashboard layout shell owns all outer spacing. */
    <div>
      {/* Header */}
      <div
        // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16, padding: "20px 24px",
          display: "flex", alignItems: "center", gap: 14,
          marginBottom: 24,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
      >
        <Settings size={20} color="rgba(255,255,255,0.70)" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#ffffff", margin: 0 }}>Settings</h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 2 }}>
            Manage your account and integrations
          </p>
        </div>
      </div>

      {/* Tab strip */}
      <div
        style={{
          display: "flex", gap: 4, flexWrap: "wrap",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14, padding: 6,
          marginBottom: 28,
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 10, border: "none",
                background: active ? "#ffffff" : "transparent",
                color: active ? "#0a0a0a" : "rgba(255,255,255,0.55)",
                fontSize: 13, fontWeight: active ? 600 : 400,
                cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "profile" && (
        <ProfileTab user={user} onSaved={setUser} />
      )}
      {activeTab === "workspace" && (
        <WorkspaceTab brand={activeBrand} onBrandSaved={handleBrandSaved} />
      )}
      {activeTab === "team" && (
        <TeamTab brands={brands} activeBrandId={activeBrand?._id ?? null} />
      )}
      {activeTab === "ai" && (
        <AiTab user={user} onSaved={setUser} />
      )}
      {activeTab === "security" && (
        <SecurityTab user={user} />
      )}
      {activeTab === "billing" && (
        <BillingTab />
      )}
      {activeTab === "whats-new" && (
        <WhatsNewTab />
      )}
    </div>
  );
}
