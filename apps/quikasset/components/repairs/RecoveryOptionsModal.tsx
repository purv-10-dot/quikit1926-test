"use client"

import { useState } from "react"
import { X, ArrowRightLeft, Star, PackageCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Repair } from "@/types/repair"
import type { Replacement } from "@/types/replacement"

export type RecoveryAction = "makePermanent" | "returnAndReassign" | "justRelease"

interface Props {
  repair: Repair
  replacement: Replacement
  onClose: () => void
  onConfirm: (action: RecoveryAction) => Promise<void>
}

const OPTIONS: {
  action: RecoveryAction
  label: string
  badge: string
  badgeCls: string
  borderCls: string
  activeCls: string
  icon: React.ReactNode
  description: (repName: string, replName: string, userName: string) => string
  btnLabel: string
  btnCls: string
}[] = [
  {
    action: "makePermanent",
    label: "Make Replacement Permanent",
    badge: "Keep Replacement",
    badgeCls: "bg-blue-100 text-blue-700",
    borderCls: "border-blue-200",
    activeCls: "ring-2 ring-blue-400 border-blue-300 bg-blue-50/40",
    icon: <Star className="w-4 h-4 text-blue-600" />,
    description: (repName, replName, userName) =>
      `${userName} permanently keeps ${replName}. The recovered ${repName} returns to the available pool.`,
    btnLabel: "Make Permanent",
    btnCls: "bg-blue-600 hover:bg-blue-700",
  },
  {
    action: "returnAndReassign",
    label: "Exchange — Give Recovered Asset",
    badge: "Exchange",
    badgeCls: "bg-green-100 text-green-700",
    borderCls: "border-green-200",
    activeCls: "ring-2 ring-green-400 border-green-300 bg-green-50/40",
    icon: <ArrowRightLeft className="w-4 h-4 text-green-600" />,
    description: (repName, replName, userName) =>
      `${userName} receives the recovered ${repName} instead. ${replName} returns to the available pool.`,
    btnLabel: "Exchange Assets",
    btnCls: "bg-green-600 hover:bg-green-700",
  },
  {
    action: "justRelease",
    label: "Release Both Assets",
    badge: "Release",
    badgeCls: "bg-gray-100 text-gray-600",
    borderCls: "border-gray-200",
    activeCls: "ring-2 ring-gray-400 border-gray-300 bg-gray-50/40",
    icon: <PackageCheck className="w-4 h-4 text-gray-500" />,
    description: (repName, replName) =>
      `Both ${repName} and ${replName} become available. No new assignment is created.`,
    btnLabel: "Release Both",
    btnCls: "bg-gray-700 hover:bg-gray-800",
  },
]

export default function RecoveryOptionsModal({ repair, replacement, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<RecoveryAction | null>(null)
  const [saving, setSaving] = useState(false)

  const repName   = repair.asset?.itemName ?? "Asset"
  const replName  = replacement.asset?.itemName ?? "Replacement"
  const userName  = replacement.user?.name ?? "User"

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    await onConfirm(selected)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recovery Options</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {repName} was recovered — a temporary replacement is still active
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Recovered Asset</p>
              <p className="text-xs font-semibold text-gray-800">{repName}</p>
              <p className="text-[10px] text-gray-400 font-mono">{repair.asset?.itemCode}</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
              <p className="text-[10px] font-semibold text-yellow-600 uppercase tracking-wide mb-1">Temp Replacement</p>
              <p className="text-xs font-semibold text-gray-800">{replName}</p>
              <p className="text-[10px] text-gray-500">Assigned to <span className="font-medium">{userName}</span></p>
            </div>
          </div>

          {/* Option cards */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Choose what happens next</p>
            {OPTIONS.map((opt) => (
              <button
                key={opt.action}
                onClick={() => setSelected(opt.action)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all",
                  selected === opt.action
                    ? opt.activeCls
                    : `border-gray-200 hover:border-gray-300 hover:bg-gray-50/50`
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                    selected === opt.action ? "bg-white shadow-sm" : "bg-gray-100"
                  )}>
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-gray-800">{opt.label}</p>
                      <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide", opt.badgeCls)}>
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      {opt.description(repName, replName, userName)}
                    </p>
                  </div>
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors",
                    selected === opt.action ? "border-blue-500 bg-blue-500" : "border-gray-300"
                  )}>
                    {selected === opt.action && (
                      <div className="w-full h-full rounded-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className={cn(
              "px-6 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-40",
              selected ? OPTIONS.find((o) => o.action === selected)?.btnCls ?? "bg-gray-700" : "bg-gray-400"
            )}
          >
            {saving ? "Processing…" : selected ? OPTIONS.find((o) => o.action === selected)?.btnLabel : "Select an option"}
          </button>
        </div>
      </div>
    </div>
  )
}
