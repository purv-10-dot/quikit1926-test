"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  key: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial || tabs[0]?.key);
  return (
    <div>
      <div className="flex gap-1 border-b border-crm-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={
              "border-b-2 px-4 py-2 text-sm transition " +
              (active === t.key
                ? "border-crm-blue text-crm-blue-dark font-medium"
                : "border-transparent text-crm-muted hover:text-crm-text")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
