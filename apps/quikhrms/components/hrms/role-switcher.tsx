"use client";

import { useEffect, useRef, useState } from "react";
import { UserCog, Check, ChevronDown, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { ALL_ROLES, primaryRole, useRoles, type Role } from "@/lib/hooks/use-roles";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  employee: "Employee",
};

const ROLE_COLOR: Record<Role, string> = {
  admin: "bg-red-100 text-red-700",
  employee: "bg-gray-100 text-gray-700",
};

const ROLE_DESC: Record<Role, string> = {
  admin: "Full HRMS access",
  employee: "Personal self-service",
};

export function RoleSwitcher() {
  const { roles, setRoles, isImpersonating, clearImpersonation, dbRole } = useRoles();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const primary = primaryRole(roles);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const applyAndInvalidate = (next: Role[]) => {
    setRoles(next);
    qc.invalidateQueries();
  };

  const toggle = (r: Role) => {
    const next = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
    applyAndInvalidate(next);
  };

  const setOnly = (r: Role) => {
    applyAndInvalidate([r]);
    setOpen(false);
  };

  const resetToDb = () => {
    clearImpersonation();
    qc.invalidateQueries();
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium transition shadow-sm"
      >
        <UserCog size={14} className="text-[#3b82f6]" />
        <span className="hidden sm:inline text-gray-500">Viewing as:</span>
        <span className={clsx("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold", ROLE_COLOR[primary])}>
          {ROLE_LABEL[primary]}
        </span>
        {roles.length > 1 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#dbeafe] text-[#2563eb] text-[10px] font-bold">
            +{roles.length - 1}
          </span>
        )}
        {isImpersonating && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="Impersonating" />
        )}
        <ChevronDown size={12} className={clsx("text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-[#eff6ff] to-white">
            <p className="text-sm font-semibold text-slate-900">Switch role view</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click to toggle · Double-click to set as only role
            </p>
            {isImpersonating && dbRole && (
              <button
                onClick={resetToDb}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#3b82f6] hover:text-[#2563eb] font-medium"
              >
                <RotateCcw size={10} /> Reset to my real role ({ROLE_LABEL[dbRole as Role] ?? dbRole})
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-auto py-1">
            {ALL_ROLES.map((r) => {
              const active = roles.includes(r);
              const isDb = dbRole === r;
              return (
                <button
                  key={r}
                  onClick={() => toggle(r)}
                  onDoubleClick={() => setOnly(r)}
                  className={clsx(
                    "w-full flex items-center gap-2 px-3 py-2 text-left transition",
                    active ? "bg-blue-50/70 hover:bg-blue-50" : "hover:bg-slate-50",
                  )}
                >
                  <span className={clsx("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 w-24 text-center", ROLE_COLOR[r])}>
                    {ROLE_LABEL[r]}
                  </span>
                  <span className="flex-1 text-[11px] text-slate-500 truncate">{ROLE_DESC[r]}</span>
                  {isDb && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded" title="Your actual role">REAL</span>
                  )}
                  {active && <Check size={14} className="text-[#2563eb] shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500">
            Dev tool · Simulates permissions for dashboard preview. Server enforcement unchanged.
          </div>
        </div>
      )}
    </div>
  );
}
