"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clsx } from "clsx";

interface PageShellProps {
  children: React.ReactNode;
  width?: "narrow" | "default" | "wide" | "full";
  className?: string;
}

const W: Record<NonNullable<PageShellProps["width"]>, string> = {
  narrow: "max-w-3xl",
  default: "max-w-[1200px]",
  wide: "max-w-[1400px]",
  full: "max-w-[1600px]",
};

export function PageShell({ children, width = "default", className }: PageShellProps) {
  return (
    <div className={clsx("mx-auto px-6 py-6", W[width], className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  back?: { href: string; label?: string };
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, icon, back, actions }: PageHeaderProps) {
  return (
    <>
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6] mb-4">
          <ChevronLeft size={14} /> {back.label ?? "Back"}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-start gap-3">
          {icon && <div className="text-[#3b82f6] mt-1.5">{icon}</div>}
          <div>
            <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900 leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </>
  );
}

export function SectionCard({ title, description, actions, children, padding = "default" }: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padding?: "none" | "default" | "tight";
}) {
  return (
    <div className="surface-card overflow-hidden">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            {title && <h2 className="text-sm font-bold text-gray-900">{title}</h2>}
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={clsx(padding === "none" ? "" : padding === "tight" ? "p-3" : "p-5")}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 px-6">
      {icon && <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-[#3b82f6] mb-4">{icon}</div>}
      <p className="text-base font-bold text-gray-900">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status, tone }: { status: string; tone?: "blue" | "green" | "amber" | "red" | "gray" | "purple" }) {
  const map = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-700",
    purple: "bg-violet-100 text-violet-700",
  };
  return (
    <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-semibold", map[tone ?? "gray"])}>
      {status}
    </span>
  );
}
