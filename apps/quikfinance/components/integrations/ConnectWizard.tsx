"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";

type Provider = { key: string; name: string; authType: string };

const ZOHO_REGIONS = [
  { value: "com", label: "United States (.com)" },
  { value: "in", label: "India (.in)" },
  { value: "eu", label: "Europe (.eu)" },
  { value: "au", label: "Australia (.com.au)" },
  { value: "jp", label: "Japan (.jp)" },
  { value: "ca", label: "Canada (.ca)" },
  { value: "sa", label: "Saudi Arabia (.sa)" }
];

export function ConnectWizard({ provider, onClose, onCreated }: { provider: Provider; onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const isZoho = provider.key === "zoho_books";
  const [name, setName] = useState(provider.name);
  const [region, setRegion] = useState("in");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  // Tally
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("9000");
  const [company, setCompany] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (isZoho && (!clientId.trim() || !clientSecret.trim())) {
      toast.error("Client ID and Client Secret are required.");
      return;
    }
    setBusy(true);
    try {
      const payload = isZoho
        ? { providerKey: provider.key, name: name.trim(), region, credentials: { client_id: clientId.trim(), client_secret: clientSecret.trim() } }
        : { providerKey: provider.key, name: name.trim(), config: { host: host.trim(), port: Number(port) || 9000, company: company.trim(), ssl, autoReconnect }, credentials: { username: username.trim(), password } };

      const res = await fetch("/api/v1/integrations/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error?.message ?? "Could not connect.");
        return;
      }
      const data = body.data as { authorizationUrl?: string; connection: { id: string }; status: string; message: string };
      if (data.authorizationUrl) {
        toast.success("Redirecting to authorize…");
        window.location.href = data.authorizationUrl;
        return;
      }
      if (data.status === "error") {
        toast.warning(data.message);
      } else {
        toast.success(`${provider.name} connected.`);
      }
      onCreated();
      router.push(`/settings/integrations/${data.connection.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-up" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border bg-card shadow-popover" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Connect {provider.name}</h2>
            <p className="text-xs text-muted-foreground">{isZoho ? "OAuth 2.0 — you'll authorize in Zoho." : "Local / LAN — Tally must be running with HTTP server enabled."}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <Label>Connection name</Label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {isZoho ? (
            <>
              <div>
                <Label>Region / Data centre</Label>
                <div className="mt-1"><Combobox value={region} onChange={setRegion} options={ZOHO_REGIONS} /></div>
              </div>
              <div>
                <Label className="text-destructive">Client ID*</Label>
                <Input className="mt-1" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1000.XXXXXXXX" />
              </div>
              <div>
                <Label className="text-destructive">Client Secret*</Label>
                <Input className="mt-1" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="••••••••" />
              </div>
              <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                Create a Server-based application in the Zoho API Console and add this redirect URI:
                <code className="mt-1 block break-all font-mono text-[11px]">{typeof window !== "undefined" ? `${window.location.origin}/api/v1/integrations/oauth/zoho/callback` : "/api/v1/integrations/oauth/zoho/callback"}</code>
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Host</Label><Input className="mt-1" value={host} onChange={(e) => setHost(e.target.value)} /></div>
                <div><Label>Port</Label><Input className="mt-1" value={port} onChange={(e) => setPort(e.target.value)} /></div>
              </div>
              <div><Label>Company</Label><Input className="mt-1" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Tally company name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Username (optional)</Label><Input className="mt-1" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
                <div><Label>Password (optional)</Label><Input className="mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />Use SSL</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} />Auto-reconnect</label>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : isZoho ? <ExternalLink className="mr-1 h-4 w-4" /> : null}
            {isZoho ? "Authorize in Zoho" : "Test & Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
