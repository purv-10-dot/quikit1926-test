"use client";

/**
 * Meeting Templates — full CRUD admin view
 *
 * Lists the tenant's meeting templates (seeded with the Scaling Up 5
 * canonical cadences on first visit). Users can:
 *   - View the sections / description / duration for each template
 *   - Create a new custom template via the shared TemplateModal
 *   - Edit ANY template (including seeded ones) via the same modal
 *   - Delete a template — safe because Meeting → MeetingTemplate uses
 *     onDelete: SetNull, so past meetings don't cascade
 *
 * Deleting all templates is OK too — next GET call auto-reseeds the
 * 5 Scaling Up defaults. This gives users a built-in "reset to defaults"
 * escape hatch without needing a dedicated button.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, CalendarDays, Pencil, Trash2 } from "lucide-react";
import {
  useMeetingTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from "@/lib/hooks/useMeetings";
import { AddButton, useConfirm } from "@quikit/ui";
import { TemplateModal, type TemplateFormValues } from "./components/TemplateModal";
import type { Cadence } from "@/lib/schemas/meetingSchema";

interface Template {
  id: string;
  name: string;
  cadence: string;
  description: string | null;
  sections: string[];
  duration: number;
  createdAt: string;
}

const CADENCE_ORDER = ["daily", "weekly", "monthly", "quarterly", "annual"];

function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""}`;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; template: Template };

export default function TemplatesPage() {
  const confirm = useConfirm();
  const { data, isLoading, error } = useMeetingTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const templates = ((data as Template[] | undefined) ?? []).slice().sort(
    (a, b) =>
      CADENCE_ORDER.indexOf(a.cadence) - CADENCE_ORDER.indexOf(b.cadence) ||
      a.name.localeCompare(b.name),
  );

  const saving = createTemplate.isPending || updateTemplate.isPending;

  async function handleSave(values: TemplateFormValues) {
    if (modal.mode === "create") {
      await createTemplate.mutateAsync({
        name: values.name,
        cadence: values.cadence,
        description: values.description || null,
        duration: values.duration,
        sections: values.sections,
        defaultAttendees: [],
      });
    } else if (modal.mode === "edit") {
      await updateTemplate.mutateAsync({
        id: modal.template.id,
        name: values.name,
        cadence: values.cadence,
        description: values.description || null,
        duration: values.duration,
        sections: values.sections,
      });
    }
    setModal({ mode: "closed" });
  }

  async function handleDelete(t: Template) {
    if (
      !(await confirm({
        title: `Delete "${t.name}"?`,
        description: "Past meetings that used this template will keep their data — only the template itself is removed.",
        confirmLabel: "Delete",
        tone: "danger",
      }))
    ) {
      return;
    }
    setDeletingId(t.id);
    try {
      await deleteTemplate.mutateAsync(t.id);
    } finally {
      setDeletingId(null);
    }
  }

  const initialForEdit: Partial<TemplateFormValues> | undefined =
    modal.mode === "edit"
      ? {
          name: modal.template.name,
          cadence: modal.template.cadence as Cadence,
          description: modal.template.description ?? "",
          duration: modal.template.duration,
          sections: modal.template.sections,
        }
      : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/meetings"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Meeting Rhythm
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Meeting Templates</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Scaling Up canonical templates seeded on first visit. Edit them to match your
              company&apos;s meeting conventions, or create custom templates per cadence.
            </p>
          </div>
          <AddButton onClick={() => setModal({ mode: "create" })}>
            New Template
          </AddButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {isLoading && (
          <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-red-600 text-center py-12">
            Error: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && templates.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-12">
            No templates yet. The 5 Scaling Up defaults will re-seed on your next visit.
          </div>
        )}
        <div className="max-w-5xl mx-auto space-y-3">
          {templates.map((t) => {
            const busy = deletingId === t.id;
            return (
              <div
                key={t.id}
                className="bg-white border border-gray-200 rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                        <CalendarDays className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{t.name}</h3>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                          {t.cadence} · {fmtDuration(t.duration)}
                        </p>
                      </div>
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-600 mt-2">{t.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setModal({ mode: "edit", template: t })}
                      disabled={busy}
                      className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500 disabled:opacity-40"
                      title="Edit template"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={busy}
                      className="p-1.5 rounded-md border border-red-200 hover:bg-red-50 text-red-500 disabled:opacity-40"
                      title="Delete template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                    Sections ({t.sections.length})
                  </p>
                  <ol className="text-xs text-gray-600 space-y-1">
                    {t.sections.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-gray-400 flex-shrink-0">{i + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TemplateModal
        open={modal.mode !== "closed"}
        mode={modal.mode === "edit" ? "edit" : "create"}
        initial={initialForEdit}
        onClose={() => setModal({ mode: "closed" })}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
