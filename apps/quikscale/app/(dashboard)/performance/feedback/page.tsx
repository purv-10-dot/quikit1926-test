"use client";

/**
 * Continuous Feedback — /performance/feedback
 *
 * R10h: lightweight peer/manager/upward feedback drops. Inbox-style UI
 * with tabs: Received / Given / Compose. Each entry has a category
 * (kudos/coaching/concern/general) and a visibility (private/shared).
 */

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ChevronLeft, ThumbsUp, MessageCircle, AlertTriangle, MessageSquare,
  Trash2, Lock, Share2,
} from "lucide-react";
import {
  useFeedback,
  useCreateFeedback,
  useDeleteFeedback,
} from "@/lib/hooks/useFeedback";
import { useUsers } from "@/lib/hooks/useUsers";
import { AddButton, useConfirm } from "@quikit/ui";
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type FeedbackVisibility,
} from "@/lib/schemas/feedbackSchema";

interface FeedbackRow {
  id: string;
  fromUserId: string;
  toUserId: string;
  category: FeedbackCategory;
  visibility: FeedbackVisibility;
  content: string;
  createdAt: string;
  fromUser: { id: string; firstName: string; lastName: string };
  toUser: { id: string; firstName: string; lastName: string };
}

const CATEGORY_CONFIG: Record<
  FeedbackCategory,
  { icon: React.ElementType; color: string; label: string }
> = {
  kudos: {
    icon: ThumbsUp,
    color: "bg-green-50 text-green-700 border-green-200",
    label: "Kudos",
  },
  coaching: {
    icon: MessageCircle,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Coaching",
  },
  concern: {
    icon: AlertTriangle,
    color: "bg-red-50 text-red-700 border-red-200",
    label: "Concern",
  },
  general: {
    icon: MessageSquare,
    color: "bg-gray-50 text-gray-700 border-gray-200",
    label: "General",
  },
};

type Tab = "received" | "given";

export default function FeedbackPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id as string | undefined;
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>("received");
  const { data, isLoading, error } = useFeedback(
    tab === "received" ? { toUserId: userId } : { fromUserId: userId },
  );
  const { data: users = [] } = useUsers();
  const createFeedback = useCreateFeedback();
  const deleteFeedback = useDeleteFeedback();

  const entries = (data as FeedbackRow[] | undefined) ?? [];

  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    toUserId: "",
    category: "kudos" as FeedbackCategory,
    visibility: "private" as FeedbackVisibility,
    content: "",
  });

  function openCompose() {
    setForm({
      toUserId: "",
      category: "kudos",
      visibility: "private",
      content: "",
    });
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate() {
    if (!form.toUserId) {
      setFormError("Select a recipient");
      return;
    }
    if (!form.content.trim()) {
      setFormError("Write something");
      return;
    }
    setFormError(null);
    try {
      await createFeedback.mutateAsync({
        toUserId: form.toUserId,
        category: form.category,
        visibility: form.visibility,
        content: form.content.trim(),
      });
      setShowModal(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to send");
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete this feedback?", description: "This cannot be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    await deleteFeedback.mutateAsync(id);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/performance/cycle"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Cycle
        </Link>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Feedback</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Lightweight peer feedback — kudos, coaching, and concerns. Feeds into reviews.
            </p>
          </div>
          <AddButton onClick={openCompose}>Give Feedback</AddButton>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 -mb-4">
          {(["received", "given"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-accent-600 text-accent-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "received" ? "Received" : "Given"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-3xl mx-auto space-y-2">
          {isLoading && (
            <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
          )}
          {error && (
            <div className="text-sm text-red-600 text-center py-12">
              Error: {(error as Error).message}
            </div>
          )}
          {!isLoading && entries.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
              <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {tab === "received"
                  ? "No feedback received yet."
                  : "You haven't given any feedback yet."}
              </p>
            </div>
          )}
          {entries.map((e) => (
            <FeedbackCard
              key={e.id}
              entry={e}
              tab={tab}
              canDelete={tab === "given"}
              onDelete={() => handleDelete(e.id)}
            />
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Give feedback</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  To *
                </label>
                <select
                  value={form.toUserId}
                  onChange={(e) => setForm({ ...form, toUserId: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white"
                >
                  <option value="">Select recipient…</option>
                  {users
                    .filter((u) => u.id !== userId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Category
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {FEEDBACK_CATEGORIES.map((c) => {
                    const cfg = CATEGORY_CONFIG[c];
                    const Icon = cfg.icon;
                    const active = form.category === c;
                    return (
                      <button
                        key={c}
                        onClick={() => setForm({ ...form, category: c })}
                        className={`flex flex-col items-center gap-1 py-2 rounded border text-[10px] font-medium transition-colors ${
                          active
                            ? `${cfg.color} border-current`
                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Visibility
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm({ ...form, visibility: "private" })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded border text-xs font-medium transition-colors ${
                      form.visibility === "private"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <Lock className="h-3 w-3" /> Private
                  </button>
                  <button
                    onClick={() => setForm({ ...form, visibility: "shared" })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded border text-xs font-medium transition-colors ${
                      form.visibility === "shared"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <Share2 className="h-3 w-3" /> Shared with manager
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={5}
                  placeholder="What would you like to share?"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createFeedback.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
              >
                {createFeedback.isPending ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackCard({
  entry,
  tab,
  canDelete,
  onDelete,
}: {
  entry: FeedbackRow;
  tab: Tab;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const cfg = CATEGORY_CONFIG[entry.category];
  const Icon = cfg.icon;
  const other = tab === "received" ? entry.fromUser : entry.toUser;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center border flex-shrink-0 ${cfg.color}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-900">
              {tab === "received" ? "From" : "To"} {other.firstName} {other.lastName}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border ${cfg.color}`}
            >
              {cfg.label}
            </span>
            {entry.visibility === "shared" && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Share2 className="h-2.5 w-2.5" /> shared
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
          <p className="text-[10px] text-gray-400 mt-2">
            {new Date(entry.createdAt).toLocaleDateString()}
          </p>
        </div>
        {canDelete && (
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-50 text-red-500 flex-shrink-0"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
