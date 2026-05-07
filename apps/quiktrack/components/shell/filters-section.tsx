"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Filter,
  Search,
  ChevronRight,
  ChevronDown,
  ListFilter,
} from "lucide-react";

const DEFAULT_FILTERS = [
  { id: "my-open", label: "My open work items" },
  { id: "reported-by-me", label: "Reported by me" },
  { id: "all", label: "All work items" },
  { id: "open", label: "Open work items" },
  { id: "done", label: "Done work items" },
  { id: "viewed-recently", label: "Viewed recently" },
  { id: "created-recently", label: "Created recently" },
  { id: "resolved-recently", label: "Resolved recently" },
  { id: "updated-recently", label: "Updated recently" },
] as const;

/**
 * Sidebar "Filters" entry. Click the header to expand the dropdown of default
 * saved filters; clicking a leaf navigates to /filters/<id>. The "Search work
 * items" row is the first child and routes to the All filter (search input
 * lives on the results page itself).
 */
export function FiltersSection() {
  const pathname = usePathname();
  const [open, setOpen] = useState(() => Boolean(pathname?.startsWith("/filters")));
  const [defaultsOpen, setDefaultsOpen] = useState(true);

  const isActive = (id: string) => pathname === `/filters/${id}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 h-8 text-sm rounded text-left text-gray-700 hover:bg-gray-100"
      >
        <Filter className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Filters</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="pt-0.5 space-y-0.5">
          <Link
            href="/filters/all"
            className="flex items-center gap-2 pl-9 pr-3 h-8 text-sm rounded text-gray-700 hover:bg-gray-100"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Search work items</span>
          </Link>

          <button
            type="button"
            onClick={() => setDefaultsOpen((v) => !v)}
            className="w-full flex items-center gap-2 pl-6 pr-3 h-8 text-sm rounded text-left text-gray-700 hover:bg-gray-100"
          >
            {defaultsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            )}
            <span className="flex-1 truncate font-medium text-gray-700">Default filters</span>
          </button>

          {defaultsOpen && (
            <div className="space-y-0.5">
              {DEFAULT_FILTERS.map((f) => {
                const active = isActive(f.id);
                return (
                  <Link
                    key={f.id}
                    href={`/filters/${f.id}`}
                    className={`flex items-center gap-2 pl-9 pr-3 h-8 text-sm rounded ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <ListFilter className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="flex-1 truncate">{f.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          <Link
            href="/filters/all"
            className="flex items-center gap-2 pl-9 pr-3 h-8 text-sm rounded text-gray-700 hover:bg-gray-100"
          >
            <ListFilter className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">View all filters</span>
          </Link>
        </div>
      )}
    </div>
  );
}
