"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MoreHorizontal, SmilePlus, Pencil, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { sanitizeRichText } from "@/lib/sanitize";
import { uploadProjectImage } from "@/lib/upload-image";

/**
 * Comments tab for the idea detail panel (JPD). Composer (avatar + textarea +
 * Add/Cancel), a threaded list, and an empty state. Talks to
 * /api/projects/[id]/ideas/[ideaId]/comments. `onCountChange` bubbles the live
 * count so the panel's "Comments N" tab badge stays in sync.
 */

interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

interface CommentRow {
  id: string;
  body: string;
  parentId: string | null;
  authorName: string;
  createdBy: string | null;
  createdAt: string;
  reactions: Reaction[];
}

/** Quick-react bar emojis + a small extra set for the "⋯" picker (curated, not
 *  the full Unicode set). */
const QUICK_EMOJI = ["👍", "👏", "🔥", "❤️", "😮", "🤔"];
const MORE_EMOJI = [
  "😀", "😄", "😁", "😅", "😂", "🙂", "😉", "😊", "😍", "😎",
  "🤩", "🥳", "🙌", "🎉", "✅", "❌", "⚠️", "💡", "🚀", "👀",
  "🙏", "💯", "🤝", "👌", "😢", "😡", "😴", "🤯", "💪", "⭐",
];

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

