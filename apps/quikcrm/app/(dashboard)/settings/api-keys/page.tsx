"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Ban, RotateCcw, Copy, Check, KeyRound } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function ApiKeysPage() {
  const toast = useToast();
  const [items, setItems] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // The raw secret to reveal once, immediately after creation.
  const [revealed, setRevealed] = useState<{ name: string; rawKey: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/api-keys", { credentials: "include" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setActive(k: ApiKey, activate: boolean) {
    const verb = activate ? "Reactivate" : "Revoke";
    if (!confirm(`${verb} the API key "${k.name}"?`)) return;
    const res = await fetch(`/api/settings/api-keys/${k.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: activate ? "activate" : "revoke" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || `${verb} failed`);
    } else {
      toast.success(`API key ${activate ? "reactivated" : "revoked"}`);
      refresh();
    }
  }

  async function remove(k: ApiKey) {
    if (!confirm(`Delete the API key "${k.name}"? This cannot be undone and will immediately break any integration using it.`)) return;
    const res = await fetch(`/api/settings/api-keys/${k.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Delete failed");
    } else {
      toast.success("API key deleted");
      refresh();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">API Keys</h1>
          <p className="text-sm text-crm-muted">
            Secret keys for third-party dashboard integrations against the public API.
            Treat them like passwords — the full key is shown only once.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} /> New API key
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-crm-muted">Loading…</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Key</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH>Last used</TH>
                  <TH>Created by</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-crm-muted">
                      No API keys yet. Create one to connect a third-party dashboard.
                    </TD>
                  </TR>
                ) : (
                  items.map((k) => (
                    <TR key={k.id}>
                      <TD className="font-medium">{k.name}</TD>
                      <TD className="font-mono text-xs text-crm-muted">
                        {k.prefix}…{k.lastFour}
                      </TD>
                      <TD>
                        {k.status === "active" ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            Revoked
                          </span>
                        )}
                      </TD>
                      <TD className="text-sm text-crm-muted">{fmtDate(k.createdAt)}</TD>
                      <TD className="text-sm text-crm-muted">{fmtDate(k.lastUsedAt)}</TD>
                      <TD className="text-sm text-crm-muted">{k.createdByName ?? "—"}</TD>
                      <TD className="text-right whitespace-nowrap">
                        {k.status === "active" ? (
                          <button
                            onClick={() => setActive(k, false)}
                            className="mr-1 rounded p-1.5 text-crm-muted hover:bg-amber-50 hover:text-amber-700"
                            aria-label="Revoke"
                            title="Revoke"
                          >
                            <Ban size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setActive(k, true)}
                            className="mr-1 rounded p-1.5 text-crm-muted hover:bg-green-50 hover:text-green-700"
                            aria-label="Reactivate"
                            title="Reactivate"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => remove(k)}
                          className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <CreateApiKeyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name, rawKey) => {
          setCreating(false);
          setRevealed({ name, rawKey });
          refresh();
        }}
      />

      <RevealKeyModal reveal={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

function CreateApiKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string, rawKey: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  async function create() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Create failed");
      onCreated(j.apiKey?.name ?? name.trim(), j.rawKey);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New API key">
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Name *</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marketing dashboard"
            autoFocus
          />
          <span className="mt-1 block text-xs text-crm-muted">
            A label to help you recognise this key later. The secret is generated for you.
          </span>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={create} disabled={saving}>
          {saving ? "Generating…" : "Generate key"}
        </Button>
      </div>
    </Modal>
  );
}

function RevealKeyModal({
  reveal,
  onClose,
}: {
  reveal: { name: string; rawKey: string } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (reveal) setCopied(false);
  }, [reveal]);

  async function copy() {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.rawKey);
      setCopied(true);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  }

  return (
    <Modal open={!!reveal} onClose={onClose} title="Copy your API key">
      {reveal && (
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
            <KeyRound size={16} className="mt-0.5 shrink-0" />
            <p>
              This is the only time the full key for <strong>{reveal.name}</strong> will be
              shown. Copy it now and store it securely — you won&apos;t be able to see it again.
            </p>
          </div>

          <div>
            <span className="mb-1 block font-medium">Secret key</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-crm-border bg-crm-panel px-3 py-2 font-mono text-xs">
                {reveal.rawKey}
              </code>
              <Button variant="secondary" onClick={copy} aria-label="Copy key">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <p className="text-xs text-crm-muted">
            Send it as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code> or{" "}
            <code className="font-mono">X-Api-Key: &lt;key&gt;</code> to the public API.
          </p>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
