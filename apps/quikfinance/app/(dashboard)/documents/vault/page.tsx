"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

const CATEGORIES = ["invoice", "bill", "contract", "bank_statement", "gst", "other"];

const CATEGORY_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  contract: "Contract",
  bank_statement: "Bank Statement",
  gst: "GST",
  other: "Other"
};

const CATEGORY_COLORS: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-700",
  bill: "bg-orange-100 text-orange-700",
  contract: "bg-purple-100 text-purple-700",
  bank_statement: "bg-green-100 text-green-700",
  gst: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-700"
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DocumentVaultPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: "", category: "other", file_url: "", file_size: "", mime_type: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["documents", category, search],
    queryFn: async () => {
      let url = "/api/v1/documents?";
      if (category) url += `&category=${category}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: typeof uploadForm) => {
      const res = await fetch("/api/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          file_size: payload.file_size ? Number(payload.file_size) : null
        })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setShowUpload(false);
      setUploadForm({ name: "", category: "other", file_url: "", file_size: "", mime_type: "" });
    }
  });

  const docs = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Document Vault"
        description="Store and organise business documents — invoices, contracts, bank statements, and GST filings."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Documents</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{meta.total ?? docs.length}</p></CardContent></Card>
        {CATEGORIES.slice(0, 3).map((cat) => (
          <Card key={cat}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{CATEGORY_LABELS[cat]}</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold">{docs.filter((d: Record<string, unknown>) => d.category === cat).length}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Category</Label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Search</Label>
          <Input placeholder="Document name…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        </div>
        <Button onClick={() => setShowUpload((v) => !v)} variant={showUpload ? "outline" : "default"} className="ml-auto">
          {showUpload ? "Cancel" : "Add Document"}
        </Button>
      </div>

      {showUpload && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Add Document</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Document Name</Label>
                <Input
                  placeholder="e.g. Invoice INV-001"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>File URL</Label>
                <Input
                  placeholder="https://… (upload via storage and paste URL)"
                  value={uploadForm.file_url}
                  onChange={(e) => setUploadForm({ ...uploadForm, file_url: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>File Size (bytes)</Label>
                <Input
                  type="number"
                  placeholder="Optional"
                  value={uploadForm.file_size}
                  onChange={(e) => setUploadForm({ ...uploadForm, file_size: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>MIME Type</Label>
                <Input
                  placeholder="e.g. application/pdf"
                  value={uploadForm.mime_type}
                  onChange={(e) => setUploadForm({ ...uploadForm, mime_type: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => uploadMutation.mutate(uploadForm)}
                disabled={uploadMutation.isPending || !uploadForm.name}
              >
                {uploadMutation.isPending ? "Saving…" : "Save Document"}
              </Button>
              <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Category</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Size</th>
              <th className="text-left px-4 py-3 font-medium">Uploaded</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && docs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No documents found. Add your first document above.</td></tr>
            )}
            {docs.map((doc: Record<string, unknown>) => {
              const fileUrl = doc.file_url ? String(doc.file_url) : null;
              return (
                <tr key={String(doc.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{String(doc.name)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${CATEGORY_COLORS[String(doc.category)] ?? "bg-muted text-muted-foreground"}`}>
                      {CATEGORY_LABELS[String(doc.category)] ?? String(doc.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{String(doc.mime_type ?? "—")}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{doc.file_size ? fmtSize(Number(doc.file_size)) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{doc.created_at ? fmtDate(String(doc.created_at)) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={doc.status === "active" ? "default" : "secondary"}>
                      {String(doc.status ?? "active")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {fileUrl && (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline">View</Button>
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
