"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { Skeleton } from "@/components/hrms/skeleton";

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface CrudTableProps<T extends { id: string }> {
  title: string;
  data: T[];
  columns: Column<T>[];
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (item: T) => void;
  onDelete: (id: string) => void;
  searchPlaceholder?: string;
  search: string;
  onSearchChange: (v: string) => void;
}

export function CrudTable<T extends { id: string }>({
  title,
  data,
  columns,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  searchPlaceholder = "Search...",
  search,
  onSearchChange,
}: CrudTableProps<T>) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">{title}</h1>
        <button onClick={onAdd} className="btn btn-primary">
          <Plus size={14} /> Add new
        </button>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-[#3b82f6]"
            />
          </div>
        </div>

        {isLoading ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    {col.label}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, r) => (
                <tr key={r} className="border-b border-gray-50">
                  {columns.map((col, c) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4" rounded="sm" style={{ width: `${50 + ((r + c) * 13) % 40}%` }} />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Skeleton className="w-7 h-7" rounded="md" />
                      <Skeleton className="w-7 h-7" rounded="md" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              variant="search"
              title="No items found"
              description={search ? `No results for "${search}". Try a different search or add a new entry.` : `No ${title.toLowerCase()} yet. Click Add new to get started.`}
              action={<button onClick={onAdd} className="btn btn-primary"><Plus size={14} /> Add new</button>}
              className="border-0 shadow-none"
            />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    {col.label}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr
                  key={item.id}
                  className="row-stagger border-b border-gray-50 hover:bg-gray-50/50"
                  style={{ ["--i" as never]: Math.min(i, 10) }}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-gray-700">
                      {col.render
                        ? col.render(item)
                        : String((item as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(item)}
                        className="p-1.5 text-gray-400 hover:text-[#3b82f6] rounded hover:bg-blue-50"
                      >
                        <Pencil size={14} />
                      </button>
                      {deleteId === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { onDelete(item.id); setDeleteId(null); }}
                            className="btn btn-danger btn-sm"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteId(null)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteId(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
