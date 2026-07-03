"use client";

import type { LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/portal/widgets";

/**
 * Structured placeholder for portal sections whose backend isn't wired yet.
 * Renders the real layout (header + feature cards) so navigation, RBAC, and UX
 * are demoable, with each capability clearly marked as the next build step.
 */
export function PortalPlaceholder({ title, description, icon: Icon, features }: {
  title: string; description?: string; icon?: LucideIcon; features: { title: string; detail: string }[];
}) {
  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title={title} description={description} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
              <h3 className="text-sm font-semibold">{f.title}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{f.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
