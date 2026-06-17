"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { X, Check, MoreVertical, Send, Trash2, Calendar, User } from "lucide-react";
import { clsx } from "clsx";

interface Activity {
  id: string;
  type: "created" | "comment" | "status" | "assigned" | "due_date" | "completed";
  content: string | null;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; profilePhoto: string | null } | null;
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: "Open" | "InProgress" | "Completed" | "Cancelled";
  priority: "Low" | "Normal" | "High" | "Urgent";
  dueDate: string | null;
  groupKey: string | null;
  taskList: { id: string; name: string; color: string | null } | null;
  assignee: { id: string; firstName: string; lastName: string; profilePhoto: string | null; jobTitle: string | null } | null;
  requester: { id: string; firstName: string; lastName: string; profilePhoto: string | null } | null;
  activity: Activity[];
}

interface Props {
  taskId: string | null;
  onClose: () => void;
}

function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-IN");
}

export function DetailDrawer({ taskId, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showMenu, setShowMenu] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "detail", taskId],
    queryFn: () => api.get<TaskDetail>(`/api/v1/hrms/tasks/${taskId}`),
    enabled: !!taskId,
  });
  const task = data?.data;

  const completeMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/tasks/${taskId}/complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", "detail", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/tasks/${taskId}`),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });
  const commentMut = useMutation({
    mutationFn: (content: string) => api.post(`/api/v1/hrms/tasks/${taskId}/comments`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", "detail", taskId] }),
  });

  const [comment, setComment] = useState("");

  if (!taskId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-40"
      />
      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-full md:w-[480px] bg-white z-50 shadow-2xl flex flex-col">
        {isLoading || !task ? (
          <div className="p-6 text-sm text-gray-500">Loading…</div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <button
                onClick={() => completeMut.mutate()}
                disabled={completeMut.isPending}
                className={clsx(
                  "btn btn-sm",
                  task.status === "Completed" ? "btn-secondary" : "btn-primary",
                )}
              >
                <Check size={13} /> {task.status === "Completed" ? "Reopen" : "Mark complete"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMenu((s) => !s)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
                >
                  <MoreVertical size={16} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
                >
                  <X size={16} />
                </button>
                {showMenu && (
                  <div className="absolute right-12 top-12 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                    <button
                      onClick={() => { setShowMenu(false); if (confirm("Delete this task?")) deleteMut.mutate(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={12} /> Delete task
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Body scroll */}
            <div className="flex-1 overflow-y-auto">
              {/* Title */}
              <div className="px-5 pt-5 pb-3">
                <h2 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">{task.title}</h2>
                {task.taskList && (
                  <span
                    className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 text-[11px] font-semibold rounded"
                    style={{ background: (task.taskList.color ?? "#dbeafe") + "33", color: task.taskList.color ?? "#1e40af" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: task.taskList.color ?? "#3b82f6" }} />
                    {task.taskList.name}
                  </span>
                )}
              </div>

              {/* Meta */}
              <div className="px-5 py-3 space-y-3 border-t border-gray-100">
                <Meta label="Assignee" icon={<User size={12} />}>
                  {task.assignee ? (
                    <div className="flex items-center gap-2">
                      <MiniAvatar e={task.assignee} />
                      <span className="text-sm text-gray-900 font-medium">{task.assignee.firstName} {task.assignee.lastName}</span>
                    </div>
                  ) : <span className="text-sm text-gray-400">—</span>}
                </Meta>
                <Meta label="Due Date" icon={<Calendar size={12} />}>
                  <span className="text-sm text-gray-900">{task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-IN") : "—"}</span>
                </Meta>
                {task.requester && (
                  <Meta label="Requested by" icon={<User size={12} />}>
                    <div className="flex items-center gap-2">
                      <MiniAvatar e={task.requester} />
                      <span className="text-sm text-gray-900">{task.requester.firstName} {task.requester.lastName}</span>
                    </div>
                  </Meta>
                )}
              </div>

              {/* Description */}
              {task.description && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{task.description}</p>
                </div>
              )}

              {/* Activity */}
              <div className="px-5 py-3 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Activity</p>
                <div className="space-y-3">
                  {task.activity.map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      {a.author ? <MiniAvatar e={a.author} /> : <div className="w-6 h-6 rounded-full bg-gray-200" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs">
                          <span className="font-semibold text-gray-900">{a.author ? `${a.author.firstName} ${a.author.lastName}` : "System"}</span>
                          <span className="text-gray-400 ml-2">{timeAgo(a.createdAt)}</span>
                        </p>
                        <p className={clsx("mt-0.5", a.type === "comment" ? "text-sm text-gray-700 bg-gray-50 rounded px-2 py-1.5" : "text-xs text-gray-500")}>
                          {a.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Comment input */}
            <div className="border-t border-gray-100 p-3 bg-gray-50/50">
              <form
                onSubmit={(e) => { e.preventDefault(); if (comment.trim()) { commentMut.mutate(comment); setComment(""); } }}
                className="flex items-center gap-2"
              >
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 border border-[var(--border)] rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                />
                <button type="submit" disabled={!comment.trim() || commentMut.isPending} className="btn btn-primary btn-icon">
                  <Send size={13} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Meta({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 inline-flex items-center gap-1.5 w-24 shrink-0">{icon} {label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function MiniAvatar({ e }: { e: { firstName: string; lastName: string; profilePhoto: string | null } }) {
  if (e.profilePhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={e.profilePhoto} alt="" className="w-6 h-6 rounded-full object-cover" />
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#2563eb] flex items-center justify-center text-white text-[10px] font-bold">
      {e.firstName[0]}{e.lastName[0]}
    </div>
  );
}
