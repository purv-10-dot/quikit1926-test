"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import {
  ArrowLeft,
  LifeBuoy,
  Send,
  Lock,
  Paperclip,
  Upload,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Activity,
  X,
  FileText,
} from "lucide-react";
import { clsx } from "clsx";

interface EmployeeMini {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
}

interface Comment {
  id: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  user: EmployeeMini;
}

interface Attachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
}

function fmtBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface ActivityItem {
  id: string;
  action: string;
  fromVal: string | null;
  toVal: string | null;
  isSystem: boolean;
  createdAt: string;
  actor: EmployeeMini | null;
}

interface TicketDetail {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: "Open" | "InProgress" | "OnHold" | "Resolved" | "Closed" | "Reopened" | "Cancelled";
  source: string;
  createdAt: string;
  slaResolveDueAt: string | null;
  slaResponseDueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenCount: number;
  responseBreachedAt: string | null;
  resolveBreachedAt: string | null;
  escalationLevel: number;
  resolutionNote: string | null;
  category: { id: string; name: string; slug: string } | null;
  department: { id: string; name: string; code: string | null } | null;
  raisedBy: EmployeeMini;
  assignedTo: EmployeeMini | null;
  comments: Comment[];
  attachments: Attachment[];
  activities: ActivityItem[];
}

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-gray-100 text-gray-700",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-yellow-100 text-yellow-700",
  OnHold: "bg-gray-100 text-gray-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-gray-200 text-gray-600",
  Reopened: "bg-purple-100 text-purple-700",
  Cancelled: "bg-red-100 text-red-700",
};

