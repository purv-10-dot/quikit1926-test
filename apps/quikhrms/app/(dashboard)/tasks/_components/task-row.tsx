"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { Check, AlertTriangle, Trash2 } from "lucide-react";
import { clsx } from "clsx";

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
  jobTitle: string | null;
}

export interface TaskRowData {
  id: string;
  title: string;
  description: string | null;
  status: "Open" | "InProgress" | "Completed" | "Cancelled";
  priority: "Low" | "Normal" | "High" | "Urgent";
  dueDate: string | null;
  groupKey: string | null;
  taskList: { id: string; name: string; color: string | null } | null;
  assignee: Employee | null;
  requester: Employee | null;
  requestedForEmployee: Employee | null;
}

interface Props {
  task: TaskRowData;
  onClick: () => void;
  active?: boolean;
  index?: number;
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return new Date(due).getTime() < Date.now();
}

const PRIORITY_STYLES: Record<TaskRowData["priority"], string> = {
  Low: "bg-gray-100 text-gray-600",
  Normal: "bg-green-50 text-green-700",
  High: "bg-orange-50 text-orange-700",
  Urgent: "bg-red-50 text-red-700",
};

export function TaskRow({ task, onClick, active, index }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();

  const completeMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/tasks/${task.id}/complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks", "detail", task.id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/tasks/${task.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks", "detail", task.id] });
      toast.success("Todo deleted", task.title);
    },
  });

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await dialog.confirm({
      title: "Delete todo?",
      description: `"${task.title}" will be removed.`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (ok) deleteMut.mutate();
  };

  const isComplete = task.status === "Completed";
  const overdue = !isComplete && isOverdue(task.dueDate);

  return (
    <tr
      onClick={onClick}
      className={clsx(
        "row-stagger border-b border-gray-50 cursor-pointer transition group",
        active ? "bg-amber-50/60" : "hover:bg-gray-50",
      )}
      style={index != null ? { ["--i" as never]: Math.min(index, 10) } : undefined}
    >
      <td className="py-2.5 px-4 w-10">
        <button
          onClick={(e) => { e.stopPropagation(); completeMut.mutate(); }}
          disabled={completeMut.isPending}
          className={clsx(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition",
            isComplete ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 hover:border-emerald-500",
          )}
          title={isComplete ? "Reopen" : "Mark complete"}
        >
          {isComplete && <Check size={11} strokeWidth={3} />}
        </button>
      </td>
      <td className="py-2.5 px-4">
        <p className={clsx("text-[13px] font-semibold truncate max-w-[280px]", isComplete ? "text-gray-400 line-through" : "text-gray-900")}>
          {task.title}
        </p>
      </td>
      <td className="py-2.5 px-4 align-top">
        {task.description ? (
          <p
            className={clsx(
              "text-xs whitespace-pre-wrap break-words line-clamp-3 max-w-[420px]",
              isComplete ? "text-gray-400 line-through" : "text-gray-800",
            )}
            title={task.description}
          >
            {task.description}
          </p>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="py-2.5 px-4">
        <span className={clsx("inline-block px-2 py-0.5 text-[11px] font-medium rounded", PRIORITY_STYLES[task.priority])}>
          {task.priority}
        </span>
      </td>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-1.5">
          {overdue && <AlertTriangle size={12} className="text-amber-500" />}
          <span className={clsx("text-xs", overdue ? "text-amber-700 font-semibold" : "text-gray-700")}>
            {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-IN") : "—"}
          </span>
        </div>
      </td>
      <td className="py-2.5 px-4 w-10 text-right">
        <button
          onClick={handleDelete}
          disabled={deleteMut.isPending}
          title="Delete todo"
          className="p-1.5 rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
}
