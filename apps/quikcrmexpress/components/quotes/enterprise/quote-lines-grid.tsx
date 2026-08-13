"use client";

import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface GridQuoteLine {
  id: string;
  lineNumber: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  gstRate: number;
  lineTotal: number;
}

interface QuoteLinesGridProps {
  quoteId: string;
  lines: GridQuoteLine[];
  canEdit: boolean;
  onRefresh: () => void;
  onAddProduct: () => void;
}

export function QuoteLinesGrid({
  quoteId,
  lines,
  canEdit,
  onRefresh,
  onAddProduct,
}: QuoteLinesGridProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<GridQuoteLine>>>({});

  const getVal = (line: GridQuoteLine, field: keyof GridQuoteLine): number => {
    const d = drafts[line.id];
    if (d && field in d && d[field] !== undefined) return Number(d[field]);
    return Number(line[field]);
  };

  const setDraft = (id: string, patch: Partial<GridQuoteLine>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const saveLine = useCallback(
    async (line: GridQuoteLine) => {
      const patch = drafts[line.id];
      if (!patch) return;
      setSavingId(line.id);
      try {
        const res = await fetch(`/api/quotes/${quoteId}/lines/${line.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: getVal(line, "quantity"),
            unitPrice: getVal(line, "unitPrice"),
            discountPct: getVal(line, "discountPct"),
            gstRate: getVal(line, "gstRate"),
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Save failed");
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[line.id];
          return next;
        });
        onRefresh();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSavingId(null);
      }
    },
    [drafts, quoteId, onRefresh],
  );

  const removeLine = async (lineId: string) => {
    if (!confirm("Remove this line?")) return;
    const res = await fetch(`/api/quotes/${quoteId}/lines/${lineId}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) alert(json.error ?? "Delete failed");
    else onRefresh();
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const rows = text.split(/\r?\n/).filter((r) => r.trim());
      alert(
        `Parsed ${rows.length} row(s). Use Add product for catalog lines; bulk paste import ships in the next iteration.`,
      );
    } catch {
      alert("Clipboard access denied");
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border border-crm-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-crm-border px-4 py-3">
        <h3 className="text-sm font-semibold text-crm-text">Line items (spreadsheet)</h3>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void pasteFromClipboard()}>
              Paste from Excel
            </Button>
            <Button size="sm" onClick={onAddProduct}>
              Add product
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-accent-50 text-left text-xs font-semibold uppercase text-accent-700">
              <th className="p-2 w-10">#</th>
              <th className="p-2">Product</th>
              <th className="p-2 w-24 text-right">Qty</th>
              <th className="p-2 w-28 text-right">Rate</th>
              <th className="p-2 w-20 text-right">Disc%</th>
              <th className="p-2 w-20 text-right">GST%</th>
              <th className="p-2 w-28 text-right">Total</th>
              {canEdit && <th className="p-2 w-24" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="p-8 text-center text-crm-muted">
                  No lines — add a product to begin.
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <tr key={line.id} className="border-t border-crm-border/60 hover:bg-accent-50/40">
                  <td className="p-2 text-crm-muted">{line.lineNumber}</td>
                  <td className="p-2 font-medium">{line.productName}</td>
                  <td className="p-2">
                    {canEdit ? (
                      <Input
                        type="number"
                        className="h-8 text-right"
                        value={getVal(line, "quantity")}
                        onChange={(e) =>
                          setDraft(line.id, { quantity: Number(e.target.value) })
                        }
                        onBlur={() => void saveLine(line)}
                      />
                    ) : (
                      <span className="block text-right tabular-nums">{line.quantity}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {canEdit ? (
                      <Input
                        type="number"
                        className="h-8 text-right"
                        value={getVal(line, "unitPrice")}
                        onChange={(e) =>
                          setDraft(line.id, { unitPrice: Number(e.target.value) })
                        }
                        onBlur={() => void saveLine(line)}
                      />
                    ) : (
                      <span className="block text-right tabular-nums">₹{fmt(line.unitPrice)}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {canEdit ? (
                      <Input
                        type="number"
                        className="h-8 text-right"
                        value={getVal(line, "discountPct")}
                        onChange={(e) =>
                          setDraft(line.id, { discountPct: Number(e.target.value) })
                        }
                        onBlur={() => void saveLine(line)}
                      />
                    ) : (
                      <span className="block text-right">{line.discountPct}%</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{line.gstRate}%</td>
                  <td className="p-2 text-right font-medium tabular-nums">₹{fmt(line.lineTotal)}</td>
                  {canEdit && (
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => void removeLine(line.id)}
                        disabled={savingId === line.id}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
