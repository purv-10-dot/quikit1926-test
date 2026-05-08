"use client";

export const dynamic = "force-dynamic";

/**
 * Manage Brands — grid of all brands the current user owns.
 *
 * Reached from the workspace switcher dropdown's "Manage Brands" link.
 * Each card shows brand identity (logo + name + industry) plus three
 * lightweight stats (linked accounts, total posts, created on) and three
 * actions:
 *   - Open    → set this brand as the active workspace, then route to
 *               /dashboard. The active-brand write goes through
 *               PATCH /api/user/profile { activeBrandId } (the canonical
 *               write path; NextAuth's session callback re-reads the
 *               row, so every brand-scoped page sees the new active
 *               brand on the next session refresh).
 *   - Edit    → opens the brand wizard at
 *               /dashboard/brands/create?brandId=…&mode=edit
 *               That wizard's PATCH path writes to /api/brands/[id],
 *               which is the same endpoint that AI generation reads
 *               from on every run — so any edit here flows into post,
 *               campaign, and image generation automatically.
 *   - Delete  → DELETE /api/brands/[id]
 */

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react";

interface Brand {
  _id: string;
  name: string;
  industry?: string | null;
  logoUrl?: string | null;
  createdAt?: string;
}

interface BrandStats {
  linkedAccounts: number;
  totalPosts: number;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatCreatedOn(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const yy = d.getFullYear() % 100;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${yy}`;
}

export default function ManageBrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stats, setStats] = useState<Record<string, BrandStats>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brands", { credentials: "include" });
      if (!res.ok) {
        setBrands([]);
        return;
      }
      const data = unwrap(await res.json());
      const list: Brand[] = data.brands ?? [];
      setBrands(list);

      // Best-effort fetch of accounts + post counts per brand. These two
      // endpoints already exist; failures fall back to 0 so the cards
      // still render.
      const statEntries = await Promise.all(
        list.map(async (b) => {
          const [accountsRes, postsRes] = await Promise.allSettled([
            fetch(`/api/integrations/accounts?brandId=${b._id}`, {
              credentials: "include",
            }),
            fetch(`/api/posts?brandId=${b._id}&page=1`, {
              credentials: "include",
            }),
          ]);
          let linkedAccounts = 0;
          let totalPosts = 0;
          if (accountsRes.status === "fulfilled" && accountsRes.value.ok) {
            const a = unwrap(await accountsRes.value.json().catch(() => ({})));
            const arr = Array.isArray(a) ? a : a.accounts ?? [];
            linkedAccounts = arr.filter((x: any) => x.isActive).length;
          }
          if (postsRes.status === "fulfilled" && postsRes.value.ok) {
            const p = unwrap(await postsRes.value.json().catch(() => ({})));
            totalPosts = p.pagination?.total ?? p.posts?.length ?? 0;
          }
          return [b._id, { linkedAccounts, totalPosts }] as const;
        }),
      );
      setStats(Object.fromEntries(statEntries));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const handleOpen = useCallback(
    async (brandId: string) => {
      setBusyId(brandId);
      try {
        await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ activeBrandId: brandId }),
        });
        window.localStorage.setItem("workspace-updated", Date.now().toString());
        window.dispatchEvent(new CustomEvent("workspace-updated"));
        router.push("/dashboard");
      } finally {
        setBusyId(null);
      }
    },
    [router],
  );

  const handleEdit = useCallback(
    (brandId: string) => {
      router.push(`/dashboard/brands/create?brandId=${brandId}&mode=edit`);
    },
    [router],
  );

  const handleDelete = useCallback(
    async (brand: Brand) => {
      setBusyId(brand._id);
      try {
        // The DELETE endpoint requires the brand name as a confirmation
        // (see /api/brands/[id]/route.ts). The second click on the trash
        // icon supplies it implicitly here — the user already confirmed
        // by clicking once to enter the "armed" state.
        const res = await fetch(`/api/brands/${brand._id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ confirmName: brand.name }),
        });
        if (res.ok) {
          setBrands((prev) => prev.filter((b) => b._id !== brand._id));
          window.localStorage.setItem("workspace-updated", Date.now().toString());
          window.dispatchEvent(new CustomEvent("workspace-updated"));
        }
      } finally {
        setBusyId(null);
        setConfirmDeleteId(null);
      }
    },
    [],
  );

  return (
    /* Outer page wrapper — no padding/margin/max-width. The dashboard
       layout shell owns all outer spacing. */
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 500, marginBottom: 4 }}>
            Workspaces
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>
            Manage your brands and clients
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/brands/create")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            height: 40,
            padding: "0 18px",
            borderRadius: 9999,
            border: "1px solid rgba(255, 255, 255, 0.22)",
            background: "rgba(255, 255, 255, 0.10)",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Plus size={15} />
          New Workspace
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: 18,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              // Glass-styled placeholder matching the real BrandCard tint
              // so the wallpaper shows through and there's no layout
              // shift on content arrival. qs-pulse keyframe lives in
              // apps/web/src/app/globals.css.
              style={{
                height: 220,
                borderRadius: 16,
                background: "rgba(33, 33, 33, 0.14)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                animation: "qs-pulse 1.4s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : brands.length === 0 ? (
        <div
          // Empty state — primary glass card.
          style={{
            background: "rgba(33, 33, 33, 0.14)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            borderRadius: 16,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            padding: "64px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#fff", fontSize: 16, fontWeight: 500, marginBottom: 6 }}>
            No brands yet
          </p>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 18 }}>
            Create your first brand to get started.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/brands/create")}
            style={{
              height: 40,
              padding: "0 22px",
              borderRadius: 10,
              border: "none",
              background: "#ffffff",
              color: "#0a0a0a",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create your first brand
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: 18,
          }}
        >
          {brands.map((b) => {
            const s = stats[b._id] ?? { linkedAccounts: 0, totalPosts: 0 };
            const isBusy = busyId === b._id;
            return (
              <div
                key={b._id}
                // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
                style={{
                  background: "rgba(33, 33, 33, 0.14)",
                  border: "1px solid rgba(255, 255, 255, 0.10)",
                  borderRadius: 16,
                  padding: 18,
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {/* Identity */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {b.logoUrl ? (
                    <img
                      src={b.logoUrl}
                      alt=""
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        objectFit: "contain",
                        background: "rgba(255, 255, 255, 0.10)",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        fontWeight: 600,
                        fontSize: 16,
                        flexShrink: 0,
                        background: `hsl(${
                          (b.name.charCodeAt(0) * 137.5) % 360
                        }, 50%, 40%)`,
                      }}
                    >
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        color: "#ffffff",
                        fontSize: 16,
                        fontWeight: 600,
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.name}
                    </p>
                    <p
                      style={{
                        color: "rgba(255, 255, 255, 0.65)",
                        fontSize: 12,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.industry ?? "Brand Workspace"}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10,
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 12,
                    padding: "12px 14px",
                  }}
                >
                  <Stat label="Linked Accounts" value={String(s.linkedAccounts)} />
                  <Stat label="Total Post" value={String(s.totalPosts)} />
                  <Stat label="Created On" value={formatCreatedOn(b.createdAt)} small />
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleOpen(b._id)}
                    style={{
                      flex: 1,
                      height: 38,
                      borderRadius: 10,
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      background: "rgba(255, 255, 255, 0.08)",
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: isBusy ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      opacity: isBusy ? 0.6 : 1,
                    }}
                  >
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(b._id)}
                    aria-label={`Edit ${b.name}`}
                    style={iconButtonStyle}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      confirmDeleteId === b._id
                        ? handleDelete(b)
                        : setConfirmDeleteId(b._id)
                    }
                    aria-label={`Delete ${b.name}`}
                    style={{
                      ...iconButtonStyle,
                      color: confirmDeleteId === b._id ? "#fff" : "rgba(255, 255, 255, 0.85)",
                      background:
                        confirmDeleteId === b._id
                          ? "rgba(239, 68, 68, 0.30)"
                          : "rgba(255, 255, 255, 0.08)",
                      borderColor:
                        confirmDeleteId === b._id
                          ? "rgba(239, 68, 68, 0.50)"
                          : "rgba(255, 255, 255, 0.14)",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span
        style={{
          color: "rgba(255, 255, 255, 0.55)",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "#ffffff",
          fontSize: small ? 13 : 16,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "rgba(255, 255, 255, 0.08)",
  color: "rgba(255, 255, 255, 0.85)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
