"use client";

import { FileText, CheckSquare, GitBranch, Users, RefreshCw } from "lucide-react";

interface SidebarTemplate {
  key: string;
  title: string;
  description: string;
  Icon: React.ElementType;
  iconColor: string;
}

const POPULAR: SidebarTemplate[] = [
  {
    key: "blank",
    title: "Blank doc",
    description: "Start a doc from scratch.",
    Icon: FileText,
    iconColor: "text-blue-600",
  },
  {
    key: "product-requirements",
    title: "Product requirements",
    description: "Document product requirements and specifications.",
    Icon: CheckSquare,
    iconColor: "text-purple-600",
  },
  {
    key: "decision",
    title: "Decision",
    description: "Record important decisions and their rationale.",
    Icon: GitBranch,
    iconColor: "text-green-600",
  },
  {
    key: "meeting-notes",
    title: "Meeting notes",
    description: "Capture meeting discussions and action items.",
    Icon: Users,
    iconColor: "text-blue-600",
  },
  {
    key: "retrospective",
    title: "Retrospective",
    description: "Reflect on what went well and what to improve.",
    Icon: RefreshCw,
    iconColor: "text-amber-600",
  },
];

/**
 * Persistent right-side sidebar that's always visible on the Docs tab. Clicking
 * a template card creates a new doc seeded from that template and routes the
 * user into the editor.
 */
export function DocsTemplatesSidebar({
  busy,
  onCreate,
}: {
  busy?: boolean;
  onCreate: (templateKey: string) => void;
}) {
  return (
    <aside className="w-80 border-l border-gray-200 bg-gray-50 px-4 py-4 overflow-y-auto shrink-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Create a doc</h2>
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">
        POPULAR TEMPLATES
      </p>
      <div className="space-y-3">
        {POPULAR.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={busy}
            onClick={() => onCreate(t.key)}
            className="w-full text-left p-3 bg-white rounded-md border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 ${t.iconColor}`}>
                <t.Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {t.title}
                </h3>
                <p className="text-xs text-gray-500">{t.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
