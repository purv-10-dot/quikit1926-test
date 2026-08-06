"use client";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { getConnectors } from "@/lib/api/connectors";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Connector } from "@/types";

interface TeamUser {
  id: string;
  email: string;
  name: string | null;
  roles: { role: string; teamName: string | null }[];
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user;

  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [team, setTeam] = useState<TeamUser[] | null>(null);
  const [teamRestricted, setTeamRestricted] = useState(false);

  useEffect(() => {
    getConnectors().then(setConnectors).catch(() => setConnectors([]));
  }, []);

  useEffect(() => {
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) { setTeamRestricted(true); setTeam([]); return; }
        if (!r.ok) { setTeam([]); return; }
        const d = await r.json();
        setTeam(d.users ?? []);
      })
      .catch(() => setTeam([]));
  }, []);

  const connected = (connectors ?? []).filter((c) => c.connected);
  const roleLabel = user?.role ?? "MEMBER";

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Settings</div><p className="page-sub">Account, connected sources, and team</p></div>
      </div>

      {/* Account */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Account</h3>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 10, fontSize: 13.5 }}>
          <span style={{ color: "var(--text-secondary)" }}>Name</span><span>{user?.name || "—"}</span>
          <span style={{ color: "var(--text-secondary)" }}>Email</span><span>{user?.email || "—"}</span>
          <span style={{ color: "var(--text-secondary)" }}>Role</span><span>{roleLabel}</span>
          {user?.teamName && (<><span style={{ color: "var(--text-secondary)" }}>Team</span><span>{user.teamName}</span></>)}
        </div>
        <button className="btn btn-sm" style={{ marginTop: 16 }} onClick={() => signOut({ callbackUrl: "/login" })} type="button">
          Sign out
        </button>
      </div>

      {/* Connected sources */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Connected sources</h3>
          <Link href="/integrations" className="btn btn-sm">Manage in Integrations →</Link>
        </div>
        {connectors === null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={40} r={10} />)}
          </div>
        ) : connected.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
            No sources connected yet. <Link href="/integrations" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Connect a platform</Link> to start syncing real data.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {connected.map((c) => (
              <div className="integration-row" key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="connector-icon" style={{ background: c.color, width: 26, height: 26, fontSize: 11 }}>{c.initials}</span>
                <span>{c.name}</span>
                <span className="dot-status" style={{ color: "var(--green)", marginLeft: "auto", fontSize: 12.5 }}>
                  ● {c.lastSyncedAt ? `Synced ${new Date(c.lastSyncedAt).toLocaleDateString()}` : "Connected"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team members */}
      <div className="card">
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Team members</h3>
        {team === null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={34} r={8} />)}
          </div>
        ) : teamRestricted ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
            Only admins can view and manage team members. You&apos;re signed in as <strong>{user?.email}</strong> ({roleLabel}).
          </p>
        ) : team.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>No team members yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                {team.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name || "—"}</td>
                    <td>{u.email}</td>
                    <td>{u.roles[0]?.role ?? "MEMBER"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
