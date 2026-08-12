import { requireUser } from "@/lib/auth/require";
import { LeadKanban } from "@/components/leads/lead-kanban";
import { LeadsTabBar } from "@/components/leads/leads-tab-bar";
import { KanbanTotalBadge } from "@/components/leads/kanban-total-badge";
import { buildKanbanBoard } from "@/lib/services/leads/kanban";

// Per-tenant page — must NEVER be statically pre-rendered or cached. Already
// implicitly dynamic via `requireUser()` (cookie read), but explicit beats
// implicit and protects against future framework changes.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KanbanPage() {
  const user = await requireUser();
  const buckets = await buildKanbanBoard({ user, perStage: 100 });
  const total = buckets.reduce((sum, b) => sum + b.total, 0);

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 flex-col gap-3">
      <LeadsTabBar />
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <div>
          <h2 className="text-base font-semibold text-crm-text">Pipeline</h2>
          <p className="text-xs text-crm-muted">
            Drag cards between stages to transition. Columns scroll vertically when full.
          </p>
        </div>
        <KanbanTotalBadge initialTotal={total} />
      </div>
      <div className="min-h-0 flex-1">
        <LeadKanban buckets={buckets} />
      </div>
    </div>
  );
}
