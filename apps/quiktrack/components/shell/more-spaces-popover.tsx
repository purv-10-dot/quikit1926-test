"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ListIcon } from "lucide-react";
import { SpaceIcon } from "@/components/space-icon";

interface SpaceItem {
  id: string;
  name: string;
  projectKey?: string;
  icon?: string | null;
  color?: string | null;
  updatedAt?: string;
}

export function MoreSpacesPopover({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}) {
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/projects?sort=updatedAt&order=desc")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) setSpaces(j.data ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spaces;
    return spaces.filter((s) => s.name.toLowerCase().includes(q));
  }, [spaces, search]);

  const recent = filtered.slice(0, 4);
  const other = filtered.slice(4);

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.top, left: r.right + 4 });
  }, [open, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      style={{ top: pos?.top, left: pos?.left }}
      className="fixed w-[400px] bg-white border border-gray-200 rounded-md shadow-xl z-50"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="text-sm font-semibold text-gray-900">Projects</div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all projects"
            className="w-full h-9 pl-8 pr-3 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto py-2">
        {recent.length > 0 && (
          <>
            <div className="px-4 pt-1 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
              Recent
            </div>
            {recent.map((s) => (
              <Link
                key={s.id}
                href={`/spaces/${s.projectKey ?? s.id}/backlog`}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-800 hover:bg-gray-50"
              >
                <SpaceIcon icon={s.icon} name={s.name} color={s.color} size={20} radius={6} />
                <span className="truncate">{s.name}</span>
              </Link>
            ))}
          </>
        )}
        {other.length > 0 && (
          <>
            <div className="px-4 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
              Other
            </div>
            {other.map((s) => (
              <Link
                key={s.id}
                href={`/spaces/${s.projectKey ?? s.id}/backlog`}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-800 hover:bg-gray-50"
              >
                <SpaceIcon icon={s.icon} name={s.name} color={s.color} size={20} radius={6} />
                <span className="truncate">{s.name}</span>
              </Link>
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-gray-500">
            No projects match.
          </div>
        )}
      </div>

      <div className="border-t border-gray-100">
        <Link
          href="/spaces"
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ListIcon className="h-4 w-4 text-gray-500" />
          View all projects
        </Link>
      </div>
    </div>
  );
}
