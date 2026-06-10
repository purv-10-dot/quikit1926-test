"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Template {
  id: string;
  key: string;
  name: string;
  description: string | null;
  layout: string;
  themeColor: string;
  termsDefault: string | null;
  watermarkText: string | null;
  isDefault: boolean;
}

export function QuoteTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/quote-templates");
    const json = await res.json();
    if (json.success) setTemplates(json.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (t: Template) => {
    setSaving(t.id);
    const res = await fetch("/api/settings/quote-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: t.id,
        themeColor: t.themeColor,
        termsDefault: t.termsDefault,
        watermarkText: t.watermarkText,
        isDefault: t.isDefault,
      }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    setSaving(null);
    void load();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-crm-muted">
        Quote templates control branding, terms, watermarks, and bank details on PDFs and the
        customer portal.
      </p>
      {templates.map((t) => (
        <div key={t.id} className="rounded-lg border border-crm-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-crm-text">{t.name}</h3>
              <p className="text-xs text-crm-muted">{t.description ?? t.layout}</p>
            </div>
            {t.isDefault && (
              <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-700">
                Default
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              Theme color
              <Input
                value={t.themeColor}
                onChange={(e) =>
                  setTemplates((prev) =>
                    prev.map((x) => (x.id === t.id ? { ...x, themeColor: e.target.value } : x)),
                  )
                }
              />
            </label>
            <label className="block text-xs">
              Watermark
              <Input
                value={t.watermarkText ?? ""}
                onChange={(e) =>
                  setTemplates((prev) =>
                    prev.map((x) =>
                      x.id === t.id ? { ...x, watermarkText: e.target.value || null } : x,
                    ),
                  )
                }
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              Default terms
              <textarea
                className="crm-input mt-1 min-h-[80px] w-full"
                value={t.termsDefault ?? ""}
                onChange={(e) =>
                  setTemplates((prev) =>
                    prev.map((x) =>
                      x.id === t.id ? { ...x, termsDefault: e.target.value || null } : x,
                    ),
                  )
                }
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={saving === t.id} onClick={() => void save(t)}>
              Save
            </Button>
            {!t.isDefault && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void save({ ...t, isDefault: true })
                }
              >
                Set as default
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
