"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BreadcrumbItem } from "@/lib/services/document-folders/types";

interface Props {
  items: BreadcrumbItem[];
  onNavigate: (navKey: string | null) => void;
}

export function FolderBreadcrumbs({ items, onNavigate }: Props) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-crm-muted" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.navKey ?? item.id ?? "root"}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight size={14} className="shrink-0 text-crm-muted/70" />}
          {item.href && i < items.length - 1 ? (
            <Link href={item.href} className="hover:text-accent-700 hover:underline">
              {item.name}
            </Link>
          ) : (
            <button
              type="button"
              className={
                i === items.length - 1
                  ? "font-medium text-crm-text"
                  : "hover:text-accent-700 hover:underline"
              }
              onClick={() => onNavigate(item.navKey ?? (item.id === null ? "root" : item.id))}
            >
              {item.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
