"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  CheckSquare,
  Bug,
  BookOpen,
  ListTree,
} from "lucide-react";
import { SkeletonList } from "@/components/skeleton";

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-600" },
  SUBTASK: { Icon: ListTree, color: "text-blue-500" },
};

interface ChildIssue {
  id: string;
  key: string;
  title: string;
  type: string;
  status?: { name: string; category: string } | null;
}

function statusPillClass(category?: string) {
  if (category === "DONE") return "bg-green-100 text-green-700";
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
}

/**
 * "Child work items" section for the EPIC issue view. Lists every non-subtask
 * issue whose `epicId` points at this epic. Mirrors the Subtasks section's
 * collapsible chrome — empty state shows "Add child work item".
 */
export function ChildWorkItems({
  epicId,
  projectId,
}: {
  epicId: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<ChildIssue[] | null>(null);

  useEffect(() => {
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&epicId=${encodeURIComponent(epicId)}&excludeType=SUBTASK&limit=100&expand=true`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setItems(
            (j.data ?? []).map((i: ChildIssue) => ({
              id: i.id,
              key: i.key,
              title: i.title,
              type: i.type,
              status: i.status,
            })),
          );
        } else {
          setItems([]);
        }
      })
      .catch(() => setItems([]));
  }, [epicId, projectId]);

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Child work items
        </button>
        {open && (items?.length ?? 0) > 0 && (
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Add child work item"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div>
          {items === null ? (
            <SkeletonList rows={3} />
          ) : items.length === 0 ? (
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-gray-800 px-2 -mx-2 py-1 block text-left"
            >
              Add child work item
            </button>
          ) : (
            <ul className="border border-gray-200 rounded-md divide-y divide-gray-100">
              {items.map((c) => {
                const T = TYPE_ICON[c.type] ?? TYPE_ICON.TASK!;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/spaces/${projectId}/work/${c.id}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <T.Icon className={`h-4 w-4 shrink-0 ${T.color}`} />
                      <span className="font-medium text-blue-600 hover:underline shrink-0">
                        {c.key}
                      </span>
                      <span className="text-gray-800 truncate flex-1">{c.title}</span>
                      {c.status && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${statusPillClass(c.status.category)}`}
                        >
                          {c.status.name}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
