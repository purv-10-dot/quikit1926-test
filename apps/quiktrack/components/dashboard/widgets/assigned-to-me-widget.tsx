"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  ListTree,
  Equal,
  ChevronUp,
  ChevronDown as ChevronDownArrow,
  ChevronsUp,
  ChevronsDown,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { SkeletonList } from "@/components/skeleton";

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-600" },
  EPIC: { Icon: Zap, color: "text-purple-500" },
  SUBTASK: { Icon: ListTree, color: "text-blue-500" },
};

const PRIORITY_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  HIGHEST: { Icon: ChevronsUp, color: "text-red-600" },
  HIGH: { Icon: ChevronUp, color: "text-red-500" },
  MEDIUM: { Icon: Equal, color: "text-amber-500" },
  LOW: { Icon: ChevronDownArrow, color: "text-blue-500" },
  LOWEST: { Icon: ChevronsDown, color: "text-blue-400" },
};

interface IssueRow {
  id: string;
  key: string;
  title: string;
  type: string;
  priority?: string;
  projectId: string;
}

export function AssignedToMeWidget({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const [rows, setRows] = useState<IssueRow[] | null>(null);

  useEffect(() => {
    if (!me) return;
    void fetch(`/api/search?assigneeIds=${encodeURIComponent(me)}&limit=10`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setRows(j.data?.issues ?? []);
        else setRows([]);
      })
      .catch(() => setRows([]));
  }, [me, refreshKey]);

  if (rows === null) {
    return (
      <div className="p-4">
        <SkeletonList rows={5} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="p-5 text-sm text-gray-400 text-center">
        No work items assigned to you.
      </div>
    );
  }

  const cols = "grid grid-cols-[28px_minmax(80px,100px)_1fr_60px]";

  return (
    <div className="border-t border-gray-100">
      <div
        className={`${cols} px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600 border-b border-gray-200`}
      >
        <div>T</div>
        <div>Key</div>
        <div>Summary</div>
        {/* <div className="text-right inline-flex items-center justify-end gap-0.5">
          P <ChevronDown className="h-3 w-3" />
        </div> */}
      </div>
      <ul>
        {rows.map((i) => {
          const T = TYPE_ICON[i.type] ?? TYPE_ICON.TASK!;
          const P = i.priority ? PRIORITY_ICON[i.priority] : null;
          return (
            <li key={i.id}>
              <Link
                href={`/spaces/${i.projectId}/work/${i.id}`}
                className={`${cols} items-center px-4 py-1.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-b-0`}
              >
                <T.Icon className={`h-4 w-4 ${T.color}`} />
                <span className="text-blue-600 font-medium">{i.key}</span>
                <span className="text-blue-600 hover:underline truncate">{i.title}</span>
                <span className="text-right">
                  {P ? <P.Icon className={`h-4 w-4 inline ${P.color}`} /> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-2 text-[12px] text-gray-700 border-t border-gray-200">
        <span className="font-semibold">1–{rows.length}</span> of {rows.length}
      </div>
      <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500 inline-flex items-center gap-1">
        <RotateCcw className="h-3 w-3" />
        Last refreshed just now
      </div>
    </div>
  );
}
