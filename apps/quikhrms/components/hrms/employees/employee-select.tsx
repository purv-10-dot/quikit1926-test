"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Search, ChevronDown, Check, X, User as UserIcon } from "lucide-react";
import { clsx } from "clsx";
import { withBasePath } from "@/lib/utils/base-path";

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  workEmail: string | null;
  jobTitle: string | null;
  profilePhoto?: string | null;
  designation?: { title: string } | null;
  department?: { name: string } | null;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** Called with full employee object when user picks. */
  onPick?: (employee: EmployeeOption) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
  optional?: boolean;
  clearable?: boolean;
  excludeIds?: string[];
  /** Restrict employee pool to a single department. */
  departmentId?: string;
  /** Restrict the pool to employees within the caller's role-priority hierarchy. */
  accessibleOnly?: boolean;
  /** Override the source endpoint (default: the scope-gated /employees list).
   *  Used e.g. for ticket assignment, which needs department members regardless
   *  of the caller's employee-read scope. Must return the same shape. */
  endpoint?: string;
}

function fullName(e: EmployeeOption) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function initials(e: EmployeeOption) {
  return `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export function EmployeeSelect({
  value,
  onChange,
  onPick,
  placeholder = "Select employee",
  required = false,
  disabled = false,
  className,
  label,
  optional = false,
  clearable = true,
  excludeIds,
  departmentId,
  accessibleOnly = false,
  endpoint = "/api/v1/hrms/employees",
}: Props) {
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["employees", "select", endpoint, search, departmentId ?? "", accessibleOnly],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (endpoint === "/api/v1/hrms/employees") params.set("picker", "1");
      if (search) params.set("search", search);
      if (departmentId) params.set("department", departmentId);
      if (accessibleOnly) params.set("accessible", "true");
      return api.get<EmployeeOption[]>(`${endpoint}?${params.toString()}`);
    },
    staleTime: 30_000,
    // Don't fetch while disabled. The only disabled usage is ticket assignment,
    // whose endpoint (/tickets/assignable) requires a departmentId — firing the
    // request before a department is picked 400s ("departmentId is required").
    enabled: !disabled,
  });

  const options = useMemo(() => {
    const raw = data?.data ?? [];
    if (!excludeIds || excludeIds.length === 0) return raw;
    const skip = new Set(excludeIds);
    return raw.filter((e) => !skip.has(e.id));
  }, [data, excludeIds]);
  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
    else setSearch("");
  }, [open]);

  useEffect(() => { setHighlight(0); }, [search, open]);

  const pick = (e: EmployeeOption) => {
    onChange(e.id);
    onPick?.(e);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) pick(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={className} ref={rootRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {optional && <span className="text-gray-400 font-normal"> (optional)</span>}
          {required && !optional && <span className="text-red-500"> *</span>}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          className={clsx(
            "w-full flex items-center gap-2.5 border rounded-lg px-3 py-2 text-sm text-left transition",
            "focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e]",
            open ? "border-[#22c55e] ring-2 ring-[#22c55e]/20" : "border-gray-300 hover:border-gray-400",
            disabled && "bg-gray-50 cursor-not-allowed opacity-60",
          )}
        >
          {selected ? (
            <>
              {selected.profilePhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={withBasePath(selected.profilePhoto)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
                  {initials(selected)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{fullName(selected)}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {[selected.employeeCode, selected.designation?.title ?? selected.jobTitle].filter(Boolean).join(" · ")}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                <UserIcon size={14} />
              </div>
              <span className="flex-1 text-gray-400">{placeholder}</span>
            </>
          )}
          {clearable && selected && !disabled && (
            <X
              size={14}
              className="text-gray-400 hover:text-gray-700 shrink-0"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            />
          )}
          <ChevronDown size={16} className={clsx("text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
        </button>

        {required && (
          <input
            tabIndex={-1}
            aria-hidden
            required
            value={value}
            onChange={() => { /* controlled by parent via onChange; input exists only for HTML5 validity */ }}
            className="sr-only"
          />
        )}

        {open && (
          <div className="absolute z-50 mt-1.5 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-gray-100 bg-gray-50">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search by name, code, email..."
                  className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#22c55e] focus:border-[#22c55e]"
                />
              </div>
            </div>

            <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
              {isLoading ? (
                <li className="px-3 py-4 text-center text-xs text-gray-400">Loading...</li>
              ) : options.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-gray-400">
                  <UserIcon size={20} className="mx-auto mb-1 text-gray-300" />
                  No employees found
                </li>
              ) : options.map((e, i) => {
                const isSelected = e.id === value;
                const isHighlight = i === highlight;
                const meta = [e.employeeCode, e.designation?.title ?? e.jobTitle, e.department?.name].filter(Boolean).join(" · ");
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(e)}
                      className={clsx(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left transition",
                        isHighlight && !isSelected && "bg-[#dcfce7]/60",
                        isSelected && "bg-[#22c55e] text-white",
                        !isHighlight && !isSelected && "hover:bg-gray-50",
                      )}
                    >
                      {e.profilePhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={withBasePath(e.profilePhoto)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className={clsx(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                          isSelected ? "bg-white/20 text-white" : "bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-white",
                        )}>
                          {initials(e)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={clsx("text-sm font-medium truncate", isSelected ? "text-white" : "text-gray-900")}>
                          {fullName(e)}
                        </div>
                        <div className={clsx("text-[11px] truncate", isSelected ? "text-white/80" : "text-gray-500")}>
                          {meta || e.workEmail || ""}
                        </div>
                      </div>
                      {isSelected && <Check size={16} className="shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
