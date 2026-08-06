"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { Skeleton } from "@/components/hrms/skeleton";
import { Pagination, type PaginationProps } from "@/components/hrms/pagination";

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T, index: number) => React.ReactNode;
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
  /** Optional extra action buttons rendered before Edit in each row's action cell. */
  extraActions?: (item: T) => React.ReactNode;
  /** Optional server-side pager rendered under the table. */
  pagination?: PaginationProps;
  /**
   * Whether the caller may Add/Edit/Delete — defaults to true so every
   * existing caller keeps working unchanged. Pass the page's write-permission
   * check (e.g. `hasPermission("hrms.org.write")`) to hide these actions for a
   * view-only user instead of letting them click through to a backend 403.
   */
  canManage?: boolean;
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
  extraActions,
  pagination,
  canManage = true,
}: CrudTableProps<T>) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-base font-semibold text-gray-900">{title}</h1>
        {canManage && (
          <button onClick={onAdd} className="btn btn-primary">
            <Plus size={13} /> Add new
          </button>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full ds-control !pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <table className="ds-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th className="text-right w-24">Actions</th>
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
              description={search ? `No results for "${search}". Try a different search or add a new entry.` : canManage ? `No ${title.toLowerCase()} yet. Click Add new to get started.` : `No ${title.toLowerCase()} yet.`}
              action={canManage ? <button onClick={onAdd} className="btn btn-primary"><Plus size={13} /> Add new</button> : undefined}
              className="border-0 shadow-none"
            />
          </div>
        ) : (
          <table className="ds-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th className="text-right w-24">Actions</th>
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
                    <td key={col.key}>
                      {col.render
                        ? col.render(item, i)
                        : String((item as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {extraActions?.(item)}
                      {canManage && (
                        <>
                          <button
                            onClick={() => onEdit(item)}
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-[#22c55e] rounded-lg hover:bg-green-50"
                          >
                            <Pencil size={12} />
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
                              className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pagination && !isLoading && data.length > 0 && <Pagination {...pagination} />}
      </div>
    </div>
  );
}
