"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { EmptyState } from "@/components/hrms/empty-state";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";
import { ShieldCheck, Check, X, MessageSquare, Megaphone, Heart, ThumbsUp } from "lucide-react";
import { clsx } from "clsx";

type Tab = "announcement" | "post" | "recognition" | "feedback";

interface EmployeeMini {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  profilePhoto: string | null;
}

interface BaseItem {
  id: string;
  approvalStatus: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  rejectionReason: string | null;
}

interface AnnouncementItem extends BaseItem {
  title: string;
  content: string;
  author: EmployeeMini;
}

interface PostItem extends BaseItem {
  content: string;
  type: string;
  employee: EmployeeMini;
}

interface RecognitionItem extends BaseItem {
  message: string;
  type: string;
  badge: string | null;
  fromEmployee: EmployeeMini;
  toEmployee: EmployeeMini;
}

interface FeedbackItem extends BaseItem {
  message: string;
  type: string;
  category: string;
  isPublic: boolean;
  fromEmployee: EmployeeMini;
  toEmployee: EmployeeMini;
}

const TABS: { value: Tab; label: string; icon: React.ReactNode }[] = [
  { value: "announcement", label: "Announcements", icon: <Megaphone size={14} /> },
  { value: "post", label: "Posts", icon: <MessageSquare size={14} /> },
  { value: "recognition", label: "Recognition", icon: <ThumbsUp size={14} /> },
  { value: "feedback", label: "Feedback", icon: <Heart size={14} /> },
];

function fullName(e: EmployeeMini) {
  return `${e.firstName} ${e.lastName}`.trim();
}

