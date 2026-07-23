"use client";

/**
 * New Daily Progress Report — full-page form.
 *
 * Layout (matches the reference screenshots):
 *
 *   Header strip:        Date picker · Project selector · Copy Previous Day
 *                        · Save Draft · Submit Report
 *   GENERAL INFO         Weather (Clear/Cloudy/Rain) · Work Halted · Site Remarks
 *   WORK DONE            empty state → [Add Activity from BOQ] → cascading picker
 *   MATERIALS            table with Material, Unit, tender/received/used columns
 *   MANPOWER DEPLOYED    Contractor · Working Area · skill count columns
 *   STAFF DEPLOYED       Name · Designation · Present · Reason if absent
 *   MACHINERY DEPLOYED   Description · Condition · Req/Actual qty · Remarks
 *
 * Save Draft → POST /api/projects/dpr { status: "draft" }
 * Submit Report → POST /api/projects/dpr { status: "submitted" }
 */

import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Send,
  Cloud,
  FileText,
  Package,
  Users,
  Truck,
  Loader2,
  AlertTriangle,
  Calendar,
  MapPin,
  Building2,
} from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import type { DPRFormProps } from "../lib/types";
import { SectionNav } from "./SectionNav";
import { Staff } from "../sections/Staff";
import { Machinery } from "../sections/Machinery";
import { Manpower } from "../sections/Manpower";
import { Materials } from "../sections/Materials";
import { GeneralInfo } from "../sections/GeneralInfo";
import { WorkDone } from "../sections/WorkDone";
import { useDprForm } from "../hooks/useDprForm";

