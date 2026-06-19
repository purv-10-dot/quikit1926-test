"use client";

import type React from "react";
import { SpaceIcon } from "@/components/space-icon";
import { avatarTint, initials } from "./resource-report-bits";

export interface ProjectRef {
  id: string;
  name: string;
  projectKey: string;
  color: string | null;
  icon: string | null;
}
export interface UserRef {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
export interface StatusRef {
  id: string;
  name: string;
  color: string;
  category: string;
}
export interface Task {
  id: string;
  key: string;
  title: string;
  type: string;
  project: ProjectRef | null;
  status: StatusRef | null;
  assignee: UserRef | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  etaHours: number;
  actualHours: number;
}

export function formatH(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0";
  return h.toFixed(2).replace(/\.?0+$/, "");
}

export function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function monthInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(s: string): string {
  if (!/^\d{4}-\d{2}$/.test(s)) return s;
  const [y, m] = s.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function ProjectTaskRow({
  task,
  index,
  onOpen,
}: {
  task: Task;
  index: number;
  onOpen: (id: string) => void;
}) {
  const overBudget = task.etaHours > 0 && task.actualHours > task.etaHours;
  const assigneeName = task.assignee?.name ?? "";
  return (
    <tr
      onClick={() => onOpen(task.id)}
      className="border-t border-gray-100 cursor-pointer hover:bg-blue-50/30 transition-colors"
    >
      <td className="px-4 py-2.5 text-gray-400 tabular-nums text-xs">{index + 1}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
            {task.key}
          </span>
          <span className="text-gray-900 font-medium truncate max-w-[320px]">{task.title}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="inline-flex items-center gap-2 text-gray-700 text-xs">
          {task.project ? (
            <SpaceIcon
              icon={task.project.icon}
              name={task.project.name}
              color={task.project.color}
              size={18}
              radius={5}
            />
          ) : null}
          <span className="truncate max-w-[160px]">{task.project?.name ?? "—"}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {task.assignee ? (
          <div className="inline-flex items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${avatarTint(assigneeName)}`}
            >
              {initials(assigneeName)}
            </span>
            <span className="text-gray-800 text-xs">{assigneeName}</span>
          </div>
        ) : (
          <span className="text-gray-400 text-xs italic">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
        {new Date(task.createdAt).toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {task.etaHours > 0 ? (
          <span className="text-gray-800 text-xs font-medium tabular-nums">{formatH(task.etaHours)}h</span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {task.actualHours > 0 ? (
          <span
            className={`text-xs font-medium tabular-nums ${overBudget ? "text-rose-600" : "text-gray-800"}`}
            title={overBudget ? "Over the estimated time" : undefined}
          >
            {formatH(task.actualHours)}h
          </span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {task.status ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: task.status.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: task.status.color }} />
            {task.status.name}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

export function ProjectRowSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={`sk-${i}`} className="border-t border-gray-100">
          <td className="px-4 py-2.5"><Bar w="w-4" /></td>
          <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Bar w="w-12" /><Bar w="w-48" /></div></td>
          <td className="px-4 py-2.5"><Bar w="w-24" /></td>
          <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="qt-shimmer block h-6 w-6 rounded-full" /><Bar w="w-20" /></div></td>
          <td className="px-4 py-2.5"><Bar w="w-20" /></td>
          <td className="px-4 py-2.5"><div className="flex justify-end"><Bar w="w-10" /></div></td>
          <td className="px-4 py-2.5"><div className="flex justify-end"><Bar w="w-10" /></div></td>
          <td className="px-4 py-2.5"><Bar w="w-16" /></td>
        </tr>
      ))}
    </>
  );
}

function Bar({ w }: { w: string }) {
  return <span className={`qt-shimmer inline-block h-3 rounded ${w}`} />;
}
