"use client";
import { useEffect, useState } from "react";
import { getConnectorOptions, saveConnectorSelection, type SelectorGroup } from "@/lib/api/connectors";
import { useToastStore } from "@/store/useToastStore";
import type { Connector } from "@/types";

// Lets the user pick which property / site / page / account a connected platform
// should fetch from (for accounts that have several).
export default function ConfigureModal({ connector, onClose }: { connector: Connector; onClose: () => void }) {
  const showToast = useToastStore((s) => s.show);
  const [groups, setGroups] = useState<SelectorGroup[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    getConnectorOptions(connector.id).then(setGroups).catch(() => setGroups([]));
  }, [connector.id]);

  async function onSelect(group: SelectorGroup, value: string) {
    setSaving(group.prismaPlatform);
    try {
      await saveConnectorSelection(connector.id, group, value);
      setGroups((prev) => prev?.map((g) => (g.prismaPlatform === group.prismaPlatform ? { ...g, selectedId: value } : g)) ?? prev);
      showToast(`${group.label} updated — the dashboard will refresh with the new source`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't save selection");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: 16 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "100%", maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span className="connector-icon" style={{ background: connector.color, width: 28, height: 28, fontSize: 12 }}>{connector.initials}</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Configure {connector.name}</h3>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-secondary)" }}>
          Choose which account, property, or page to fetch data from.
        </p>

        {groups === null ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading options…</p>
        ) : groups.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
            No selectable accounts found for this connector yet. Reconnect if you recently added access.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {groups.map((g) => (
              <label key={g.prismaPlatform} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>{g.label}</span>
                <select
                  className="range-select"
                  value={g.selectedId}
                  disabled={saving === g.prismaPlatform}
                  onChange={(e) => onSelect(g, e.target.value)}
                >
                  {!g.selectedId && <option value="">Select…</option>}
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.name || o.id}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <button className="btn btn-primary" onClick={onClose} type="button">Done</button>
        </div>
      </div>
    </div>
  );
}
