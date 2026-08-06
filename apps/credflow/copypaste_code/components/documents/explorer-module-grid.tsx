"use client";

import {
  Briefcase,
  Building2,
  FileText,
  Folder,
  Globe,
  Package,
  UserPlus,
} from "lucide-react";
import type { ExplorerModuleDto } from "@/lib/services/document-folders/types";
import type { ExplorerModuleKey } from "@/lib/services/document-folders/explorer-location";
const ICONS: Record<ExplorerModuleKey, typeof Folder> = {
  lead: UserPlus,
  account: Building2,
  opportunity: Briefcase,
  quote: FileText,
  order: Package,
  global: Globe,
};

interface Props {
  modules: ExplorerModuleDto[];
  onOpen: (navKey: string) => void;
}

export function ExplorerModuleGrid({ modules, onOpen }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
      {modules.map((m) => {
        const Icon = ICONS[m.module];
        return (
          <button
            key={m.module}
            type="button"
            onClick={() => onOpen(m.navKey)}
            className="flex flex-col items-center gap-2 rounded-lg border border-crm-border bg-white p-5 text-center transition hover:border-accent-300 hover:bg-accent-50/40"
          >
            <Icon size={28} className="text-accent-600" />
            <span className="text-sm font-semibold text-crm-text">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