/** Strip HTML tags/entities to test whether a rich-text value is really empty. */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function IdeaComments({
  projectId,
  ideaId,
  onCountChange,
}: {
  projectId: string;
  ideaId: string;
  onCountChange?: (n: number) => void;
}) {
  const base = `/api/projects/${projectId}/ideas/${ideaId}/comments`;
  const { data: session } = useSession();
  const meName = session?.user?.name || session?.user?.email || "You";
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false); // expanded editor open
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const meId = session?.user?.id ?? null;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(base);
      const json = (await res.json()) as { success: boolean; data?: CommentRow[] };
      if (json.success && json.data) {
        setComments(json.data);
        onCountChange?.(json.data.length);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ideaId]);

  async function add(body: string, parentId: string | null) {
    if (!plainText(body)) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId }),
      });
      if (res.ok) {
        setDraft(""); setReplyDraft(""); setReplyTo(null); setComposing(false);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`${base}/${id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (!plainText(editDraft)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editDraft }),
      });
      if (res.ok) { setEditingId(null); setEditDraft(""); await load(); }
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: CommentRow) { setEditingId(c.id); setEditDraft(c.body); }

  async function react(commentId: string, emoji: string) {
    // Optimistic toggle so the chip flips instantly.
    setComments((cs) => cs.map((c) => {
      if (c.id !== commentId) return c;
      const found = c.reactions.find((r) => r.emoji === emoji);
      let reactions: Reaction[];
      if (found) {
        const count = found.count + (found.mine ? -1 : 1);
        reactions = count <= 0
          ? c.reactions.filter((r) => r.emoji !== emoji)
          : c.reactions.map((r) => (r.emoji === emoji ? { ...r, count, mine: !r.mine } : r));
      } else {
        reactions = [...c.reactions, { emoji, count: 1, mine: true }];
      }
      return { ...c, reactions };
    }));
    await fetch(`${base}/${commentId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  }

  // Open the reply composer for `c`, prefilling a visual @mention of its author.
  function startReply(c: CommentRow) {
    setReplyTo(c.id);
    setReplyDraft(`<p><span class="qt-mention">@${c.authorName}</span>&nbsp;</p>`);
  }

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <div className="space-y-4">
      {/* Composer — collapsed input; clicking opens the full editor (name +
          rich-text toolbar + Add/Cancel), matching JPD. */}
      {!composing ? (
        <div className="flex items-start gap-2">
          <Avatar name={meName} />
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="min-h-[38px] flex-1 rounded border border-gray-200 px-3 py-2 text-left text-sm text-gray-400 hover:border-gray-300"
          >
            Add a comment…
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Avatar name={meName} />
            <span className="text-sm font-medium text-gray-900">{meName}</span>
          </div>
          <RichTextEditor
            value={draft}
            onChange={setDraft}
            placeholder="Add a comment…"
            uploadImage={(file) => uploadProjectImage(projectId, file)}
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled={busy || !plainText(draft)} onClick={() => void add(draft, null)} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Add
            </button>
            <button type="button" onClick={() => { setDraft(""); setComposing(false); }} className="text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List / empty state */}
      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
      ) : roots.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-gray-700">Be the first to comment</p>
          <p className="mt-1 text-sm text-gray-500">Add context, ask questions, or tag others.</p>
        </div>
      ) : (
        <ul className="space-y-6">
          {roots.map((c) => {
            const replies = repliesOf(c.id);
            const hasThread = replies.length > 0 || replyTo === c.id;
            return (
              <li key={c.id}>
                <CommentItem
                  c={c}
                  projectId={projectId}
                  mine={c.createdBy != null && c.createdBy === meId}
                  editing={editingId === c.id}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  busy={busy}
                  onSaveEdit={() => void saveEdit(c.id)}
                  onCancelEdit={() => { setEditingId(null); setEditDraft(""); }}
                  onStartEdit={() => startEdit(c)}
                  onDelete={() => void remove(c.id)}
                  onReact={(e) => void react(c.id, e)}
                  onReply={() => startReply(c)}
                />

                {/* Thread rail: replies + reply composer, each with an elbow.
                    The rail (vertical line) sits at the parent avatar's centre
                    (x=16px) and each row curves into its child avatar. */}
                {hasThread && (
                  <div className="mt-1">
                    <div className="space-y-4">
                      {replies.map((r) => (
                        <Elbow key={r.id}>
                          <CommentItem
                            c={r}
                            sm
                            projectId={projectId}
                            mine={r.createdBy != null && r.createdBy === meId}
                            editing={editingId === r.id}
                            editDraft={editDraft}
                            setEditDraft={setEditDraft}
                            busy={busy}
                            onSaveEdit={() => void saveEdit(r.id)}
                            onCancelEdit={() => { setEditingId(null); setEditDraft(""); }}
                            onStartEdit={() => startEdit(r)}
                            onDelete={() => void remove(r.id)}
                            onReact={(e) => void react(r.id, e)}
                            onReply={() => startReply(c)}
                          />
                        </Elbow>
                      ))}

                      {replyTo === c.id && (
                        <Elbow>
                          <div className="flex items-start gap-2">
                            <Avatar name={meName} sm />
                            <div className="min-w-0 flex-1">
                              <p className="mb-1 text-xs text-gray-500">Replying to {c.authorName}</p>
                              <RichTextEditor
                                value={replyDraft}
                                onChange={setReplyDraft}
                                placeholder="Reply…"
                                uploadImage={(file) => uploadProjectImage(projectId, file)}
                              />
                              <div className="mt-2 flex items-center gap-2">
                                <button type="button" disabled={busy || !plainText(replyDraft)} onClick={() => void add(replyDraft, c.id)} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                                  Reply
                                </button>
                                <button type="button" onClick={() => { setReplyTo(null); setReplyDraft(""); }} className="text-sm text-gray-500 hover:text-gray-700">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        </Elbow>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Wraps a threaded reply/composer. Draws a continuous vertical rail at the
 * parent avatar's centre (x=16px) plus a curved elbow into this child's avatar
 * (centre y≈14px). The vertical starts 1rem above (through the space-y gap), so
 * consecutive rows form one unbroken line that ends at the LAST child's elbow.
 */
function Elbow({ children }: { children: React.ReactNode }) {
  // The row is indented pl-8 (32px) so the child avatar starts at x=32, leaving a
  // 32px gutter on the LEFT for the connector. The rail sits at x=16 — the CENTRE
  // of the parent avatar (h-8=32px) directly above — so the line drops straight
  // down from the parent. Two plain divs (always render; no SVG/JIT quirks):
  //   • vertical rail at x=16, from 16px above (bridging the space-y-4 gap) down
  //     to the child avatar centre (~14px). Consecutive rows form one line that
  //     ends at the last reply's elbow.
  //   • curve: rounded bottom-left box from the rail (x16) to the avatar's left
  //     edge (x32) at the avatar centre (y≈14).
  return (
    <div className="relative pl-8">
      <span
        aria-hidden
        style={{ left: 16, top: -16, height: 30, width: 1 }}
        className="absolute bg-gray-200"
      />
      <span
        aria-hidden
        style={{ left: 16, top: 6, height: 8, width: 16 }}
        className="absolute rounded-bl-[8px] border-b border-l border-gray-200"
      />
      {children}
    </div>
  );
}

/** One comment (root or reply): avatar + head (name/link/time/⋯ menu) + body or
 *  edit box + reactions row. */
function CommentItem({
  c, sm, mine, editing, editDraft, setEditDraft, busy, projectId,
  onSaveEdit, onCancelEdit, onStartEdit, onDelete, onReact, onReply,
}: {
  c: CommentRow;
  sm?: boolean;
  mine: boolean;
  editing: boolean;
  editDraft: string;
  setEditDraft: (v: string) => void;
  busy: boolean;
  projectId: string;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
}) {
  return (
    <div className="group/comment flex items-start gap-2.5">
      <Avatar name={c.authorName} sm={sm} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1 leading-tight">
            <span className="text-sm font-medium text-gray-900">{c.authorName}</span>
            <p className="text-xs text-gray-400">{timeAgo(c.createdAt)}</p>
          </div>
          <CommentMenu mine={mine} onEdit={onStartEdit} onDelete={onDelete} />
        </div>

        {editing ? (
          <div className="mt-1">
            <RichTextEditor
              value={editDraft}
              onChange={setEditDraft}
              uploadImage={(file) => uploadProjectImage(projectId, file)}
            />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={busy || !plainText(editDraft)} onClick={onSaveEdit} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Save
              </button>
              <button type="button" onClick={onCancelEdit} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <CommentBody body={c.body} />
            <ReactionRow reactions={c.reactions} onReact={onReact} onReply={onReply} />
          </>
        )}
      </div>
    </div>
  );
}

/** The ⋯ actions dropdown: Edit (owner) / Copy link / Delete. */
function CommentMenu({ mine, onEdit, onDelete }: { mine: boolean; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative ml-auto">
      <button
        type="button"
        aria-label="Comment actions"
        onClick={() => setOpen((v) => !v)}
        className={`rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 ${open ? "bg-gray-100" : "opacity-0 group-hover/comment:opacity-100"}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl">
            {mine ? (
              <>
                <button type="button" onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50">
                  <Pencil className="h-4 w-4 text-gray-500" /> Edit
                </button>
                <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </>
            ) : (
              <p className="px-3 py-1.5 text-xs text-gray-400">No actions available</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Renders a comment's saved rich-text HTML (sanitized). The `.qt-mention`
 *  spans from the reply-prefill render as blue @mention pills via globals.css. */
function CommentBody({ body }: { body: string }) {
  return (
    <div
      className="qt-rich-body mt-0.5 text-sm text-gray-800 [&_a]:text-blue-600 [&_a]:underline [&_.qt-mention]:mr-0.5 [&_.qt-mention]:inline-block [&_.qt-mention]:rounded [&_.qt-mention]:bg-blue-500 [&_.qt-mention]:px-1.5 [&_.qt-mention]:py-0.5 [&_.qt-mention]:text-xs [&_.qt-mention]:font-medium [&_.qt-mention]:text-white"
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }}
    />
  );
}

/** Reply action + reaction chips + the quick-react / picker popover. */
function ReactionRow({
  reactions,
  onReact,
  onReply,
}: {
  reactions: Reaction[];
  onReact: (emoji: string) => void;
  onReply: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onReply} className="text-xs font-medium text-gray-500 hover:text-gray-700">
        Reply
      </button>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onReact(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
            r.mine ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
      <button type="button" aria-label="React" onClick={() => { setOpen((v) => !v); setShowMore(false); }} className="rounded border border-gray-200 p-1 text-gray-400 hover:bg-gray-50">
        <SmilePlus className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
            {!showMore ? (
              <div className="flex items-center gap-0.5">
                {QUICK_EMOJI.map((e) => (
                  <button key={e} type="button" onClick={() => { onReact(e); setOpen(false); }} className="grid h-8 w-8 place-items-center rounded text-lg hover:bg-gray-100">
                    {e}
                  </button>
                ))}
                <button type="button" aria-label="More emoji" onClick={() => setShowMore(true)} className="grid h-8 w-8 place-items-center rounded text-gray-400 hover:bg-gray-100">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="grid w-56 grid-cols-8 gap-0.5">
                {MORE_EMOJI.map((e) => (
                  <button key={e} type="button" onClick={() => { onReact(e); setOpen(false); }} className="grid h-7 w-7 place-items-center rounded text-base hover:bg-gray-100">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Round initials avatar. `sm` for the tighter reply size. */
function Avatar({ name, sm }: { name: string; sm?: boolean }) {
  return (
    <span
      className={`mt-0.5 grid shrink-0 place-items-center rounded-full bg-accent-600 font-medium text-white ${
        sm ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs"
      }`}
    >
      {initials(name)}
    </span>
  );
}

