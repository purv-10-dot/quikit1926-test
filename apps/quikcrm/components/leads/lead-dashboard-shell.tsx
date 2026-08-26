"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Pencil, Command } from "lucide-react";
import { LeadsTabBar } from "@/components/leads/leads-tab-bar";
import { LeadSummaryCard } from "@/components/leads/lead-summary-card";
import { LeadDetailTabs, type TabKey } from "@/components/leads/lead-detail-tabs";
import { LeadTrashedBanner } from "@/components/leads/lead-trashed-banner";
import {
  LeadDashboardHeader,
  type LeadDashboardHeaderLead,
} from "@/components/leads/lead-dashboard-header";
import { StagePipelineStepper } from "@/components/leads/dashboard/stage-pipeline-stepper";
import { AdvancedKpiSection } from "@/components/leads/dashboard/advanced-kpi-section";
import { AiInsightsCard } from "@/components/leads/dashboard/ai-insights-card";
import {
  QuickActionsPanel,
  QuickActionsMobileBar,
} from "@/components/leads/dashboard/quick-actions-panel";
import { QuickEditDrawer, type QuickEditLead } from "@/components/leads/dashboard/quick-edit-drawer";
import {
  LeadCommandPalette,
  useCommandPaletteShortcut,
} from "@/components/leads/dashboard/command-palette";
import { CommandQuickPickModal, type QuickPickKind } from "@/components/leads/dashboard/command-quick-pick-modal";
import { CommandAiResultModal } from "@/components/leads/dashboard/command-ai-result-modal";
import { CommandEmailModal } from "@/components/leads/dashboard/command-email-modal";
import { requestDocumentUpload } from "@/lib/documents/upload-request-event";
import type { ComposeEmailAccess } from "@/lib/services/leads/full-record";
import { buildLeadCommandActions } from "@/lib/leads/build-lead-command-actions";
import {
  buildConversionPrediction,
  buildFollowUpEmailDraft,
  buildLeadHealthAnalysis,
  buildLeadSummarySnippet,
  type LeadAiSnippetInput,
} from "@/lib/leads/command-ai-snippets";
import { resolvePipelineStage } from "@/lib/leads/pipeline-stage-resolve";
import { CallModal } from "@/components/telephony/call-modal";
import { ConvertLeadModal, type ConvertResult } from "@/components/leads/convert-lead-modal";
import { LeadCallDispositionModal } from "@/components/leads/call-disposition-modal";
import { TaskEditModal, type TaskFormSeed } from "@/components/tasks/task-edit-modal";
import { useToast } from "@/hooks/use-toast";
import type { LeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";
import type { LeadInsights } from "@/lib/services/leads/lead-insights";
import type { LeadAnalyticsBundle } from "@/lib/services/leads/lead-analytics";
import type { UnifiedTimelineSeed } from "@/components/leads/dashboard/unified-timeline";
import type {
  OverviewActivity,
  OverviewNote,
  OverviewOpportunity,
  OverviewTask,
} from "@/components/leads/lead-dashboard-overview";

export interface LeadDashboardShellProps {
  lead: LeadDashboardHeaderLead &
    QuickEditLead & {
      name: string;
      mobile: string | null;
      jobTitle: string | null;
      industry: string | null;
      website?: string | null;
      score: number;
      country?: string | null;
      accountId?: string | null;
      /** ICP reference + joined name. Displayed read-only; never edited here. */
      icpId?: string | null;
      icp?: { id: string; name: string } | null;
      dynamicFields?: Record<string, unknown> | null;
      updatedAt: string;
      company: string | null;
      // Contact information
      firstName?: string | null;
      lastName?: string | null;
      secondaryEmail?: string | null;
      contactLinkedinUrl?: string | null;
      // Company information
      linkedinUrl?: string | null;
      annualRevenueDisplay?: string | null;
      // Address
      addressLine1?: string | null;
      addressLine2?: string | null;
      cityName?: string | null;
      stateName?: string | null;
      postalCode?: string | null;
      lat?: number | null;
      long?: number | null;
    };
  snapshot: LeadDashboardSnapshot;
  insights: LeadInsights;
  analytics: LeadAnalyticsBundle;
  pipelineStages: string[];
  pipelineStatuses: string[];
  timelineSeed: UnifiedTimelineSeed;
  overview: {
    activities: OverviewActivity[];
    tasks: OverviewTask[];
    notes: OverviewNote[];
    opportunities: OverviewOpportunity[];
  };
  dispositionSections: { id: string; code: string; label: string }[];
  composeEmail: ComposeEmailAccess;
  deletedAt: string | null;
  isTrashed: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canLogActivity: boolean;
}

export function LeadDashboardShell(props: LeadDashboardShellProps) {
  const {
    lead: initialLead,
    snapshot,
    insights,
    analytics,
    pipelineStages,
    pipelineStatuses,
    timelineSeed,
    overview,
    dispositionSections,
    composeEmail,
    deletedAt,
    isTrashed,
    isAdmin,
    canEdit,
    canLogActivity,
  } = props;

  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [lead, setLead] = useState(initialLead);

  useEffect(() => {
    if (searchParams.get("created") === "1") {
      toast.rich(
        "Lead Created Successfully",
        "The lead has been added and is now available in your pipeline.",
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("created");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  // Log activity is now a dedicated page (/activities/log). Navigate there with
  // the lead pre-linked (+ source/stage/owner badges) instead of opening a modal.
  const goLogActivity = useCallback(() => {
    const qs = new URLSearchParams({
      relatedKind: "Lead",
      relatedObjectId: lead.id,
      label: lead.name,
    });
    if (lead.source) qs.set("source", lead.source);
    if (lead.stage) qs.set("stage", lead.stage);
    if (lead.ownerName) qs.set("ownerName", lead.ownerName);
    router.push(`/activities/log?${qs.toString()}`);
  }, [router, lead.id, lead.name, lead.source, lead.stage, lead.ownerName]);
  const [callOpen, setCallOpen] = useState(false);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [pickKind, setPickKind] = useState<QuickPickKind | null>(null);
  const [pickSaving, setPickSaving] = useState(false);
  const [aiModal, setAiModal] = useState<{
    title: string;
    body: string;
    copyLabel?: string;
  } | null>(null);
  const [taskSeed, setTaskSeed] = useState<TaskFormSeed | undefined>();
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);

  useCommandPaletteShortcut(() => setCmdOpen(true));

  const loadOwners = useCallback(() => {
    void fetch("/api/users/picker", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        const items = Array.isArray(j?.items) ? j.items : [];
        setOwners(items.map((u: { id: string; label?: string; name?: string }) => ({
          id: u.id,
          name: u.label ?? u.name ?? u.id,
        })));
      })
      .catch(() => {});
  }, []);

  const phone = lead.phone ?? lead.mobile;
  const email = composeEmail.to ?? lead.email;

  const aiInput: LeadAiSnippetInput = useMemo(
    () => ({
      name: lead.name,
      company: lead.company ?? lead.account?.name ?? null,
      stage: lead.stage,
      status: lead.status,
      source: lead.source,
      ownerName: lead.ownerName,
      score: lead.score,
      insights,
      activitiesCount: snapshot.activitiesCount,
      openTasks: snapshot.openTasks,
    }),
    [lead, insights, snapshot.activitiesCount, snapshot.openTasks],
  );

  const copyText = useCallback(
    async (text: string | null | undefined, label: string) => {
      const v = text?.trim();
      if (!v) {
        toast.error(`No ${label} on file`);
        return;
      }
      try {
        await navigator.clipboard.writeText(v);
        toast.success(`${label} copied`);
      } catch {
        toast.error(`Could not copy ${label}`);
      }
    },
    [toast],
  );

  const applyTransition = useCallback(
    async (body: { stage?: string; status?: string }) => {
      const res = await fetch(`/api/leads/${lead.id}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      if (body.stage) setLead((l) => ({ ...l, stage: body.stage! }));
      if (body.status) setLead((l) => ({ ...l, status: body.status! }));
      router.refresh();
    },
    [lead.id, router],
  );

  const quickHandlers = {
    onCall: () => {
      if (!phone) {
        toast.error("No phone number");
        return;
      }
      setCallOpen(true);
    },
    onEmail: () => setEmailOpen(true),
    onNote: () => setActiveTab("notes"),
    onTask: () => {
      setTaskSeed({
        subject: "",
        relatedKind: "Lead",
        relatedObjectId: lead.id,
        leadId: lead.id,
        assignedToUserId: lead.ownerId,
      });
      setTaskOpen(true);
    },
    onLogActivity: () => {
      goLogActivity();
    },
    onConvert: () => setConvertOpen(true),
  };

  function scheduleFollowUpSeed(): TaskFormSeed {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return {
      subject: `Follow up — ${lead.name}`,
      relatedKind: "Lead",
      relatedObjectId: lead.id,
      leadId: lead.id,
      assignedToUserId: lead.ownerId,
      dueDate: d.toISOString(),
      priority: "Medium",
    };
  }

  const commandActions = useMemo(
    () =>
      buildLeadCommandActions({
        onNavigateTab: setActiveTab,
        onClose: () => setCmdOpen(false),
        onQuickEdit: () => {
          loadOwners();
          setEditOpen(true);
        },
        onCall: quickHandlers.onCall,
        onComposeEmail: quickHandlers.onEmail,
        onCopyPhone: () => void copyText(phone, "Phone"),
        onCopyEmail: () => void copyText(email, "Email"),
        onScheduleFollowUp: () => {
          setTaskSeed(scheduleFollowUpSeed());
          setTaskOpen(true);
        },
        onLogActivity: quickHandlers.onLogActivity,
        // T-P3.3b: "Add meeting" no longer presets a Generic type (the generic
        // tab is gone). It opens the type-driven Activity logger; the user
        // picks the Meeting type (if configured) from the picker like any other.
        onAddMeeting: () => {
          goLogActivity();
        },
        onCreateTask: quickHandlers.onTask,
        onAddNote: () => {
          setActiveTab("notes");
          window.setTimeout(() => document.getElementById("lead-note")?.focus(), 120);
        },
        onUploadDocument: () => {
          setActiveTab("documents");
          window.setTimeout(
            () => requestDocumentUpload({ refType: "lead", refId: lead.id }),
            150,
          );
        },
        onConvert: quickHandlers.onConvert,
        onToggleStar: async () => {
          const next = !lead.isStarred;
          try {
            const res = await fetch(`/api/leads/${lead.id}/favorite`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isStarred: next }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error ?? "Failed to update star");
            setLead((l) => ({ ...l, isStarred: next }));
            toast.success(next ? "Lead starred" : "Star removed");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update star");
          }
        },
        onMarkWon: async () => {
          const stage = resolvePipelineStage(pipelineStages, "won");
          if (!stage) {
            toast.error("No “won” stage in pipeline — configure stages in settings");
            return;
          }
          try {
            await applyTransition({ stage });
            toast.success(`Stage set to ${stage}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not mark won");
          }
        },
        onMarkLost: async () => {
          const stage = resolvePipelineStage(pipelineStages, "lost");
          if (!stage) {
            toast.error("No “lost” stage in pipeline — configure stages in settings");
            return;
          }
          try {
            await applyTransition({ stage });
            toast.success(`Stage set to ${stage}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not mark lost");
          }
        },
        onChangeOwner: () => {
          loadOwners();
          setPickKind("owner");
        },
        onChangeStage: () => setPickKind("stage"),
        onChangeStatus: () => setPickKind("status"),
        onAiSummarize: () =>
          setAiModal({ title: "Lead summary", body: buildLeadSummarySnippet(aiInput) }),
        onAiSuggestNext: () =>
          setAiModal({
            title: "Suggested next action",
            body: aiInput.insights.recommendedAction,
          }),
        onAiFollowUpEmail: () =>
          setAiModal({
            title: "Follow-up email draft",
            body: buildFollowUpEmailDraft(aiInput),
            copyLabel: "Copy draft",
          }),
        onAiAnalyzeHealth: () =>
          setAiModal({
            title: "Lead health analysis",
            body: buildLeadHealthAnalysis(aiInput),
          }),
        onAiPredictConversion: () =>
          setAiModal({
            title: "Conversion prediction",
            body: buildConversionPrediction(aiInput),
          }),
        canEdit,
        canLogActivity,
        canCall: !!phone,
        hasPhone: !!phone,
        hasEmail: !!email,
        isStarred: lead.isStarred,
        linkedContactId: lead.linkedContactId,
        isTrashed,
      }),
    [
      aiInput,
      applyTransition,
      canEdit,
      canLogActivity,
      copyText,
      email,
      goLogActivity,
      isTrashed,
      lead.id,
      lead.isStarred,
      lead.linkedContactId,
      lead.name,
      lead.ownerId,
      loadOwners,
      phone,
      pipelineStages,
      quickHandlers,
      router,
      toast,
    ],
  );

  function handleConvertSuccess(result: ConvertResult) {
    if (result.opportunityId) toast.success("Lead converted with opportunity");
    else toast.success("Lead converted to contact");
    router.refresh();
  }

  return (
    <div className="pb-20 xl:pb-0">
      <LeadsTabBar />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
        >
          <ChevronLeft size={14} /> All leads
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="crm-btn-secondary inline-flex items-center gap-1 text-xs"
            title="Command palette (Ctrl+K)"
          >
            <Command size={14} /> Commands
          </button>
          {canEdit && !isTrashed ? (
            <button
              type="button"
              onClick={() => {
                loadOwners();
                setEditOpen(true);
              }}
              className="crm-btn-secondary inline-flex items-center gap-1 text-xs"
            >
              <Pencil size={14} /> Quick edit
            </button>
          ) : null}
        </div>
      </div>

      {isTrashed ? (
        <LeadTrashedBanner
          leadId={lead.id}
          leadName={lead.name}
          deletedAt={deletedAt ?? ""}
          isAdmin={isAdmin}
        />
      ) : null}

      <LeadDashboardHeader
        lead={lead}
        snapshot={snapshot}
        canEdit={canEdit}
        isTrashed={isTrashed}
      />

      {!isTrashed ? (
        <>
          <StagePipelineStepper
            leadId={lead.id}
            currentStage={lead.stage}
            tenantStages={pipelineStages}
            canEdit={canEdit}
            onStageChange={(stage) => setLead((l) => ({ ...l, stage }))}
          />
          <AdvancedKpiSection snapshot={snapshot} onNavigateTab={setActiveTab} />
        </>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <main className="min-w-0 flex-1 xl:w-[70%]">
          <LeadDetailTabs
            lead={{
              id: lead.id,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              mobile: lead.mobile,
              company: lead.company,
              jobTitle: lead.jobTitle,
              source: lead.source,
              stage: lead.stage,
              status: lead.status,
              score: lead.score,
              country: lead.country,
              ownerId: lead.ownerId,
              ownerName: lead.ownerName,
              accountId: lead.accountId,
              account: lead.account,
              icpId: lead.icpId,
              icp: lead.icp,
              convertedAt: lead.convertedAt,
              linkedContactId: lead.linkedContactId,
              dynamicFields: lead.dynamicFields ?? null,
              firstName: lead.firstName,
              lastName: lead.lastName,
              secondaryEmail: lead.secondaryEmail,
              contactLinkedinUrl: lead.contactLinkedinUrl,
              industry: lead.industry,
              website: lead.website,
              linkedinUrl: lead.linkedinUrl,
              annualRevenueDisplay: lead.annualRevenueDisplay,
              addressLine1: lead.addressLine1,
              addressLine2: lead.addressLine2,
              cityName: lead.cityName,
              stateName: lead.stateName,
              postalCode: lead.postalCode,
              lat: lead.lat,
              long: lead.long,
            }}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            overview={overview}
            snapshot={snapshot}
            timelineSeed={timelineSeed}
            analytics={analytics}
            conversionProbability={insights.conversionProbability}
            initialNotes={overview.notes}
            canCreateNote={canEdit && !isTrashed}
            onLogActivity={goLogActivity}
            onLogCall={() => setDispositionOpen(true)}
          />
        </main>

        <aside className="hidden w-full shrink-0 space-y-4 xl:block xl:w-[30%]">
          {!isTrashed ? (
            <QuickActionsPanel
              {...quickHandlers}
              canCall={!!phone}
              canConvert={canEdit}
              linkedContactId={lead.linkedContactId}
            />
          ) : null}
          <AiInsightsCard insights={insights} />
          <LeadSummaryCard
            lead={{
              id: lead.id,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              mobile: lead.mobile,
              company: lead.company ?? lead.account?.name ?? null,
              industry: lead.industry,
              stage: lead.stage,
              status: lead.status,
              score: lead.score,
              ownerName: lead.ownerName,
              source: lead.source,
              jobTitle: lead.jobTitle,
              website: lead.website ?? null,
              updatedAt: lead.updatedAt,
              account: lead.account,
              icpId: lead.icpId,
              icp: lead.icp,
            }}
          />
        </aside>
      </div>

      {!isTrashed ? (
        <QuickActionsMobileBar
          {...quickHandlers}
          canCall={!!phone}
          canConvert={canEdit}
          linkedContactId={lead.linkedContactId}
        />
      ) : null}

      <CommandEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        leadName={lead.name}
        to={composeEmail.to}
        blockReason={composeEmail.blockReason}
        onGoToDetails={() => {
          setEmailOpen(false);
          setActiveTab("details");
        }}
      />

      <QuickEditDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        lead={lead}
        pipelineStages={pipelineStages}
        pipelineStatuses={pipelineStatuses}
        owners={owners}
        canEdit={canEdit}
        onPatch={(patch) => setLead((l) => ({ ...l, ...patch }))}
      />

      <LeadCommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        leadName={lead.name}
        actions={commandActions}
      />


      {pickKind ? (
        <CommandQuickPickModal
          open={!!pickKind}
          onClose={() => setPickKind(null)}
          kind={pickKind}
          title={
            pickKind === "owner"
              ? "Change owner"
              : pickKind === "stage"
                ? "Change stage"
                : "Change status"
          }
          options={
            pickKind === "owner"
              ? owners.map((o) => ({ value: o.id, label: o.name }))
              : pickKind === "stage"
                ? pipelineStages.map((s) => ({ value: s, label: s }))
                : pipelineStatuses.map((s) => ({ value: s, label: s }))
          }
          currentValue={
            pickKind === "owner"
              ? lead.ownerId ?? ""
              : pickKind === "stage"
                ? lead.stage
                : lead.status
          }
          saving={pickSaving}
          onSave={async (value) => {
            setPickSaving(true);
            try {
              if (pickKind === "owner") {
                const res = await fetch(`/api/leads/${lead.id}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ownerId: value || null }),
                });
                const j = await res.json();
                if (!res.ok) throw new Error(j.error ?? "Update failed");
                const ownerName = owners.find((o) => o.id === value)?.name ?? null;
                setLead((l) => ({ ...l, ownerId: value || null, ownerName }));
              } else if (pickKind === "stage") {
                await applyTransition({ stage: value });
              } else {
                await applyTransition({ status: value });
              }
              toast.success("Lead updated");
              setPickKind(null);
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Update failed");
            } finally {
              setPickSaving(false);
            }
          }}
        />
      ) : null}

      {aiModal ? (
        <CommandAiResultModal
          open={!!aiModal}
          onClose={() => setAiModal(null)}
          title={aiModal.title}
          body={aiModal.body}
          copyLabel={aiModal.copyLabel}
        />
      ) : null}

      <CallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        to={lead.phone}
        leadId={lead.id}
        leadName={lead.name}
        leadStage={lead.stage}
        dispositionSections={dispositionSections}
      />

      <LeadCallDispositionModal
        open={dispositionOpen}
        leadId={lead.id}
        leadStage={lead.stage}
        defaultToNumber={(lead.mobile || lead.phone || "").trim()}
        onClose={() => setDispositionOpen(false)}
        onSaved={() => router.refresh()}
      />

      <ConvertLeadModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        leadId={lead.id}
        leadName={lead.name}
        leadCompany={lead.company}
        onSuccess={handleConvertSuccess}
      />

      <TaskEditModal
        open={taskOpen}
        onClose={() => {
          setTaskOpen(false);
          setTaskSeed(undefined);
        }}
        seed={
          taskSeed ?? {
            subject: "",
            relatedKind: "Lead",
            relatedObjectId: lead.id,
            leadId: lead.id,
            assignedToUserId: lead.ownerId,
          }
        }
        locked={{ relatedKind: true, leadId: true }}
        onSaved={() => {
          setTaskOpen(false);
          setTaskSeed(undefined);
          router.refresh();
        }}
      />
    </div>
  );
}