export function DPRForm({ editData, embedded = false, onSaved }: DPRFormProps = {}) {
  const {
    isEdit,
    itemGroups, uoms, contractors, locations, machineryMaster,
    projectOptions, selectedProject, projectWorkOrders,
    alreadyAddedBoqIds, groupedWorkItems,
    projectId, setProjectId,
    consumptionLocationId, setConsumptionLocationId,
    reportDate, setReportDate,
    weatherCondition, setWeatherCondition,
    weatherLoading,
    weatherHint,
    weatherDetail, setWeatherDetail,
    workHalted, setWorkHalted,
    siteRemarks, setSiteRemarks,
    workItems,
    boqModalOpen, setBoqModalOpen,
    materials,
    stockByItem,
    manpower,
    staff,
    machinery,
    saving,
    error, setError,
    galleryIdx, setGalleryIdx,
    addWorkItemFromBoq, updateWorkItem, addWorkItemImages, removeWorkItemImage, removeWorkItem,
    addMaterial, updateMaterial, removeMaterial,
    addManpower, updateManpower, removeManpower,
    addStaff, updateStaff, removeStaff,
    addMachinery, updateMachinery, removeMachinery,
    handleSave,
  } = useDprForm(editData, { embedded, onSaved });

  return (
    <>
      {/* Page header — hidden in embedded (drawer) mode because the
          drawer chrome supplies its own title + close. */}
      {!embedded && (
      <div className="px-6 pt-5 pb-2">
        <h1 className="text-lg font-bold text-gray-900">Daily Progress Report</h1>
        <p className="text-xs text-gray-500">
          Track daily site activities, material consumption, and labor.
        </p>
      </div>
      )}

      {/* In embedded (drawer) mode skip PageContainer's outer p-6 +
          max-width — the form needs to fill the drawer body so the sticky
          footer sits flush to the drawer edges. In page mode PageContainer
          still applies for desktop layout. NB: no `overflow-hidden`
          wrapper anywhere in this tree — that would create a new scroll
          context and the sticky footer below would stop sticking to the
          actual scrolling ancestor. */}
      <div className={embedded ? "" : "px-6 pb-6 max-w-[1600px] mx-auto"}>
        <div>
          {/* Sticky header block — wraps the context strip (date / project
              / project meta card) AND the section nav so they pin to the
              top together as one cohesive header while the user scrolls
              through sections. Single z-30 layer so they don't fight each
              other for stacking; the X close button (z-30 in DPRDrawer)
              is shielded from these by the wrapper's pr-14 reservation
              on the strip below. */}
          <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md shadow-[0_2px_8px_-4px_rgba(15,23,42,0.06)]">
          <div className="px-6 py-4 pr-14 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50/40">
            <div className="flex items-end gap-4 flex-wrap">
              {!embedded && (
                <div className="flex items-center gap-3 mr-auto">
                  <Link
                    href="/projects/dpr"
                    className="mt-5 p-2 rounded-lg hover:bg-slate-100 hover:text-accent-700 text-slate-500 border border-transparent hover:border-accent-200 transition-all"
                    title="Back to DPR list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Link>
                  <div className="mt-2">
                    <div className="text-base font-bold text-slate-900 tracking-tight">
                      {isEdit ? `Edit ${editData?.dprNumber ?? "DPR"}` : "New Daily Report"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isEdit
                        ? "Update details for this daily progress report"
                        : "Fill in the details for the day's activities"}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-3 flex-wrap flex-1 min-w-0">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Report Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="text-sm pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400 transition-shadow"
                    />
                  </div>
                </div>
                <div className="min-w-[220px] flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Project <span className="text-rose-500">*</span>
                  </label>
                  <SelectInput
                    value={projectId}
                    onChange={setProjectId}
                    placeholder="Select Project…"
                    options={projectOptions}
                  />
                </div>
              </div>
            </div>

            {/* Project context card — appears once a project is selected so
                the user has a persistent visual anchor for *which* project
                this DPR belongs to as they scroll the form. */}
            {selectedProject && (
              <div className="mt-3 flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-accent-100 ring-1 ring-accent-50">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-accent-50 text-accent-600 ring-1 ring-accent-100 shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Reporting for
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {selectedProject.name}
                  </div>
                </div>
                {(selectedProject.code || selectedProject.projectCode) && (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold tabular-nums">
                    {selectedProject.code ?? selectedProject.projectCode}
                  </span>
                )}
                {(selectedProject.location ||
                  selectedProject.city ||
                  selectedProject.state) && (
                  <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-500 max-w-[200px] truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {[
                      selectedProject.location,
                      selectedProject.city,
                      selectedProject.state,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section navigation — quick-jump pills with item counts. Lets
              users see at a glance which sections have content and skip
              directly to whatever they need to fill in next. */}
          <SectionNav
            items={[
              { id: "dpr-general", label: "General", icon: <Cloud className="w-3.5 h-3.5" />, count: 0 },
              { id: "dpr-work", label: "Work Done", icon: <FileText className="w-3.5 h-3.5" />, count: workItems.length },
              { id: "dpr-materials", label: "Materials", icon: <Package className="w-3.5 h-3.5" />, count: materials.length },
              { id: "dpr-manpower", label: "Manpower", icon: <Users className="w-3.5 h-3.5" />, count: manpower.length },
              { id: "dpr-staff", label: "Staff", icon: <Users className="w-3.5 h-3.5" />, count: staff.length },
              { id: "dpr-machinery", label: "Machinery", icon: <Truck className="w-3.5 h-3.5" />, count: machinery.length },
            ]}
          />
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">
                ×
              </button>
            </div>
          )}

          {/* Form body */}
          <div className="p-6 space-y-4">
            {/* ── GENERAL INFO & WEATHER ── */}
            <GeneralInfo
              isEdit={isEdit}
              weatherLoading={weatherLoading}
              weatherCondition={weatherCondition}
              onWeatherConditionChange={setWeatherCondition}
              onResetWeatherDetail={() => setWeatherDetail(null)}
              weatherHint={weatherHint}
              weatherDetail={weatherDetail}
              workHalted={workHalted}
              onToggleWorkHalted={() => setWorkHalted(!workHalted)}
              siteRemarks={siteRemarks}
              onSiteRemarksChange={setSiteRemarks}
            />

            {/* ── WORK DONE ── */}
            <WorkDone
              rows={workItems}
              grouped={groupedWorkItems}
              projectWorkOrders={projectWorkOrders}
              onOpenBoqModal={() => {
                if (!projectId) {
                  setError("Pick a project first before adding BOQ activities");
                  return;
                }
                setBoqModalOpen(true);
              }}
              onUpdate={updateWorkItem}
              onRemove={removeWorkItem}
              onAddImages={addWorkItemImages}
              onOpenGallery={(idx) => setGalleryIdx(idx)}
              projectId={projectId}
              boqModalOpen={boqModalOpen}
              onCloseBoqModal={() => setBoqModalOpen(false)}
              alreadyAddedBoqIds={alreadyAddedBoqIds}
              onAddFromBoq={addWorkItemFromBoq}
              galleryIdx={galleryIdx}
              onCloseGallery={() => setGalleryIdx(null)}
              onRemoveImage={removeWorkItemImage}
            />

            {/* ── MATERIALS ── */}
            <Materials
              rows={materials}
              onAdd={addMaterial}
              onUpdate={updateMaterial}
              onRemove={removeMaterial}
              consumptionLocationId={consumptionLocationId}
              onConsumptionLocationChange={setConsumptionLocationId}
              locations={locations}
              itemGroups={itemGroups}
              stockByItem={stockByItem}
            />

            {/* ── MANPOWER DEPLOYED ── */}
            <Manpower
              rows={manpower}
              onAdd={addManpower}
              onUpdate={updateManpower}
              onRemove={removeManpower}
              contractors={contractors}
            />

            {/* ── STAFF DEPLOYED ── */}
            <Staff
              rows={staff}
              onAdd={addStaff}
              onUpdate={updateStaff}
              onRemove={removeStaff}
            />

            {/* ── MACHINERY DEPLOYED ── */}
            <Machinery
              rows={machinery}
              onAdd={addMachinery}
              onUpdate={updateMachinery}
              onRemove={removeMachinery}
              machineryMaster={machineryMaster}
            />
          </div>

          {/* Sticky action footer — anchored to the bottom of the scroll
              container (the drawer body in embedded mode, the page in full-
              page mode) so the user always has access to Save / Submit
              regardless of how far they've scrolled. The top shadow makes
              clear that content scrolls beneath it. */}
          <div className="sticky bottom-0 z-10 flex items-center gap-3 px-6 py-3 bg-white border-t border-slate-200 shadow-[0_-8px_16px_-10px_rgba(15,23,42,0.18)]">
            {/* Left side — live summary so the user can see at a glance how
                much they've captured. Replaces the previously dead
                "Copy Previous" button (kept available via the title-bar
                Copy Previous control when wired up). */}
            <div className="flex-1 min-w-0 flex items-center gap-2 text-[11px] text-slate-500 truncate">
              {(() => {
                const counts: Array<[string, number]> = [
                  ["activities", workItems.length],
                  ["materials", materials.length],
                  ["manpower", manpower.length],
                  ["staff", staff.length],
                  ["machinery", machinery.length],
                ];
                const filled = counts.filter(([, n]) => n > 0);
                if (filled.length === 0) {
                  return (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                      Nothing captured yet — add at least one activity to submit.
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {filled.map(([label, n], i) => (
                      <span key={label} className="inline-flex items-center gap-1">
                        <span className="font-bold text-slate-700 tabular-nums">{n}</span>
                        <span>{label}</span>
                        {i < filled.length - 1 && (
                          <span className="text-slate-300 mx-0.5">·</span>
                        )}
                      </span>
                    ))}
                  </span>
                );
              })()}
            </div>

            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={saving !== null}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:border-accent-300 hover:text-accent-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving === "draft" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave("submit")}
              disabled={saving !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-brand active:translate-y-[1px] transition-all"
            >
              {saving === "submit" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isEdit ? "Save & Submit" : "Submit Report"}
            </button>
          </div>
        </div>
      </div>

    </>
  );
}

