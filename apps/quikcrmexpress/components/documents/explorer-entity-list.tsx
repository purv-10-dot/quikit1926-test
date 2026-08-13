"use client";

import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";
import type { ExplorerEntityDto } from "@/lib/services/document-folders/types";

interface Props {
  entities: ExplorerEntityDto[];
  onOpen: (navKey: string) => void;
}

export function ExplorerEntityList({ entities, onOpen }: Props) {
  if (entities.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-crm-muted">
        No records with documents or folders in this module yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-crm-border rounded-lg border border-crm-border bg-white">
      {entities.map((e) => (
        <li key={`${e.refType}:${e.refId}`}>
          <div className="flex items-center gap-2 px-4 py-3 hover:bg-[var(--color-bg-secondary)]">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => onOpen(e.navKey)}
            >
              <Folder size={18} className="shrink-0 text-accent-600" />
              <span className="truncate font-medium text-crm-text">{e.label}</span>
              <ChevronRight size={16} className="ml-auto shrink-0 text-crm-muted" />
            </button>
            <Link
              href={e.href}
              className="shrink-0 text-xs text-crm-blue hover:underline"
              onClick={(ev) => ev.stopPropagation()}
            >
              View record
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
