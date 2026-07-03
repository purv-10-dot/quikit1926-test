"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ScanLine, Plus, Minus, Trash2, ImageIcon, ImageOff, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, type ReceiptData } from "./Receipt";

type Product = { id: string; name: string; sku: string | null; barcode: string | null; sales_price: number; category_id: string | null; image_url: string | null };
type Category = { id: string; name: string; parent_id: string | null };
type CartLine = { itemId: string; name: string; price: number; qty: number };

const ORDER_TYPES = [
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
  { key: "dinein", label: "Dine In" }
];
const PAY = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "ewallet", label: "E-Wallet" }
];

export function PointOfSale() {
  const { format } = useCurrency();
  const scanRef = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState("pickup");
  const [pay, setPay] = useState("cash");
  const [showImages, setShowImages] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => { setShowImages(localStorage.getItem("pos_show_images") !== "0"); }, []);
  const toggleImages = () => setShowImages((s) => { localStorage.setItem("pos_show_images", s ? "0" : "1"); return !s; });

  const { data, isPending } = useQuery({
    queryKey: ["pos-products"],
    queryFn: async () => {
      const r = await fetch("/api/v1/pos/products");
      return r.ok ? ((await r.json()).data as { products: Product[]; categories: Category[]; walkInCustomerId: string | null }) : null;
    }
  });
  const products = data?.products ?? [];
  const topCategories = useMemo(() => (data?.categories ?? []).filter((c) => !c.parent_id), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category_id !== cat) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
    });
  }, [products, cat, search]);

  const addToCart = (p: { id: string; name: string; sales_price: number }) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.itemId === p.id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { itemId: p.id, name: p.name, price: Number(p.sales_price), qty: 1 }];
    });
  };
  const setQty = (id: string, delta: number) => setCart((c) => c.flatMap((l) => l.itemId === id ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l]));
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.itemId !== id));

  const onScan = async (code: string) => {
    const value = code.trim();
    if (!value) return;
    setScan("");
    try {
      const r = await fetch(`/api/v1/pos/lookup?code=${encodeURIComponent(value)}`);
      if (!r.ok) { toast.error(`No item for “${value}”.`); return; }
      const item = (await r.json()).data as { id: string; name: string; sales_price: number };
      addToCart(item);
      toast.success(`Added ${item.name}`);
    } catch { toast.error("Scan lookup failed."); }
  };

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  const placeOrder = async () => {
    if (!cart.length) { toast.error("Cart is empty."); return; }
    setPlacing(true);
    try {
      const r = await fetch("/api/v1/pos/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart, orderType, paymentMethod: pay, customerId: data?.walkInCustomerId ?? undefined })
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Checkout failed");
      setReceipt(body.data as ReceiptData);
      setCart([]);
      toast.success(`Order ${body.data.invoiceNumber} placed.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Checkout failed"); }
    finally { setPlacing(false); }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* Categories */}
      <aside className="hidden w-44 shrink-0 overflow-y-auto rounded-2xl border bg-card p-2 lg:block">
        <button onClick={() => setCat(null)} className={cn("mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium", !cat ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>All Items</button>
        {topCategories.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("mb-1 w-full rounded-lg px-3 py-2 text-left text-sm", cat === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{c.name}</button>
        ))}
      </aside>

      {/* Catalog */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); onScan(scan); }} className="relative">
            <ScanLine className="absolute left-2.5 top-2.5 h-4 w-4 text-primary" />
            <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan barcode → Enter" className="h-9 w-48 rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </form>
          <button onClick={toggleImages} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted" title="Toggle product images">
            {showImages ? <ImageIcon className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}{showImages ? "Images on" : "Images off"}
          </button>
        </div>

        <div className="grid flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
          {isPending ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)
            : filtered.length === 0 ? <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No products.</p>
            : filtered.map((p) => (
              <button key={p.id} onClick={() => addToCart(p)} className="flex flex-col overflow-hidden rounded-xl border bg-background text-left transition hover:border-primary/50 hover:shadow-card">
                {showImages ? (
                  p.image_url ? <img src={p.image_url} alt={p.name} className="h-20 w-full object-cover" />
                    : <div className="flex h-20 w-full items-center justify-center bg-muted text-muted-foreground"><ImageIcon className="h-6 w-6 opacity-40" /></div>
                ) : null}
                <div className="flex flex-1 flex-col justify-between p-2">
                  <p className="line-clamp-2 text-[13px] font-medium leading-tight">{p.name}</p>
                  <p className="mt-1 text-sm font-semibold text-primary">{format(Number(p.sales_price))}</p>
                </div>
              </button>
            ))}
        </div>
      </section>

      {/* Cart */}
      <aside className="flex w-[320px] shrink-0 flex-col rounded-2xl border bg-card">
        <div className="border-b p-3"><h2 className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" />Cart {cart.length ? `(${cart.length})` : ""}</h2></div>
        <div className="flex-1 overflow-y-auto p-2">
          {cart.length === 0 ? <p className="px-3 py-10 text-center text-sm text-muted-foreground">Tap a product or scan a barcode.</p>
            : cart.map((l) => (
              <div key={l.itemId} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{format(l.price)}</p></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(l.itemId, -1)} className="rounded-md border p-1 hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-6 text-center text-sm tabular-nums">{l.qty}</span>
                  <button onClick={() => setQty(l.itemId, 1)} className="rounded-md border p-1 hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <span className="w-16 text-right text-sm font-medium tabular-nums">{format(l.price * l.qty)}</span>
                <button onClick={() => removeLine(l.itemId)} className="rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
        </div>

        <div className="space-y-3 border-t p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {ORDER_TYPES.map((o) => <button key={o.key} onClick={() => setOrderType(o.key)} className={cn("rounded-lg border py-1.5 text-xs font-medium", orderType === o.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>{o.label}</button>)}
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{format(subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="tabular-nums">{format(0)}</span></div>
            <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(subtotal)}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {PAY.map((m) => <button key={m.key} onClick={() => setPay(m.key)} className={cn("rounded-lg border py-1.5 text-xs font-medium", pay === m.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>{m.label}</button>)}
          </div>
          <button onClick={placeOrder} disabled={placing || !cart.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Place Order · {format(subtotal)}
          </button>
        </div>
      </aside>

      {receipt && <Receipt data={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
