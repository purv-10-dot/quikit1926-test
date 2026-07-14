import type { ReactNode } from "react";

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-page-title text-gray-900">{title}</h1>
          {subtitle && <p className="text-secondary text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