export default function EngagementApprovalsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get("tab") as Tab) ?? "announcement";
  const [tab, setTab] = useState<Tab>(tabParam);
  const [statusFilter, setStatusFilter] = useState<"Pending" | "Approved" | "Rejected">("Pending");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Announcements / Posts / Recognition are gated by hrms.engage.approve;
  // Feedback moderation is a separate grant (hrms.feedback.approve).
  const { hasPermission, navKeys, permissions } = useDashboardConfig();
  const canEngage = hasPermission("hrms.engage.approve");
  const canFeedback = hasPermission("hrms.feedback.approve");

  // Per-approval navigation allow-list (mirrors the sidebar). Default-allow — a
  // role with no configured navKeys (or super-admin) sees every approval type
  // its permissions allow. Legacy "engage.approvals" key grants all four.
  const isSuper = permissions.includes("*");
  const navSet = new Set(navKeys);
  const navConfigured = !isSuper && navSet.size > 0;
  const legacyAll = navSet.has("engage.approvals");
  const navAllowed = (key: string) => !navConfigured || legacyAll || navSet.has(key);

  const tabAllowed = (t: Tab) => (t === "feedback" ? canFeedback : canEngage) && navAllowed(`engage.approvals.${t}`);
  const visibleTabs = TABS.filter((t) => tabAllowed(t.value));

  // Snap to the first permitted tab if the current one isn't allowed.
  useEffect(() => {
    if (!tabAllowed(tab) && visibleTabs.length > 0) setTab(visibleTabs[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canEngage, canFeedback]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    router.replace(`/engage/approvals?${params.toString()}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["engage-approvals", tab, statusFilter],
    queryFn: () =>
      api.get<(AnnouncementItem | PostItem | RecognitionItem | FeedbackItem)[]>(
        `/api/v1/hrms/engage/approvals?type=${tab}&status=${statusFilter}`,
      ),
    staleTime: 30_000,
  });
  const items = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const actMut = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "approve" | "reject"; reason?: string }) =>
      api.post(`/api/v1/hrms/engage/approvals/${tab}/${id}`, { action, reason }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["engage-approvals"] });
      toast.success(vars.action === "approve" ? "Approved" : "Rejected");
    },
  });

  const onApprove = (id: string) => actMut.mutate({ id, action: "approve" });
  const onReject = async (id: string) => {
    const reason = await dialog.promptText({
      title: "Reject this item?",
      description: "Author will be notified. Reason is optional.",
      variant: "danger",
      confirmLabel: "Reject",
      placeholder: "e.g. inappropriate tone",
    });
    if (reason === null) return; // cancelled
    actMut.mutate({ id, action: "reject", reason: reason || undefined });
  };

  if (visibleTabs.length === 0) {
    return (
      <EmptyState
        variant="folder"
        title="You don't have approval access"
        description="Content and feedback moderation is restricted. Contact your administrator if you need access."
      />
    );
  }

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900">Engagement & Feedback Approvals</h1>
            <p className="text-xs text-gray-500 mt-1">Moderate content before it goes live.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-4 overflow-x-auto">
          {visibleTabs.map((t) => (
            <button
              key={t.value}
              onClick={() => switchTab(t.value)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-1 py-3 text-[13px] font-semibold border-b-2 transition -mb-px whitespace-nowrap",
                tab === t.value
                  ? "border-[#22c55e] text-[#22c55e] font-semibold"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-4">
        {(["Pending", "Approved", "Rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={clsx(
              "px-3 py-1 text-[11px] rounded-full font-semibold border transition",
              statusFilter === s
                ? "bg-green-600 text-white border-[#166534]"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
            )}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{items.length} items</span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-1">
          <EmptyState
            variant="bot"
            title={`No ${statusFilter.toLowerCase()} ${tab}s`}
            description={statusFilter === "Pending" ? "Nothing waiting for moderation. ✓" : ""}
            className="border border-gray-200 shadow-sm"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {pageItems.map((item, i) => (
            <ItemCard
              key={item.id}
              type={tab}
              item={item}
              statusFilter={statusFilter}
              onApprove={() => onApprove(item.id)}
              onReject={() => onReject(item.id)}
              disabled={actMut.isPending}
              idx={i}
            />
          ))}
          <Pagination page={page} totalPages={totalPages} total={items.length} limit={PAGE_SIZE} onPageChange={setPage} className="border-t-0 px-0" />
        </div>
      )}
    </div>
  );
}

function ItemCard({
  type,
  item,
  statusFilter,
  onApprove,
  onReject,
  disabled,
  idx,
}: {
  type: Tab;
  item: AnnouncementItem | PostItem | RecognitionItem | FeedbackItem;
  statusFilter: "Pending" | "Approved" | "Rejected";
  onApprove: () => void;
  onReject: () => void;
  disabled: boolean;
  idx?: number;
}) {
  const tone =
    item.approvalStatus === "Pending"
      ? "border-amber-200 bg-amber-50/30"
      : item.approvalStatus === "Approved"
        ? "border-emerald-200 bg-emerald-50/30"
        : "border-red-200 bg-red-50/30";

  return (
    <div className={clsx("row-stagger border rounded-lg p-4 shadow-sm bg-white", tone)} style={{ ["--i" as never]: Math.min(idx ?? 0, 10) }}>
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          {type === "announcement" && (
            <>
              <h3 className="text-[13px] font-semibold text-gray-900 mb-1">{(item as AnnouncementItem).title}</h3>
              <p className="text-xs text-gray-700 line-clamp-4 whitespace-pre-wrap">{(item as AnnouncementItem).content}</p>
              <p className="text-xs text-gray-500 mt-2">
                By {fullName((item as AnnouncementItem).author)} · {new Date(item.createdAt).toLocaleString("en-IN")}
              </p>
            </>
          )}
          {type === "post" && (
            <>
              <p className="text-xs text-gray-700 line-clamp-4 whitespace-pre-wrap">{(item as PostItem).content}</p>
              <p className="text-xs text-gray-500 mt-2">
                By {fullName((item as PostItem).employee)} · {(item as PostItem).type} · {new Date(item.createdAt).toLocaleString("en-IN")}
              </p>
            </>
          )}
          {type === "recognition" && (
            <>
              <p className="text-[13px] font-semibold">
                <span className="font-semibold text-gray-900">{fullName((item as RecognitionItem).fromEmployee)}</span>
                <span className="text-gray-500"> → </span>
                <span className="font-semibold text-gray-900">{fullName((item as RecognitionItem).toEmployee)}</span>
              </p>
              <p className="text-xs text-gray-700 mt-1 line-clamp-3">{(item as RecognitionItem).message}</p>
              <p className="text-xs text-gray-500 mt-2">
                {(item as RecognitionItem).type}
                {(item as RecognitionItem).badge && ` · 🏅 ${(item as RecognitionItem).badge}`}
                {" · "}
                {new Date(item.createdAt).toLocaleString("en-IN")}
              </p>
            </>
          )}
          {type === "feedback" && (
            <>
              <p className="text-[13px] font-semibold">
                <span className="font-semibold text-gray-900">{fullName((item as FeedbackItem).fromEmployee)}</span>
                <span className="text-gray-500"> → </span>
                <span className="font-semibold text-gray-900">{fullName((item as FeedbackItem).toEmployee)}</span>
                <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-700">
                  {(item as FeedbackItem).type}
                </span>
                {(item as FeedbackItem).isPublic && (
                  <span className="ml-1 inline-block px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-700">Public</span>
                )}
              </p>
              <p className="text-xs text-gray-700 mt-1 line-clamp-4 whitespace-pre-wrap">{(item as FeedbackItem).message}</p>
              <p className="text-xs text-gray-500 mt-2">
                {(item as FeedbackItem).category} · {new Date(item.createdAt).toLocaleString("en-IN")}
              </p>
            </>
          )}
          {item.rejectionReason && (
            <p className="text-xs text-red-700 mt-2 bg-red-50 border border-red-200 rounded px-2 py-1">
              Reason: {item.rejectionReason}
            </p>
          )}
        </div>
        {statusFilter === "Pending" && (
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={onApprove}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-normal bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-40"
            >
              <Check size={12} /> Approve
            </button>
            <button
              onClick={onReject}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-normal bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-40"
            >
              <X size={12} /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
