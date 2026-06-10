"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Kind = "Category" | "Subcategory" | "Brand" | "Family";

interface TaxonomyRow {
  id: string;
  kind: Kind;
  name: string;
  parentId: string | null;
}

export function ProductCategoriesPageClient() {
  const toast = useToast();
  const [items, setItems] = useState<TaxonomyRow[]>([]);
  const [kind, setKind] = useState<Kind>("Category");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [categories, setCategories] = useState<TaxonomyRow[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/products/taxonomy", { credentials: "include" });
    const json = await res.json();
    const rows: TaxonomyRow[] = json?.data ?? [];
    setItems(rows);
    setCategories(rows.filter((r) => r.kind === "Category"));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const res = await fetch("/api/products/taxonomy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          parentId: kind === "Subcategory" ? parentId || null : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Create failed");
      toast.success("Created");
      setName("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-crm-text">Product taxonomy</h1>
        <p className="text-sm text-crm-muted">
          Category → Subcategory hierarchy, plus Brand and Product family labels.
        </p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="Category">Category</option>
              <option value="Subcategory">Subcategory</option>
              <option value="Brand">Brand</option>
              <option value="Family">Family</option>
            </Select>
            {kind === "Subcategory" && (
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Parent category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <Button onClick={create}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0 divide-y divide-crm-border">
          {items.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-crm-muted">No taxonomy nodes yet.</p>
          ) : (
            items.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-crm-muted">{row.kind}</span> — {row.name}
                </span>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
