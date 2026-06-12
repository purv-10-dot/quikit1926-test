"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function LeadEmptyState({ icon: Icon, title, description, actionLabel, onAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-crm-border bg-crm-panel/30 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-crm-border">
        <Icon className="h-7 w-7 text-crm-muted" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-crm-text">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-crm-muted">{description}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
