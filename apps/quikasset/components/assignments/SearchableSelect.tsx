"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Search, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string; sublabel?: string }

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  error?: string
  disabled?: boolean
  columnHeaders?: { label: string; sublabel: string }
}

export default function SearchableSelect({
  options, value, onChange, placeholder = "Select…", searchPlaceholder = "Search…", error, disabled, columnHeaders,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setQuery("") }}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors",
          error ? "border-red-300" : "border-gray-200",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-300",
          !selected ? "text-gray-400" : "text-gray-800"
        )}
      >
        <span className="flex-1 text-left truncate">
          {selected ? (
            <>
              <span>{selected.label}</span>
              {selected.sublabel && <span className="text-gray-400 ml-1">— {selected.sublabel}</span>}
            </>
          ) : placeholder}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
          </div>
          {columnHeaders && (
            <div className="flex items-center px-3 py-1.5 bg-gray-50 border-b border-gray-100">
              <h4 className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{columnHeaders.label}</h4>
              <h4 className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{columnHeaders.sublabel}</h4>
              <span className="w-3" />
            </div>
          )}
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-xs text-gray-400 text-center">No results</li>
            ) : filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setQuery("") }}
                  className={cn(
                    "w-full flex items-center px-3 py-2 text-xs hover:bg-accent-50 transition-colors",
                    o.value === value ? "bg-accent-50 text-accent-700" : "text-gray-700"
                  )}
                >
                  {columnHeaders ? (
                    <>
                      <span className="flex-1 text-left font-medium truncate">{o.label}</span>
                      <span className="flex-1 text-left text-gray-400 truncate">{o.sublabel ?? "—"}</span>
                    </>
                  ) : (
                    <span className="flex-1 text-left">
                      <span className="font-medium">{o.label}</span>
                      {o.sublabel && <span className="text-gray-400 ml-1">— {o.sublabel}</span>}
                    </span>
                  )}
                  {o.value === value && <Check className="w-3 h-3 text-accent-600 flex-shrink-0 ml-1" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
