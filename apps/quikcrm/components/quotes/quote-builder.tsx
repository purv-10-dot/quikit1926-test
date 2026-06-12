"use client";

/**
 * Quote Builder — the rep-facing screen for composing a quote.
 *
 * Sections (top → bottom):
 *   1. Header bar: quote number, status pill, action buttons (Activate /
 *      Mark Won / Mark Lost / Revise / Back).
 *   2. Header form: account (read-only after create), price list, dates,
 *      billing state, terms, freight, overall discount.
 *   3. Line items table: editable rows (only on Draft) with add-line modal.
 *   4. Totals panel: subtotal, discounts, GST (CGST/SGST or IGST), freight,
 *      round-off, grand total + grand total in words.
 *
 * Behaviour:
 *   - Draft: everything editable. Each line save triggers a refetch so
 *     totals stay correct.
 *   - Active / Won / Lost / Revised: read-only. Status actions still surface
 *     in the header bar (Mark Won, Mark Lost, Revise).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Copy, Pencil, FileText, Send, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableScroll,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { QuoteEnterprisePanel } from "@/components/quotes/enterprise/quote-enterprise-panel";
import { QuoteLinesGrid } from "@/components/quotes/enterprise/quote-lines-grid";
import { QuotePdfPreviewModal } from "@/components/quotes/pdf-preview-modal";

type QuoteStatus = "Draft" | "Active" | "Won" | "Lost" | "Revised";

interface QuoteLine {
  id: string;
  lineNumber: number;
  productId: string | null;
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  versionNumber: number;
  status: QuoteStatus;
  accountId: string;
  contactId: string | null;
  opportunityId: string | null;
  priceListId: string | null;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  companyState: string | null;
  billingState: string | null;
  overallDiscountAmount: number;
  freightAmount: number;
  termsText: string | null;
  subtotal: number;
  totalLineDiscount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOffAmount: number;
  grandTotal: number;
  grandTotalInWords: string | null;
  ownerName: string | null;
  sentAt: string | null;
  lines: QuoteLine[];
  /**
   * The selected price list's items, denormalised onto the quote's GET
   * response so the Add Line modal can resolve segmented unit prices +
   * discounts in-memory. Empty when no list is bound to the quote.
   * Server-side source: lib/services/quotes/price-list-service.ts::loadPriceListItemMap
   */
  priceListItems?: PriceListItem[];
  /**
   * Revision history chain (V1 → V2 → V3 → current). Empty when this
   * quote has no revisions either direction. Source:
   * lib/services/quotes/quote-service.ts::loadRevisionChain
   */
  revisionChain?: RevisionChainEntry[];
}

interface RevisionChainEntry {
  id: string;
  quoteNumber: string;
  versionNumber: number;
  status: QuoteStatus;
  grandTotal: number;
  createdAt: string;
  isCurrent: boolean;
}

interface PriceListItem {
  productId: string;
  unitPrice: number;
  discountPct: number;
  minQuantity: number;
}

interface PriceListOption {
  id: string;
  name: string;
  currency: string;
}

const STATUS_STYLE: Record<QuoteStatus, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Active: "bg-blue-100 text-blue-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  Revised: "bg-amber-100 text-amber-700",
};

