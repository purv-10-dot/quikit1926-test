"use client";

import { Cloud, CloudRain, Sun, Loader2, AlertTriangle } from "lucide-react";
import { Section } from "../components/Section";
import { DPRWeatherMetrics } from "@/components/DPRWeatherMetrics";
import type { DprWeatherDetail } from "@/lib/weather/dpr-weather";

export function GeneralInfo({
  isEdit,
  weatherLoading,
  weatherCondition,
  onWeatherConditionChange,
  onResetWeatherDetail,
  weatherHint,
  weatherDetail,
  workHalted,
  onToggleWorkHalted,
  siteRemarks,
  onSiteRemarksChange,
}: {
  isEdit: boolean;
  weatherLoading: boolean;
  weatherCondition: "Clear" | "Cloudy" | "Rain";
  onWeatherConditionChange: (c: "Clear" | "Cloudy" | "Rain") => void;
  onResetWeatherDetail: () => void;
  weatherHint: string;
  weatherDetail: DprWeatherDetail | null;
  workHalted: boolean;
  onToggleWorkHalted: () => void;
  siteRemarks: string;
  onSiteRemarksChange: (v: string) => void;
}) {
  return (
    <Section
      id="dpr-general"
      icon={<Cloud className="w-4 h-4" />}
      title="GENERAL INFO & WEATHER"
      defaultOpen={isEdit}
    >
      {/* Weather + Work Status — single row of compact horizontal pills.
          All four pills share the same height so the row reads as one
          unified control bar instead of mismatched cards. */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Weather
            {weatherLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" aria-hidden />
            ) : null}
          </label>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            {(
              [
                { key: "Clear",  label: "Clear",  icon: Sun,       activeBg: "bg-amber-50",  activeText: "text-amber-700",  activeIcon: "text-amber-500" },
                { key: "Cloudy", label: "Cloudy", icon: Cloud,     activeBg: "bg-slate-100", activeText: "text-slate-800",  activeIcon: "text-slate-600" },
                { key: "Rain",   label: "Rain",   icon: CloudRain, activeBg: "bg-sky-50",    activeText: "text-sky-700",    activeIcon: "text-sky-600"  },
              ] as const
            ).map((opt, i) => {
              const active = weatherCondition === opt.key;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onWeatherConditionChange(opt.key);
                    onResetWeatherDetail();
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-all ${
                    i > 0 ? "border-l border-slate-200" : ""
                  } ${
                    active
                      ? `${opt.activeBg} ${opt.activeText}`
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  aria-pressed={active}
                >
                  <Icon className={`w-4 h-4 ${active ? opt.activeIcon : "text-slate-400"}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          {weatherHint ? (
            <p className="mt-1.5 text-[11px] text-slate-500 max-w-md">{weatherHint}</p>
          ) : null}
          <DPRWeatherMetrics
            detail={weatherDetail}
            className="mt-3 pt-3 border-t border-slate-100"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Work Status
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={workHalted}
            onClick={onToggleWorkHalted}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold whitespace-nowrap transition-all ${
              workHalted
                ? "bg-rose-50 border-rose-300 text-rose-700"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <AlertTriangle
              className={`w-4 h-4 ${workHalted ? "text-rose-600" : "text-slate-400"}`}
            />
            <span>Work Halted</span>
            <span
              className={`relative inline-flex w-8 h-4 rounded-full transition-colors ml-1 ${
                workHalted ? "bg-rose-500" : "bg-slate-300"
              }`}
              aria-hidden
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                  workHalted ? "translate-x-[17px]" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>
      </div>
      <div className="mt-5">
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          Site Remarks
        </label>
        <textarea
          value={siteRemarks}
          onChange={(e) => onSiteRemarksChange(e.target.value)}
          placeholder="General observations, visitor log, instructions received…"
          rows={3}
          className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 resize-none placeholder:text-slate-400 transition-shadow"
        />
      </div>
    </Section>
  );
}