function formatName(e: EmployeeMini | null): string {
  if (!e) return "Unassigned";
  return `${e.firstName} ${e.lastName}`;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();

  const { data: meData } = useQuery({
    queryKey: ["employees", "me"],
    queryFn: () => api.get<{ id: string }>("/api/v1/hrms/employees/me"),
    staleTime: 60_000,
  });
  const myEmployeeId = meData?.data?.id ?? null;

  const [tab, setTab] = useState<"comments" | "activity" | "attachments">(
    "comments"
  );
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api.get<TicketDetail>(`/api/v1/hrms/tickets/${id}`),
  });
  const ticket = data?.data;

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v1/hrms/tickets/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const commentMut = useMutation({
    mutationFn: (body: { message: string; isInternal: boolean }) =>
      api.post(`/api/v1/hrms/tickets/${id}/comments`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      setNewComment("");
      setIsInternal(false);
    },
  });

  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      setUploadError(null);
      const fd = new FormData();
      fd.append("file", file);
      const upload = await api.upload<{
        url: string;
        fileName: string;
        fileType: string;
        fileSize: number;
      }>("/api/v1/hrms/uploads", fd);
      return api.post(`/api/v1/hrms/tickets/${id}/attachments`, {
        fileUrl: upload.data.url,
        fileName: upload.data.fileName,
        fileType: upload.data.fileType,
        fileSize: upload.data.fileSize,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket", id] }),
    onError: (e: Error) => setUploadError(e.message ?? "Upload failed"),
  });

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    commentMut.mutate({ message: newComment, isInternal });
  };

  const handleFilePick = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => uploadMut.mutate(f));
  };

  if (isLoading) return <div className="text-gray-500 py-12 text-center">Loading...</div>;
  if (!ticket) return <div className="text-gray-500 py-12 text-center">Not found</div>;

  const isOverdue =
    ticket.slaResolveDueAt &&
    !["Resolved", "Closed", "Cancelled"].includes(ticket.status) &&
    new Date(ticket.slaResolveDueAt).getTime() < Date.now();

  const canEditProps =
    !!myEmployeeId && ticket.assignedTo?.id === myEmployeeId;

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-2">
              <LifeBuoy size={16} className="text-[#3b82f6]" />
              <span className="font-mono text-sm text-gray-600">{ticket.ticketNo}</span>
              <span
                className={clsx(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  STATUS_COLORS[ticket.status]
                )}
              >
                {ticket.status}
              </span>
              <span
                className={clsx(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  PRIORITY_COLORS[ticket.priority]
                )}
              >
                {ticket.priority}
              </span>
              {ticket.responseBreachedAt && !ticket.firstResponseAt && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 flex items-center gap-1">
                  <AlertCircle size={12} /> Response SLA Breached
                </span>
              )}
              {ticket.resolveBreachedAt && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertCircle size={12} /> Resolve SLA Breached
                </span>
              )}
              {!ticket.resolveBreachedAt && isOverdue && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertCircle size={12} /> Overdue
                </span>
              )}
              {ticket.escalationLevel > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                  Escalated L{ticket.escalationLevel}
                </span>
              )}
              {ticket.reopenCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                  Reopened ×{ticket.reopenCount}
                </span>
              )}
            </div>
            <h1 className="font-serif-display text-2xl font-bold text-gray-900 mb-3">
              {ticket.title}
            </h1>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {ticket.description}
            </p>
            {ticket.resolutionNote && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-green-800 mb-1">
                  <CheckCircle2 size={14} /> Resolution
                </div>
                <p className="text-sm text-green-700 whitespace-pre-wrap">
                  {ticket.resolutionNote}
                </p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex border-b border-gray-200">
              <TabBtn
                active={tab === "comments"}
                onClick={() => setTab("comments")}
                icon={<MessageSquare size={14} />}
                label={`Comments (${ticket.comments.length})`}
              />
              <TabBtn
                active={tab === "activity"}
                onClick={() => setTab("activity")}
                icon={<Activity size={14} />}
                label={`Activity (${ticket.activities.length})`}
              />
              <TabBtn
                active={tab === "attachments"}
                onClick={() => setTab("attachments")}
                icon={<Paperclip size={14} />}
                label={`Files (${ticket.attachments.length})`}
              />
            </div>

            <div className="p-4">
              {tab === "comments" && (
                <div className="space-y-3">
                  {ticket.comments.length === 0 ? (
                    <div className="text-center text-gray-400 py-6 text-sm">
                      No comments yet
                    </div>
                  ) : (
                    ticket.comments.map((c) => (
                      <div
                        key={c.id}
                        className={clsx(
                          "rounded-lg p-3 border",
                          c.isInternal
                            ? "bg-yellow-50 border-yellow-200"
                            : "bg-gray-50 border-gray-200"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {formatName(c.user)}
                          </span>
                          {c.isInternal && (
                            <span className="px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded text-xs flex items-center gap-1">
                              <Lock size={10} /> Internal
                            </span>
                          )}
                          <span className="text-xs text-gray-500 ml-auto">
                            {fmtDate(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {c.message}
                        </p>
                      </div>
                    ))
                  )}

                  <form onSubmit={handleAddComment} className="pt-3 border-t border-gray-100">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                        />
                        Internal note (only visible to agents)
                      </label>
                      <button
                        type="submit"
                        disabled={commentMut.isPending || !newComment.trim()}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#16243A] text-white rounded-lg text-sm hover:bg-[#2563eb] disabled:opacity-50"
                      >
                        <Send size={14} /> Send
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {tab === "activity" && (
                <div className="space-y-2">
                  {ticket.activities.length === 0 ? (
                    <div className="text-center text-gray-400 py-6 text-sm">
                      No activity
                    </div>
                  ) : (
                    ticket.activities.map((a) => (
                      <div key={a.id} className="text-sm flex items-start gap-2 py-1">
                        <Activity size={12} className="text-gray-400 mt-1" />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">
                            {a.isSystem ? "🤖 System" : formatName(a.actor)}
                          </span>{" "}
                          <span className="text-gray-600">
                            {a.action}
                            {a.fromVal && a.toVal && (
                              <>
                                {": "}
                                <span className="line-through">{a.fromVal}</span>
                                {" → "}
                                <span>{a.toVal}</span>
                              </>
                            )}
                            {!a.fromVal && a.toVal && <>: {a.toVal}</>}
                          </span>
                          <div className="text-xs text-gray-400">
                            {fmtDate(a.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "attachments" && (
                <div className="space-y-3">
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-600 hover:border-[#3b82f6] hover:text-[#3b82f6] cursor-pointer transition-colors">
                    <Upload size={16} />
                    {uploadMut.isPending ? "Uploading..." : "Click to upload (PDF, image, doc — max 10MB)"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={uploadMut.isPending}
                      onChange={(e) => {
                        handleFilePick(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {uploadError && (
                    <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                      <span className="flex-1">{uploadError}</span>
                      <button onClick={() => setUploadError(null)} className="hover:text-red-900">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {ticket.attachments.length === 0 ? (
                    <div className="text-center text-gray-400 py-6 text-sm">
                      No attachments yet
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {ticket.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={a.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded border border-gray-100 group"
                        >
                          <FileText size={16} className="text-gray-400 group-hover:text-[#3b82f6]" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-blue-600 group-hover:underline truncate">
                              {a.fileName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {a.fileType ?? "file"}
                              {a.fileSize ? ` · ${fmtBytes(a.fileSize)}` : ""}
                              {" · "}
                              {fmtDate(a.createdAt)}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Properties</h3>

            {canEditProps ? (
              <>
                <Field label="Status">
                  <Select
                    value={ticket.status}
                    onChange={(v) => updateMut.mutate({ status: v })}
                    options={[
                      { value: "Open", label: "Open" },
                      { value: "InProgress", label: "In Progress" },
                      { value: "OnHold", label: "On Hold" },
                      { value: "Resolved", label: "Resolved" },
                      { value: "Closed", label: "Closed" },
                      { value: "Reopened", label: "Reopened" },
                      { value: "Cancelled", label: "Cancelled" },
                    ]}
                  />
                </Field>

                <Field label="Priority">
                  <Select
                    value={ticket.priority}
                    onChange={(v) => updateMut.mutate({ priority: v })}
                    options={[
                      { value: "Low", label: "Low" },
                      { value: "Medium", label: "Medium" },
                      { value: "High", label: "High" },
                      { value: "Urgent", label: "Urgent" },
                    ]}
                  />
                </Field>

                <Field label="Assigned To">
                  <EmployeeSelect
                    value={ticket.assignedTo?.id ?? ""}
                    onChange={(empId) =>
                      updateMut.mutate({ assignedToId: empId || null })
                    }
                    placeholder="Unassigned"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Status">
                  <span
                    className={clsx(
                      "inline-block px-2 py-1 rounded-full text-xs font-medium",
                      STATUS_COLORS[ticket.status]
                    )}
                  >
                    {ticket.status}
                  </span>
                </Field>
                <Field label="Priority">
                  <span
                    className={clsx(
                      "inline-block px-2 py-1 rounded-full text-xs font-medium",
                      PRIORITY_COLORS[ticket.priority]
                    )}
                  >
                    {ticket.priority}
                  </span>
                </Field>
                <Field label="Assigned To">
                  <div className="text-sm text-gray-900">
                    {formatName(ticket.assignedTo)}
                  </div>
                </Field>
                <div className="flex items-start gap-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                  <Lock size={12} className="mt-0.5 shrink-0" />
                  <span>Only the assignee can edit these fields. You can still comment and view activity.</span>
                </div>
              </>
            )}

            <div className="pt-3 border-t border-gray-100 space-y-2 text-sm">
              <Row label="Department" value={ticket.department?.name ?? ticket.category?.name ?? "—"} />
              <Row label="Raised By" value={formatName(ticket.raisedBy)} />
              <Row label="Source" value={ticket.source} />
              <Row label="Created" value={fmtDate(ticket.createdAt)} />
              {ticket.slaResolveDueAt && (
                <Row
                  label="SLA Due"
                  value={fmtDate(ticket.slaResolveDueAt)}
                  valueClass={isOverdue ? "text-red-600 font-medium" : ""}
                />
              )}
              {ticket.firstResponseAt && (
                <Row label="First Response" value={fmtDate(ticket.firstResponseAt)} />
              )}
              {ticket.resolvedAt && (
                <Row label="Resolved" value={fmtDate(ticket.resolvedAt)} />
              )}
              {ticket.closedAt && (
                <Row label="Closed" value={fmtDate(ticket.closedAt)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-[#3b82f6] text-[#3b82f6]"
          : "border-transparent text-gray-600 hover:text-gray-900"
      )}
    >
      {icon} {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-2 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={clsx("text-gray-900 text-right", valueClass)}>{value}</span>
    </div>
  );
}