export function QuoteBuilder({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [editingLine, setEditingLine] = useState<QuoteLine | null>(null);
  const [markingLost, setMarkingLost] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  // Local header form state — synced when quote loads.
  const [billingState, setBillingState] = useState("");
  const [companyState, setCompanyState] = useState("");
  const [overallDiscount, setOverallDiscount] = useState("0");
  const [freight, setFreight] = useState("0");
  const [terms, setTerms] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [priceListId, setPriceListId] = useState<string>("");
  /** Items for the currently selected list — refreshed on load and on dropdown change. */
  const [livePriceListItems, setLivePriceListItems] = useState<PriceListItem[]>([]);
  const [priceListNotice, setPriceListNotice] = useState<string | null>(null);
  const [applyingPriceList, setApplyingPriceList] = useState(false);

  // Price-list options loaded once for the header dropdown. Separate from
  // priceListItems (which only carries the items of the *selected* list)
  // because the dropdown needs to show every active list the tenant has.
  const [priceListOptions, setPriceListOptions] = useState<PriceListOption[]>([]);

  const loadPriceListItemsForSelect = useCallback(async (listId: string): Promise<number> => {
    if (!listId) {
      setLivePriceListItems([]);
      return 0;
    }
    const res = await fetch(`/api/price-lists/${listId}`, { credentials: "include" });
    const body = await res.json();
    if (!res.ok || !body.success) return 0;
    const items = (body.data?.items ?? []) as Array<{
      productId: string;
      unitPrice: number;
      discountPct: number;
      minQuantity?: number;
    }>;
    const mapped = items.map((it) => ({
      productId: it.productId,
      unitPrice: it.unitPrice,
      discountPct: it.discountPct,
      minQuantity: it.minQuantity ?? 1,
    }));
    setLivePriceListItems(mapped);
    return mapped.length;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setQuote(body.data);
      setBillingState(body.data.billingState ?? "");
      setCompanyState(body.data.companyState ?? "");
      setOverallDiscount(String(body.data.overallDiscountAmount ?? 0));
      setFreight(String(body.data.freightAmount ?? 0));
      setTerms(body.data.termsText ?? "");
      setValidUntil(body.data.effectiveTo ? body.data.effectiveTo.slice(0, 10) : "");
      setPriceListId(body.data.priceListId ?? "");
      setLivePriceListItems(
        Array.isArray(body.data.priceListItems) ? body.data.priceListItems : [],
      );
      setPriceListNotice(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load the tenant's active price lists once on mount for the header
  // dropdown. Cheap query (typical tenant has <20 lists), no need for
  // pagination here. Filtered to isActive=true so reps can't accidentally
  // re-bind to an archived list.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/price-lists?page=1&pageSize=100&isActive=true")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !body.success) return;
        const items = (body.data?.items ?? []) as PriceListOption[];
        setPriceListOptions(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const isDraft = quote?.status === "Draft";
  const isActive = quote?.status === "Active";
  const canEdit = isDraft;

  async function saveHeader() {
    if (!quote) return;
    setSavingHeader(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyState: companyState.trim() || null,
          billingState: billingState.trim() || null,
          overallDiscountAmount: Number(overallDiscount) || 0,
          freightAmount: Number(freight) || 0,
          termsText: terms || null,
          // priceListId can be cleared (null) — empty string from the
          // dropdown means "no price list, use product defaults".
          priceListId: priceListId || null,
          effectiveTo: validUntil
            ? new Date(validUntil + "T23:59:59Z").toISOString()
            : null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to save");
      void load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save header");
    } finally {
      setSavingHeader(false);
    }
  }

  /** Bind price list immediately — reprices existing lines server-side. */
  async function applyPriceListSelection(nextId: string) {
    if (!quote || !canEdit) {
      setPriceListId(nextId);
      void loadPriceListItemsForSelect(nextId);
      return;
    }
    setPriceListId(nextId);
    setApplyingPriceList(true);
    setError(null);
    setPriceListNotice(null);
    try {
      const productCount = await loadPriceListItemsForSelect(nextId);
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceListId: nextId || null }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to apply price list");
      if (nextId) {
        const beforeLines = quote.lines.length;
        const afterLines = Array.isArray(body.data?.lines) ? body.data.lines.length : beforeLines;
        const addedLines = Math.max(0, afterLines - beforeLines);
        if (addedLines > 0) {
          setPriceListNotice(
            `Added ${addedLines} product(s) from the price list with list prices. Totals updated.`,
          );
        } else if (productCount > 0 && beforeLines > 0) {
          setPriceListNotice(
            `All ${productCount} list product(s) were already on the quote — line prices refreshed.`,
          );
        } else if (productCount > 0) {
          setPriceListNotice(
            "Price list applied. Products could not be added — check that list products are active.",
          );
        } else {
          setPriceListNotice("Price list applied, but it has no products yet.");
        }
      } else {
        setPriceListNotice("Using catalog default prices for new lines.");
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to apply price list");
    } finally {
      setApplyingPriceList(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!quote) return;
    if (!confirm("Remove this line?")) return;
    try {
      const res = await fetch(`/api/quotes/${quote.id}/lines/${lineId}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to delete line");
      void load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete line");
    }
  }

  async function transition(toStatus: QuoteStatus, reason?: string, notes?: string) {
    if (!quote) return;
    try {
      const res = await fetch(`/api/quotes/${quote.id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus, reason: reason ?? null, notes: notes ?? null }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to update status");
      void load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  async function revise() {
    if (!quote) return;
    try {
      const res = await fetch(`/api/quotes/${quote.id}/revise`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to revise");
      router.push(`/quotes/${body.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revise quote");
    }
  }

  async function clone() {
    if (!quote) return;
    try {
      const res = await fetch(`/api/quotes/${quote.id}/clone`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to clone");
      router.push(`/quotes/${body.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to clone quote");
    }
  }

  /**
   * Convert this (Won) quote into an Order. Idempotent on the server —
   * calling twice with the same quote returns the existing order rather
   * than creating a duplicate, so accidental double-click is safe.
   */
  async function convertToOrder() {
    if (!quote) return;
    try {
      const res = await fetch(`/api/quotes/${quote.id}/convert-to-order`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to convert");
      router.push(`/orders/${body.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to convert quote to order");
    }
  }

  const isIntraState = useMemo(() => {
    if (!quote?.companyState || !quote?.billingState) return false;
    return quote.companyState.trim().toLowerCase() === quote.billingState.trim().toLowerCase();
  }, [quote]);

  if (loading && !quote) return <p className="text-sm text-crm-muted">Loading…</p>;
  if (!quote) return <p className="text-sm text-red-600">{error ?? "Quote not found"}</p>;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-crm-border bg-white px-4 py-3">
        <Link href="/quotes" className="crm-btn-ghost h-8 w-8 p-0" aria-label="Back to quotes">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-crm-text">{quote.quoteNumber}</span>
            {quote.versionNumber > 1 && (
              <span className="text-xs text-crm-muted">v{quote.versionNumber}</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[quote.status]}`}
            >
              {quote.status}
            </span>
          </div>
          {quote.ownerName && (
            <p className="text-xs text-crm-muted">Owner: {quote.ownerName}</p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isDraft && (
            <Button
              onClick={() => void transition("Active")}
              disabled={quote.lines.length === 0}
              title={quote.lines.length === 0 ? "Add at least one line first" : undefined}
            >
              Activate
            </Button>
          )}
          {isActive && (
            <>
              <Button variant="secondary" onClick={() => void transition("Won")}>
                Mark Won
              </Button>
              <Button variant="danger" onClick={() => setMarkingLost(true)}>
                Mark Lost
              </Button>
              <Button variant="secondary" onClick={() => void revise()}>
                Revise
              </Button>
            </>
          )}
          {/* PDF & Send — available from any status. PDF is a browser-print
              page (no server-side Chrome required); Send fires the email
              service abstraction (console driver in dev, Resend in prod
              once RESEND_API_KEY is set). */}
          <Button
            variant="secondary"
            onClick={() => setPdfOpen(true)}
            title="Preview, download, print, email, or snapshot this quote as a PDF"
          >
            <FileText size={14} /> PDF
          </Button>
          {(quote.status === "Draft" || quote.status === "Active") && (
            <Button onClick={() => setSending(true)} title="Email this quote to the customer">
              <Send size={14} /> {quote.sentAt ? "Resend" : "Send"}
            </Button>
          )}
          {quote.status === "Won" && (
            <Button
              onClick={() => void convertToOrder()}
              title="Hand this Won quote over to fulfilment as an Order"
            >
              <PackageCheck size={14} /> Convert to order
            </Button>
          )}
          {/* Clone is always available — works from any status (incl. Won/Lost/
              Revised). Distinct from Revise: Clone makes a *new* quote number;
              Revise mints V(N+1) under the same number. */}
          <Button variant="secondary" onClick={() => void clone()} title="Create a new quote with these line items">
            <Copy size={14} /> Clone
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Revision chain — only renders when this quote has revisions
          (parent or children). Single horizontal strip showing the V1 →
          V2 → current journey so reps can jump between versions.
          Closes audit finding W-10. */}
      {quote.revisionChain && quote.revisionChain.length > 1 && (
        <RevisionChain entries={quote.revisionChain} />
      )}

      <QuoteEnterprisePanel
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
        canEdit={canEdit}
        onOpenPdfPreview={() => setPdfOpen(true)}
      />

      <QuotePdfPreviewModal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
        canEdit={canEdit}
      />

      {/* Header form */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-crm-border bg-white p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-crm-text">Quote details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Company state
              </span>
              <Input
                value={companyState}
                onChange={(e) => setCompanyState(e.target.value)}
                disabled={!canEdit}
                placeholder="e.g., Karnataka"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Customer billing state
              </span>
              <Input
                value={billingState}
                onChange={(e) => setBillingState(e.target.value)}
                disabled={!canEdit}
                placeholder="e.g., Maharashtra"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Valid until
              </span>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Price list
              </span>
              <select
                className="crm-input pr-8"
                value={priceListId}
                onChange={(e) => void applyPriceListSelection(e.target.value)}
                disabled={!canEdit || applyingPriceList}
                aria-label="Price list"
              >
                <option value="">— Catalog default —</option>
                {priceListOptions.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.currency})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[10px] text-crm-muted">
                {applyingPriceList
                  ? "Applying price list…"
                  : priceListId
                    ? `${livePriceListItems.length} product(s) on list · selecting adds them as line items automatically`
                    : "New lines use product default prices"}
              </span>
              {priceListNotice && (
                <p className="mt-1 rounded-md bg-accent-50 px-2 py-1 text-[11px] text-accent-800">
                  {priceListNotice}
                </p>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                GST mode
              </span>
              <p className="crm-input bg-gray-50 text-sm text-crm-muted">
                {isIntraState ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
              </p>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Terms & conditions
              </span>
              <textarea
                className="crm-input min-h-[60px]"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                disabled={!canEdit}
                placeholder="50% advance, balance on delivery…"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Overall discount (₹)
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(e.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-crm-muted">
                Freight (₹)
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                disabled={!canEdit}
              />
            </label>
          </div>
          {canEdit && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="secondary" onClick={saveHeader} disabled={savingHeader}>
                {savingHeader ? "Saving…" : "Save header"}
              </Button>
            </div>
          )}
        </div>

        {/* Totals panel */}
        <TotalsPanel quote={quote} isIntraState={isIntraState} />
      </div>

      {/* Lines — spreadsheet grid when editable */}
      {canEdit ? (
        <QuoteLinesGrid
          quoteId={quote.id}
          lines={quote.lines}
          canEdit
          onRefresh={() => void load()}
          onAddProduct={() => setAddingLine(true)}
        />
      ) : (
      <div className="rounded-lg border border-crm-border bg-white">
        <div className="flex items-center justify-between border-b border-crm-border px-4 py-3">
          <h3 className="text-sm font-semibold text-crm-text">Line items</h3>
        </div>
        <TableScroll minWidth={780}>
          <Table>
            <THead>
              <TR>
                <TH className="w-10 text-right">#</TH>
                <TH>Product</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Unit price</TH>
                <TH className="text-right" hideBelow="sm">
                  Disc%
                </TH>
                <TH className="text-right" hideBelow="md">
                  GST%
                </TH>
                <TH className="text-right">Line total</TH>
                {canEdit && <TH aria-label="Actions" />}
              </TR>
            </THead>
            <TBody>
              {quote.lines.length === 0 ? (
                <TR>
                  <TD
                    colSpan={canEdit ? 8 : 7}
                    className="py-8 text-center text-sm text-crm-muted"
                  >
                    No line items yet. {canEdit ? "Add a product to start." : ""}
                  </TD>
                </TR>
              ) : (
                quote.lines.map((l) => (
                  <TR key={l.id} className="hover:bg-blue-50/30">
                    <TD className="text-right text-crm-muted">{l.lineNumber}</TD>
                    <TD>
                      <div className="font-medium text-crm-text">{l.productName}</div>
                      {l.sku && (
                        <div className="text-xs text-crm-muted">SKU: {l.sku}</div>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{l.quantity}</TD>
                    <TD className="text-right tabular-nums">
                      ₹{l.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TD>
                    <TD className="text-right tabular-nums" hideBelow="sm">
                      {l.discountPct}%
                    </TD>
                    <TD className="text-right tabular-nums" hideBelow="md">
                      {l.gstRate}%
                    </TD>
                    <TD className="text-right tabular-nums font-medium">
                      ₹{l.lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TD>
                    {canEdit && (
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingLine(l)}
                            className="crm-btn-ghost h-8 w-8 p-0"
                            aria-label={`Edit line ${l.lineNumber}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeLine(l.id)}
                            className="crm-btn-ghost h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                            aria-label={`Remove line ${l.lineNumber}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableScroll>
      </div>
      )}

      {addingLine && (
        <AddLineModal
          open={addingLine}
          onClose={() => setAddingLine(false)}
          onSaved={() => {
            setAddingLine(false);
            void load();
          }}
          quoteId={quote.id}
          priceListItems={livePriceListItems}
        />
      )}
      {editingLine && (
        <EditLineModal
          open={!!editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={() => {
            setEditingLine(null);
            void load();
          }}
          quoteId={quote.id}
          line={editingLine}
        />
      )}
      {sending && (
        <SendQuoteModal
          open={sending}
          onClose={() => setSending(false)}
          onSent={() => {
            setSending(false);
            void load();
          }}
          quoteId={quote.id}
          quoteNumber={quote.quoteNumber}
          accountName={null}
          defaultRecipient={null}
        />
      )}
      {markingLost && (
        <MarkLostModal
          open={markingLost}
          onClose={() => setMarkingLost(false)}
          onConfirm={async (reason, notes) => {
            await transition("Lost", reason, notes);
            setMarkingLost(false);
          }}
        />
      )}
    </div>
  );
}

function TotalsPanel({ quote, isIntraState }: { quote: Quote; isIntraState: boolean }) {
  function row(label: string, value: number, opts?: { strong?: boolean }) {
    return (
      <div className="flex items-center justify-between py-1">
        <span
          className={
            "text-sm " + (opts?.strong ? "font-semibold text-crm-text" : "text-crm-muted")
          }
        >
          {label}
        </span>
        <span
          className={
            "tabular-nums " +
            (opts?.strong ? "text-base font-semibold text-crm-text" : "text-sm text-crm-text")
          }
        >
          ₹{value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-crm-border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-crm-text">Totals</h3>
      {row("Subtotal", quote.subtotal)}
      {row("Line discount", quote.totalLineDiscount)}
      {row("Overall discount", quote.overallDiscountAmount)}
      {row("Taxable amount", quote.taxableAmount)}
      {isIntraState ? (
        <>
          {row("CGST", quote.cgstAmount)}
          {row("SGST", quote.sgstAmount)}
        </>
      ) : (
        row("IGST", quote.igstAmount)
      )}
      {row("Freight", quote.freightAmount)}
      {quote.roundOffAmount !== 0 && row("Round-off", quote.roundOffAmount)}
      <div className="my-2 border-t border-crm-border" />
      {row("Grand total", quote.grandTotal, { strong: true })}
      {quote.grandTotalInWords && (
        <p className="mt-2 text-xs text-crm-muted">
          <span className="font-medium">In words:</span> {quote.grandTotalInWords}
        </p>
      )}
    </div>
  );
}

function AddLineModal({
  open,
  onClose,
  onSaved,
  quoteId,
  priceListItems,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  quoteId: string;
  /**
   * Items from the quote's currently-bound price list (empty if no list).
   * When non-empty, the modal will prefer the per-list unitPrice +
   * discountPct over the product's default `listPrice` whenever the
   * selected product appears on the list at a `minQuantity` ≤ the
   * entered quantity. Highest-eligible-bracket wins (mirrors
   * lib/services/quotes/price-list-service.ts::resolvePriceForProduct).
   */
  priceListItems: PriceListItem[];
}) {
  interface PickerProduct {
    id: string;
    name: string;
    sku: string;
    listPrice: number;
    gstRate: number;
    hsnCode: string | null;
    defaultUnit: string;
  }
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [gstRate, setGstRate] = useState("18");
  const [priceSource, setPriceSource] = useState<"catalog" | "priceList">("catalog");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/products?page=1&pageSize=100&isActive=true")
      .then((r) => r.json())
      .then((b) => {
        if (b.success) setProducts(b.data.items);
      });
  }, [open]);

  const selected = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  // Resolve the effective unit price + discount when product OR quantity
  // changes. Order of preference:
  //   1. Highest minQuantity bracket on the quote's price list that fits
  //      the entered qty → use that (segmented pricing)
  //   2. Product default listPrice → use that (catalog fallback)
  // This is the same resolution rule the server-side service applies
  // (resolvePriceForProduct), kept in lockstep so what the rep sees in
  // the modal matches what the server will store.
  useEffect(() => {
    if (!selected) return;
    setGstRate(String(selected.gstRate));
    const qtyNum = Math.max(1, Math.floor(Number(quantity) || 1));
    const eligible = priceListItems
      .filter((it) => it.productId === selected.id && it.minQuantity <= qtyNum)
      .sort((a, b) => b.minQuantity - a.minQuantity);
    if (eligible.length > 0) {
      const it = eligible[0]!;
      setUnitPrice(String(it.unitPrice));
      setDiscountPct(String(it.discountPct));
      setPriceSource("priceList");
    } else {
      setUnitPrice(String(selected.listPrice));
      setDiscountPct("0");
      setPriceSource("catalog");
    }
  }, [selected, quantity, priceListItems]);

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/lines`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: selected.id,
          productName: selected.name,
          sku: selected.sku,
          hsnCode: selected.hsnCode,
          unit: selected.defaultUnit,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          discountPct: Number(discountPct),
          gstRate: Number(gstRate),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to add line");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add line item" width="max-w-xl">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">
            Product <span className="text-red-500">*</span>
          </span>
          <select
            className="crm-input pr-8"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">— Select a product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">Quantity</span>
            <Input
              type="number"
              min={0}
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">
              Unit price (₹)
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">Discount %</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">GST %</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
            />
          </label>
        </div>
      </div>

      {selected && priceSource === "priceList" && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent-50 px-2.5 py-1 text-xs text-accent-700">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
          Price pulled from the quote&apos;s price list (you can still override).
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !productId || !unitPrice}>
          {submitting ? "Adding…" : "Add line"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function RevisionChain({ entries }: { entries: RevisionChainEntry[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-800">
        <span>Revision history</span>
        <span className="text-amber-600">— {entries.length} versions of this quote</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
        {entries.map((e, idx) => (
          <div key={e.id} className="flex items-center gap-1.5">
            {idx > 0 && <span className="text-amber-600">→</span>}
            {e.isCurrent ? (
              // Current version: bold, no link
              <span
                className="inline-flex items-center gap-1.5 rounded-md border-2 border-accent-500 bg-white px-2 py-1 text-xs font-semibold text-crm-text"
                aria-current="page"
              >
                <span className="rounded-full bg-accent-500/15 px-1.5 text-accent-700">
                  v{e.versionNumber}
                </span>
                {e.quoteNumber}
                <span className="text-crm-muted">·</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[e.status]}`}>
                  {e.status}
                </span>
              </span>
            ) : (
              <Link
                href={`/quotes/${e.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-crm-border bg-white px-2 py-1 text-xs text-crm-muted transition hover:border-accent-300 hover:text-crm-text"
              >
                <span className="rounded-full bg-gray-100 px-1.5 text-crm-muted">
                  v{e.versionNumber}
                </span>
                {e.quoteNumber}
                <span className="text-crm-muted">·</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[e.status]}`}>
                  {e.status}
                </span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditLineModal({
  open,
  onClose,
  onSaved,
  quoteId,
  line,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  quoteId: string;
  line: QuoteLine;
}) {
  // Pure-text edit: we only let the rep tune quantity / unit price / discount /
  // GST. Swapping the product itself isn't allowed — they should delete and
  // re-add, which preserves clean snapshot semantics. This matches how
  // Salesforce CPQ and Dynamics 365 Sales handle line-item edits.
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [unitPrice, setUnitPrice] = useState(String(line.unitPrice));
  const [discountPct, setDiscountPct] = useState(String(line.discountPct));
  const [gstRate, setGstRate] = useState(String(line.gstRate));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/lines/${line.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          discountPct: Number(discountPct),
          gstRate: Number(gstRate),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to update line");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update line");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit: ${line.productName}`} width="max-w-lg">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">Quantity</span>
          <Input
            type="number"
            min={0}
            step="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">Unit price (₹)</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">Discount %</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">GST %</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={gstRate}
            onChange={(e) => setGstRate(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function SendQuoteModal({
  open,
  onClose,
  onSent,
  quoteId,
  quoteNumber,
  accountName,
  defaultRecipient,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  quoteId: string;
  quoteNumber: string;
  accountName: string | null;
  defaultRecipient: string | null;
}) {
  // Pre-fill the subject/body the way D365 and HubSpot do — the rep tweaks
  // and clicks Send. Keep the line count small; no rich-text editor in v1
  // because the email service driver is text-only by default (HTML mode is
  // available in send.ts but the composer doesn't expose it yet — Phase 2 polish).
  const [to, setTo] = useState(defaultRecipient ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(
    `Quotation ${quoteNumber}${accountName ? ` for ${accountName}` : ""}`,
  );
  const [body, setBody] = useState(
    `Hi,\n\nPlease find our proposal attached as a link below. Let me know if you have any questions.\n\nBest regards,`,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function splitAddresses(s: string): string[] {
    // Allow comma, semicolon, or newline separators — same UX as Gmail/Outlook.
    return s
      .split(/[,;\n]/u)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/quotes/${quoteId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: splitAddresses(to),
          cc: cc.trim() ? splitAddresses(cc) : undefined,
          subject: subject.trim(),
          body,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        throw new Error(json.error ?? "Failed to send quote");
      }
      onSent();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send quote");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Send quote" width="max-w-2xl">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">
            To <span className="text-red-500">*</span>
          </span>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="customer@example.com, another@example.com"
            aria-invalid={!!fieldErrors.to}
          />
          {fieldErrors.to && (
            <span className="mt-1 block text-xs text-red-600">{fieldErrors.to}</span>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">Cc</span>
          <Input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="optional"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">
            Subject <span className="text-red-500">*</span>
          </span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={300}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">Message</span>
          <textarea
            className="crm-input min-h-[160px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={20000}
          />
        </label>
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          A printable link to this quote will be appended to the message body.
          (Phase 2 will attach the rendered PDF directly.)
        </p>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !to.trim() || !subject.trim()}>
          {submitting ? "Sending…" : "Send"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function MarkLostModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("Price");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Mark Lost">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">Reason</span>
          <select
            className="crm-input pr-8"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="Price">Price</option>
            <option value="Competition">Competition</option>
            <option value="Timing">Timing</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">Notes</span>
          <textarea
            className="crm-input min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>
      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button
          variant="danger"
          onClick={async () => {
            setSubmitting(true);
            await onConfirm(reason, notes);
            setSubmitting(false);
          }}
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Mark Lost"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
