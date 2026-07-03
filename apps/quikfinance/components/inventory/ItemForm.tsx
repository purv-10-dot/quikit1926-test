"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useReturnTo } from "@/lib/hooks/use-return-to";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Account = { id: string; name: string; account_type: string };
type Vendor = { id: string; display_name: string };
type Category = { id: string; name: string; parent_id: string | null; is_active: boolean };
type Item = Record<string, unknown>;

const INCOME_TYPES = ["revenue", "income", "other_income"];
const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense"];
const COMMON_UNITS = ["pcs", "box", "kg", "g", "litre", "metre", "hour", "day", "each", "set", "pack"];

const ITEM_TYPES: { value: ItemType; label: string; hint: string }[] = [
  { value: "inventory", label: "Inventory", hint: "Stock is tracked" },
  { value: "non_inventory", label: "Non-Inventory", hint: "Bought/sold, not stocked" },
  { value: "service", label: "Service", hint: "Time or labour" },
  { value: "bundle", label: "Bundle", hint: "Kit of other items" }
];
type ItemType = "inventory" | "non_inventory" | "service" | "bundle";

async function getJson(path: string) {
  const r = await fetch(path);
  return r.ok ? r.json() : null;
}

export function ItemForm({ itemId }: { itemId?: string }) {
  const router = useRouter();
  const returnTo = useReturnTo();
  const qc = useQueryClient();
  const { currency } = useCurrency();
  const isEdit = Boolean(itemId);

  const { data: item, isPending: itemPending } = useQuery<Item | null>({
    queryKey: ["item", itemId],
    queryFn: async () => (await getJson(`/api/v1/inventory/${itemId}`))?.data ?? null,
    enabled: isEdit
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["accounts-for-items"],
    queryFn: async () => ((await getJson("/api/v1/accounts?per_page=200"))?.data ?? []) as Account[]
  });
  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors-for-items"],
    staleTime: 0,
    queryFn: async () => ((await getJson("/api/v1/vendors?per_page=200"))?.data ?? []) as Vendor[]
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["item-categories"],
    queryFn: async () => ((await getJson("/api/v1/inventory/categories?all=1"))?.data ?? []) as Category[]
  });

  const incomeAccounts = useMemo(() => accounts.filter((a) => INCOME_TYPES.includes(a.account_type)), [accounts]);
  const expenseAccounts = useMemo(() => accounts.filter((a) => EXPENSE_TYPES.includes(a.account_type)), [accounts]);
  const topCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  const [name, setName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [shortName, setShortName] = useState("");
  const [itemType, setItemType] = useState<ItemType>("inventory");
  const [unit, setUnit] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [brand, setBrand] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [tags, setTags] = useState("");
  const [barcode, setBarcode] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [salesEnabled, setSalesEnabled] = useState(true);
  const [salesPrice, setSalesPrice] = useState("0");
  const [incomeAccountId, setIncomeAccountId] = useState("");
  const [salesDescription, setSalesDescription] = useState("");
  const [purchaseEnabled, setPurchaseEnabled] = useState(true);
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [purchaseDescription, setPurchaseDescription] = useState("");
  const [preferredVendorId, setPreferredVendorId] = useState("");
  const [saving, setSaving] = useState(false);

  const subcategories = useMemo(
    () => categories.filter((c) => c.parent_id === categoryId),
    [categories, categoryId]
  );

  // Populate the form from the loaded item (edit mode).
  useEffect(() => {
    if (!item) return;
    setName(String(item.name ?? ""));
    setItemCode(String(item.sku ?? ""));
    setShortName(String(item.short_name ?? ""));
    const t = String(item.item_type ?? "inventory");
    setItemType((["inventory", "non_inventory", "service", "bundle"].includes(t) ? t : "inventory") as ItemType);
    setUnit(String(item.unit ?? ""));
    setCategoryId(item.category_id ? String(item.category_id) : "");
    setSubcategoryId(item.subcategory_id ? String(item.subcategory_id) : "");
    setBrand(String(item.brand ?? ""));
    setManufacturer(String(item.manufacturer ?? ""));
    setTags(String(item.tags ?? ""));
    setBarcode(String(item.barcode ?? ""));
    setImageUrl(String(item.image_url ?? ""));
    setIsActive(item.is_active !== false);
    setSalesPrice(String(item.sales_price ?? "0"));
    setPurchasePrice(String(item.purchase_price ?? "0"));
    setSalesDescription(String(item.description ?? ""));
    setPurchaseDescription(String(item.purchase_description ?? ""));
    setIncomeAccountId(item.income_account_id ? String(item.income_account_id) : "");
    setExpenseAccountId(item.expense_account_id ? String(item.expense_account_id) : "");
    setPreferredVendorId(item.preferred_vendor_id ? String(item.preferred_vendor_id) : "");
  }, [item]);

  // Default the account selectors (Zoho pre-fills these), without overriding a saved value.
  useEffect(() => {
    if (!incomeAccountId && incomeAccounts.length) {
      const sales = incomeAccounts.find((a) => /sales/i.test(a.name)) ?? incomeAccounts[0];
      setIncomeAccountId(sales.id);
    }
  }, [incomeAccounts, incomeAccountId]);
  useEffect(() => {
    if (!expenseAccountId && expenseAccounts.length) {
      const cogs = expenseAccounts.find((a) => a.account_type === "cost_of_goods_sold") ?? expenseAccounts[0];
      setExpenseAccountId(cogs.id);
    }
  }, [expenseAccounts, expenseAccountId]);

  // Clear an orphaned sub-category if the parent category changes.
  useEffect(() => {
    if (subcategoryId && !subcategories.some((s) => s.id === subcategoryId)) setSubcategoryId("");
  }, [subcategoryId, subcategories]);

  // Inline-create a category (parent) or sub-category and select it immediately.
  const createCategory = async (label: string, parentId: string | null): Promise<string | null> => {
    const res = await fetch("/api/v1/inventory/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label, parent_id: parentId })
    });
    if (res.status === 401) {
      toast.error("Your session expired — please sign in again.");
      router.push("/login");
      return null;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast.error(body?.error?.message ?? "Could not add category.");
      return null;
    }
    const row = ((await res.json()) as { data: Category }).data;
    qc.setQueryData<Category[]>(["item-categories"], (old) => {
      const list = old ?? [];
      return list.some((c) => c.id === row.id) ? list : [...list, row];
    });
    toast.success(parentId ? "Sub-category added." : "Category added.");
    return row.id;
  };

  // Preserve in-progress data across a Combobox "+ New Vendor" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:item",
    { name, itemCode, shortName, itemType, unit, categoryId, subcategoryId, brand, manufacturer, tags, isActive, salesEnabled, salesPrice, incomeAccountId, salesDescription, purchaseEnabled, purchasePrice, expenseAccountId, purchaseDescription, preferredVendorId },
    (d) => {
      if (d.name !== undefined) setName(d.name);
      if (d.itemCode !== undefined) setItemCode(d.itemCode);
      if (d.shortName !== undefined) setShortName(d.shortName);
      if (d.itemType !== undefined) setItemType(d.itemType);
      if (d.unit !== undefined) setUnit(d.unit);
      if (d.categoryId !== undefined) setCategoryId(d.categoryId);
      if (d.subcategoryId !== undefined) setSubcategoryId(d.subcategoryId);
      if (d.brand !== undefined) setBrand(d.brand);
      if (d.manufacturer !== undefined) setManufacturer(d.manufacturer);
      if (d.tags !== undefined) setTags(d.tags);
      if (d.isActive !== undefined) setIsActive(d.isActive);
      if (d.salesEnabled !== undefined) setSalesEnabled(d.salesEnabled);
      if (d.salesPrice !== undefined) setSalesPrice(d.salesPrice);
      if (d.incomeAccountId !== undefined) setIncomeAccountId(d.incomeAccountId);
      if (d.salesDescription !== undefined) setSalesDescription(d.salesDescription);
      if (d.purchaseEnabled !== undefined) setPurchaseEnabled(d.purchaseEnabled);
      if (d.purchasePrice !== undefined) setPurchasePrice(d.purchasePrice);
      if (d.expenseAccountId !== undefined) setExpenseAccountId(d.expenseAccountId);
      if (d.purchaseDescription !== undefined) setPurchaseDescription(d.purchaseDescription);
      if (d.preferredVendorId !== undefined) setPreferredVendorId(d.preferredVendorId);
    },
    { enabled: !isEdit }
  );

  const save = async () => {
    if (name.trim().length < 2) {
      toast.error("Item name is required.");
      return;
    }
    if (salesEnabled && !incomeAccountId) {
      toast.error("Select a sales account.");
      return;
    }
    if (purchaseEnabled && !expenseAccountId) {
      toast.error("Select a purchase account.");
      return;
    }

    const payload = {
      name: name.trim(),
      sku: itemCode.trim() || undefined,
      short_name: shortName.trim() || null,
      item_type: itemType,
      unit: unit.trim() || undefined,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
      brand: brand.trim() || null,
      manufacturer: manufacturer.trim() || null,
      tags: tags.trim() || null,
      barcode: barcode.trim() || null,
      image_url: imageUrl || null,
      is_active: isActive,
      sales_price: salesEnabled ? Number(salesPrice || 0) : 0,
      purchase_price: purchaseEnabled ? Number(purchasePrice || 0) : 0,
      description: salesEnabled ? salesDescription.trim() || null : null,
      purchase_description: purchaseEnabled ? purchaseDescription.trim() || null : null,
      income_account_id: salesEnabled ? incomeAccountId || null : null,
      expense_account_id: purchaseEnabled ? expenseAccountId || null : null,
      preferred_vendor_id: purchaseEnabled ? preferredVendorId || null : null
    };

    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/inventory/${itemId}` : "/api/v1/inventory", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the item.");
        return;
      }
      toast.success(isEdit ? "Item updated." : "Item created.");
      clearDraft();
      qc.invalidateQueries({ queryKey: ["module", "inventory"] });
      if (isEdit) qc.invalidateQueries({ queryKey: ["item", itemId] });
      router.push(returnTo ?? (isEdit ? `/inventory/${itemId}` : "/inventory"));
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && itemPending) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Item" : "New Item"}</h1>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* Identity */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="item-name" className="text-destructive">Name*</Label>
              <Input id="item-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
            </div>
            <div>
              <Label htmlFor="item-code">Item Code / SKU</Label>
              <Input id="item-code" className="mt-1" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Auto-generated if left blank" />
            </div>
            <div>
              <Label htmlFor="item-short">Short Name</Label>
              <Input id="item-short" className="mt-1" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label>Item Type</Label>
              <div className="mt-1">
                <Combobox value={itemType} onChange={(v) => setItemType(v as ItemType)} placeholder="Select type"
                  options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="item-unit">Unit</Label>
              <Input id="item-unit" list="item-units" className="mt-1" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Select or type to add" />
              <datalist id="item-units">
                {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div>
              <span className="text-sm font-medium">Status</span>
              <div className="mt-2 flex items-center gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="item-status" className="h-4 w-4 accent-primary" checked={isActive} onChange={() => setIsActive(true)} />
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="item-status" className="h-4 w-4 accent-primary" checked={!isActive} onChange={() => setIsActive(false)} />
                  Inactive
                </label>
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="border-t pt-5">
            <h2 className="text-base font-semibold">Classification</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <Label>Category</Label>
                <div className="mt-1">
                  <Combobox value={categoryId} placeholder="Select or add a category" searchPlaceholder="Search or type to add…"
                    emptyText="Type to add a category" createLabel="Add" onChange={setCategoryId}
                    onCreate={(label) => createCategory(label, null)}
                    options={topCategories.map((c) => ({ value: c.id, label: c.name }))} />
                </div>
              </div>
              <div>
                <Label>Sub Category</Label>
                <div className="mt-1">
                  <Combobox value={subcategoryId} placeholder={categoryId ? "Select or add a sub-category" : "Pick a category first"}
                    searchPlaceholder="Search or type to add…" emptyText="Type to add a sub-category" createLabel="Add"
                    disabled={!categoryId} onChange={setSubcategoryId}
                    onCreate={categoryId ? (label) => createCategory(label, categoryId) : undefined}
                    options={subcategories.map((c) => ({ value: c.id, label: c.name }))} />
                </div>
              </div>
              <div>
                <Label htmlFor="item-brand">Brand</Label>
                <Input id="item-brand" className="mt-1" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand name" />
              </div>
              <div>
                <Label htmlFor="item-mfr">Manufacturer</Label>
                <Input id="item-mfr" className="mt-1" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Manufacturer" />
              </div>
              <div>
                <Label htmlFor="item-barcode">Barcode</Label>
                <Input id="item-barcode" className="mt-1" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type (defaults to SKU at POS)" />
              </div>
              <div>
                <Label>Image</Label>
                <div className="mt-1 flex items-center gap-3">
                  {imageUrl ? (
                    <img src={imageUrl} alt="item" className="h-14 w-14 rounded-lg border object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted text-[10px] text-muted-foreground">No image</div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted">
                    {imageUrl ? "Change" : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 2_000_000) { toast.error("Image must be under 2 MB."); return; }
                      const reader = new FileReader();
                      reader.onload = () => setImageUrl(String(reader.result));
                      reader.readAsDataURL(f);
                    }} />
                  </label>
                  {imageUrl ? <button type="button" onClick={() => setImageUrl("")} className="text-xs text-muted-foreground hover:text-rose-600">Remove</button> : null}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="item-tags">Tags</Label>
                <Input id="item-tags" className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma-separated search tags, e.g. summer, premium, gift" />
              </div>
            </div>
          </div>

          {/* Sales Information */}
          <div className="border-t pt-5">
            <label className="flex items-center gap-2 text-base font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={salesEnabled} onChange={(e) => setSalesEnabled(e.target.checked)} />
              Sales Information
            </label>
            <div className={cn("mt-4 grid gap-5 sm:grid-cols-2", !salesEnabled && "pointer-events-none opacity-50")}>
              <div>
                <Label className="text-destructive">Selling Price*</Label>
                <div className="mt-1 flex">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{currency}</span>
                  <Input type="number" min="0" step="0.01" className="rounded-l-none" value={salesPrice} onChange={(e) => setSalesPrice(e.target.value)} disabled={!salesEnabled} />
                </div>
              </div>
              <div>
                <Label className="text-destructive">Account*</Label>
                <div className="mt-1">
                  <Combobox value={incomeAccountId} placeholder="Select an account" searchPlaceholder="Search accounts…" disabled={!salesEnabled}
                    onChange={(val) => setIncomeAccountId(val)} options={incomeAccounts.map((a) => ({ value: a.id, label: a.name }))} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea className="mt-1" rows={3} value={salesDescription} onChange={(e) => setSalesDescription(e.target.value)} disabled={!salesEnabled} />
              </div>
            </div>
          </div>

          {/* Purchase Information */}
          <div className="border-t pt-5">
            <label className="flex items-center gap-2 text-base font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={purchaseEnabled} onChange={(e) => setPurchaseEnabled(e.target.checked)} />
              Purchase Information
            </label>
            <div className={cn("mt-4 grid gap-5 sm:grid-cols-2", !purchaseEnabled && "pointer-events-none opacity-50")}>
              <div>
                <Label className="text-destructive">Cost Price*</Label>
                <div className="mt-1 flex">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{currency}</span>
                  <Input type="number" min="0" step="0.01" className="rounded-l-none" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} disabled={!purchaseEnabled} />
                </div>
              </div>
              <div>
                <Label className="text-destructive">Account*</Label>
                <div className="mt-1">
                  <Combobox value={expenseAccountId} placeholder="Select an account" searchPlaceholder="Search accounts…" disabled={!purchaseEnabled}
                    onChange={(val) => setExpenseAccountId(val)} options={expenseAccounts.map((a) => ({ value: a.id, label: a.name }))} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea className="mt-1" rows={3} value={purchaseDescription} onChange={(e) => setPurchaseDescription(e.target.value)} disabled={!purchaseEnabled} />
              </div>
              <div>
                <Label>Preferred Vendor</Label>
                <div className="mt-1">
                  <Combobox value={preferredVendorId} placeholder="Select a vendor" searchPlaceholder="Search vendors…" disabled={!purchaseEnabled}
                    createHref="/vendors/new" createLabel="New Vendor"
                    onChange={(val) => setPreferredVendorId(val)} options={vendors.map((v) => ({ value: v.id, label: v.display_name }))} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.push(isEdit ? `/inventory/${itemId}` : "/inventory")}>Cancel</Button>
      </div>
    </div>
  );
}
