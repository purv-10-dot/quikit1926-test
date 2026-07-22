"use client"

import { useState } from "react"
import { Search, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Asset } from "@/types/asset"

// Condition pill colours — mirror the Asset Inventory table + FulfilDialog.
export const CONDITION_STYLES: Record<string, string> = {
  New: "bg-green-100 text-green-700",
  Good: "bg-blue-100 text-blue-700",
  Fair: "bg-yellow-100 text-yellow-700",
  Poor: "bg-orange-100 text-orange-700",
  Damaged: "bg-red-100 text-red-700",
}

interface Props {
  assets: Asset[]
  /** Currently-selected asset ids. Single-select passes [] or [id]. */
  selectedIds: string[]
  /** Row click. Single-select: caller replaces; multi-select: caller toggles. */
  onSelect: (id: string) => void
  multiple?: boolean
  /** Multi-select only: toggle every currently-visible (post-search) row. */
  onToggleAllVisible?: (visibleIds: string[]) => void
  error?: string
  emptyLabel?: string
}

/**
 * Detailed, searchable asset picker table (Item name/code, Serial No.,
 * Condition) shared by the single Assign dialog (radio, one row) and the Bulk
 * Assign dialog (checkboxes, many rows). Mirrors the request-side FulfilDialog
 * so all three pickers look and feel identical.
 */
export default function AssetPickerTable({
  assets, selectedIds, onSelect, multiple = false, onToggleAllVisible, error,
  emptyLabel = "No available assets to assign.",
}: Props) {
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const visible = q
    ? assets.filter(
        (a) =>
          a.itemName.toLowerCase().includes(q) ||
          a.itemCode.toLowerCase().includes(q) ||
          a.serialNumber.toLowerCase().includes(q) ||
          (a.category?.name ?? "").toLowerCase().includes(q) ||
          (a.baseCategory?.name ?? "").toLowerCase().includes(q),
      )
    : assets

  const selectedSet = new Set(selectedIds)
  const allVisibleSelected = visible.length > 0 && visible.every((a) => selectedSet.has(a.id))

  return (
    <div className={cn("rounded-lg border overflow-hidden", error ? "border-red-300" : "border-gray-200")}>
      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code or serial…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white"
          />
        </div>
        {multiple && onToggleAllVisible && visible.length > 0 && (
          <button type="button" onClick={() => onToggleAllVisible(visible.map((a) => a.id))}
            className="px-2 py-1.5 text-[11px] font-medium text-accent-600 hover:bg-accent-50 rounded whitespace-nowrap">
            {allVisibleSelected ? "Clear" : "Select all"}
          </button>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="w-10 px-3 py-2" />
              <th className="text-left px-3 py-2 font-semibold">Item</th>
              <th className="text-left px-3 py-2 font-semibold">Category</th>
              <th className="text-left px-3 py-2 font-semibold">Serial No.</th>
              <th className="text-left px-3 py-2 font-semibold">Condition</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-gray-400">
                  {assets.length === 0 ? emptyLabel : "No assets match your search."}
                </td>
              </tr>
            ) : (
              visible.map((a) => {
                const selected = selectedSet.has(a.id)
                return (
                  <tr
                    key={a.id}
                    onClick={() => onSelect(a.id)}
                    className={cn(
                      "cursor-pointer border-t border-gray-100 transition-colors",
                      selected ? "bg-accent-50" : "hover:bg-gray-50",
                    )}
                  >
                    <td className="px-3 py-2.5 text-center">
                      {multiple ? (
                        <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded border", selected ? "border-accent-600 bg-accent-600" : "border-gray-300")}>
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </span>
                      ) : (
                        <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full border", selected ? "border-accent-600 bg-accent-600" : "border-gray-300")}>
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-800">{a.itemName}</p>
                      <p className="font-mono text-[10px] text-gray-400">{a.itemCode}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-700">{a.category?.name ?? "—"}</p>
                      <p className="text-[10px] text-gray-400">{a.baseCategory?.name ?? ""}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-600">{a.serialNumber}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", CONDITION_STYLES[a.condition] ?? "bg-gray-100 text-gray-600")}>
                        {a.condition}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
