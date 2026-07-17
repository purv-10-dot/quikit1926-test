"use client";

import { FileSpreadsheet, FileText, Folder, Plus, Trash2 } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { Tile } from "../components/parts";
import { CATEGORY_OPTIONS } from "../lib/constants";
import { useBoqImport } from "../hooks/useBoqImport";

type Props = Pick<
  ReturnType<typeof useBoqImport>,
  | "sfCategory" | "setSfCategory" | "sfParents"
  | "addParent" | "removeParent" | "updateParent"
  | "addChild" | "removeChild" | "updateChild" | "setChildMode"
  | "addLineItem" | "removeLineItem" | "updateLineItem"
  | "sfRows" | "sfRolledAmt" | "sfSummary"
  | "replaceExisting" | "setReplaceExisting"
>;

export function SelfFill({
  sfCategory, setSfCategory, sfParents,
  addParent, removeParent, updateParent,
  addChild, removeChild, updateChild, setChildMode,
  addLineItem, removeLineItem, updateLineItem,
  sfRows, sfRolledAmt, sfSummary,
  replaceExisting, setReplaceExisting,
}: Props) {
  return (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Left: builder */}
              <div className="lg:col-span-3 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Category
                  </label>
                  <div className="min-w-[180px]">
                    <SelectInput
                      value={sfCategory}
                      onChange={setSfCategory}
                      options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {sfParents.map((parent, pIdx) => (
                    <div
                      key={parent.id}
                      className="border border-gray-200 rounded-lg bg-white"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                        <input
                          type="text"
                          placeholder={String(pIdx + 1)}
                          value={parent.boqNoOverride}
                          onChange={(e) =>
                            updateParent(parent.id, { boqNoOverride: e.target.value })
                          }
                          className="w-12 text-[11px] font-bold text-orange-700 bg-orange-100 border border-orange-200 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder-orange-300"
                          title="BOQ No (leave blank to auto-number)"
                        />
                        <input
                          type="text"
                          placeholder="Parent group name (e.g. Structural Work)"
                          value={parent.displayName}
                          onChange={(e) =>
                            updateParent(parent.id, { displayName: e.target.value })
                          }
                          className="flex-1 text-sm font-semibold bg-transparent border-none focus:outline-none text-gray-900 placeholder-gray-400"
                        />
                        <button
                          onClick={() => removeParent(parent.id)}
                          disabled={sfParents.length === 1}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove parent"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="p-3 space-y-2">
                        {parent.children.map((child, cIdx) => (
                          <div
                            key={child.id}
                            className="border border-gray-100 rounded-md"
                          >
                            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50/60">
                              {child.mode === "group" ? (
                                <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                              <input
                                type="text"
                                placeholder={String(cIdx + 1)}
                                value={child.boqNoOverride}
                                onChange={(e) =>
                                  updateChild(parent.id, child.id, {
                                    boqNoOverride: e.target.value,
                                  })
                                }
                                className="w-10 text-[10px] text-gray-700 bg-white border border-gray-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-gray-400"
                                title="BOQ No suffix (e.g. 6 → 2.6). Leave blank to auto-number."
                              />
                              <input
                                type="text"
                                placeholder={
                                  child.mode === "group"
                                    ? "Sub-group name (e.g. Foundation)"
                                    : "Item description"
                                }
                                value={child.displayName}
                                onChange={(e) =>
                                  updateChild(parent.id, child.id, {
                                    displayName: e.target.value,
                                  })
                                }
                                className="flex-1 text-xs font-medium bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400 min-w-0"
                              />

                              {child.mode === "leaf" && (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Unit"
                                    value={child.unit}
                                    onChange={(e) =>
                                      updateChild(parent.id, child.id, {
                                        unit: e.target.value,
                                      })
                                    }
                                    className="w-16 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Qty"
                                    value={child.tenderQty}
                                    onChange={(e) =>
                                      updateChild(parent.id, child.id, {
                                        tenderQty: e.target.value,
                                      })
                                    }
                                    className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Rate"
                                    value={child.rate}
                                    onChange={(e) =>
                                      updateChild(parent.id, child.id, {
                                        rate: e.target.value,
                                      })
                                    }
                                    className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                  />
                                </>
                              )}

                              {/* Leaf ↔ Group toggle */}
                              <div className="flex border border-gray-200 rounded overflow-hidden text-[10px] shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChildMode(parent.id, child.id, "leaf")
                                  }
                                  className={`px-1.5 py-0.5 ${
                                    child.mode === "leaf"
                                      ? "bg-orange-500 text-white"
                                      : "bg-white text-gray-500 hover:bg-gray-50"
                                  }`}
                                  title="Child holds qty/rate directly (no sub-items)"
                                >
                                  Leaf
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChildMode(parent.id, child.id, "group")
                                  }
                                  className={`px-1.5 py-0.5 border-l border-gray-200 ${
                                    child.mode === "group"
                                      ? "bg-orange-500 text-white"
                                      : "bg-white text-gray-500 hover:bg-gray-50"
                                  }`}
                                  title="Child is a group with line items beneath"
                                >
                                  Group
                                </button>
                              </div>

                              <button
                                onClick={() => removeChild(parent.id, child.id)}
                                disabled={parent.children.length === 1}
                                className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                title="Remove child"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Line items — only when this child is a group */}
                            {child.mode === "group" && (
                              <div className="p-2 space-y-1.5">
                                {child.lineItems.map((li, lIdx) => (
                                  <div
                                    key={li.id}
                                    className="flex items-center gap-1.5"
                                  >
                                    <input
                                      type="text"
                                      placeholder={String(lIdx + 1)}
                                      value={li.boqNoOverride}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          boqNoOverride: e.target.value,
                                        })
                                      }
                                      className="w-10 text-[10px] text-gray-600 bg-white border border-gray-200 rounded px-1 py-0.5 text-center shrink-0 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-gray-400"
                                      title="BOQ No suffix. Leave blank to auto-number."
                                    />
                                    <input
                                      type="text"
                                      placeholder="Item description"
                                      value={li.displayName}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          displayName: e.target.value,
                                        })
                                      }
                                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-300 min-w-0"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Unit"
                                      value={li.unit}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          unit: e.target.value,
                                        })
                                      }
                                      className="w-16 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                    />
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="Qty"
                                      value={li.tenderQty}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          tenderQty: e.target.value,
                                        })
                                      }
                                      className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                    />
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="Rate"
                                      value={li.rate}
                                      onChange={(e) =>
                                        updateLineItem(parent.id, child.id, li.id, {
                                          rate: e.target.value,
                                        })
                                      }
                                      className="w-20 text-xs border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-300"
                                    />
                                    <button
                                      onClick={() =>
                                        removeLineItem(parent.id, child.id, li.id)
                                      }
                                      disabled={child.lineItems.length === 1}
                                      className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                      title="Remove line item"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => addLineItem(parent.id, child.id)}
                                  className="text-[11px] text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 ml-12"
                                >
                                  <Plus className="w-3 h-3" /> Add line item
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => addChild(parent.id, "leaf")}
                            className="text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 border border-dashed border-orange-300 rounded px-2 py-1 font-medium flex items-center gap-1"
                            title="Add a leaf child (holds qty/rate directly, e.g. 1.2)"
                          >
                            <FileText className="w-3 h-3" />
                            <Plus className="w-3 h-3" /> Add leaf child
                          </button>
                          <button
                            onClick={() => addChild(parent.id, "group")}
                            className="text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-50 border border-dashed border-amber-300 rounded px-2 py-1 font-medium flex items-center gap-1"
                            title="Add a group child (contains line items, e.g. 1.2 → 1.2.1)"
                          >
                            <Folder className="w-3 h-3" />
                            <Plus className="w-3 h-3" /> Add group child
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addParent}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-xs font-medium text-gray-600 hover:border-orange-300 hover:bg-orange-50/30 hover:text-orange-700 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add parent group
                </button>
              </div>

              {/* Right: live Excel-style preview */}
              <div className="lg:col-span-2 lg:sticky lg:top-0 lg:self-start">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Live Preview
                </label>
                <div className="border border-gray-200 rounded-md overflow-hidden bg-white">
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                          <th className="px-2 py-2 text-left font-semibold border-b border-gray-200 w-14">BOQ No.</th>
                          <th className="px-2 py-2 text-left font-semibold border-b border-gray-200 min-w-[220px]">
                            Description
                          </th>
                          <th className="px-2 py-2 text-left font-semibold border-b border-gray-200 w-14">Unit</th>
                          <th className="px-2 py-2 text-right font-semibold border-b border-gray-200 w-16">Rate</th>
                          <th className="px-2 py-2 text-right font-semibold border-b border-gray-200 w-20">Qty</th>
                          <th className="px-2 py-2 text-right font-semibold border-b border-gray-200 w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sfRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-2 py-10 text-center text-gray-400 italic"
                            >
                              Start adding parents, children, and line items on the left.
                            </td>
                          </tr>
                        ) : (
                          sfRows.map((r, i) => {
                            const isLeaf = !r.isGroup;
                            const rolled = sfRolledAmt.get(r.boqNo) ?? 0;
                            // Row styling mirrors the BOQ grid:
                            //   depth 0 group → bold, faint gray background
                            //   depth 1 group → semibold
                            //   leaf          → regular weight
                            const rowClass = r.isGroup
                              ? r.depth === 0
                                ? "bg-gray-50/80 font-bold text-gray-900"
                                : "bg-white font-semibold text-gray-800"
                              : "bg-white text-gray-700";
                            return (
                              <tr key={i} className={rowClass}>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100 text-gray-500">
                                  {r.boqNo}
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100">
                                  <div
                                    className="flex items-start gap-1.5"
                                    style={{ paddingLeft: `${r.depth * 14}px` }}
                                  >
                                    {r.isGroup ? (
                                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                    )}
                                    <span className="break-words">
                                      {r.displayName}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100 text-center text-orange-600 font-medium">
                                  {isLeaf ? r.unit ?? "" : ""}
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100 text-right">
                                  {isLeaf ? r.rate?.toLocaleString("en-IN") ?? "" : ""}
                                </td>
                                <td className="px-2 py-1.5 align-top border-b border-gray-100 text-right">
                                  {isLeaf ? r.tenderQty?.toLocaleString("en-IN") ?? "" : ""}
                                </td>
                                <td
                                  className={`px-2 py-1.5 align-top border-b border-gray-100 text-right ${
                                    r.isGroup ? "text-indigo-600" : "text-gray-900 font-medium"
                                  }`}
                                >
                                  {rolled > 0
                                    ? rolled.toLocaleString("en-IN", {
                                        maximumFractionDigits: 2,
                                      })
                                    : ""}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {sfRows.length > 0 && (
                        <tfoot className="bg-gray-50 font-bold text-gray-900 sticky bottom-0">
                          <tr>
                            <td colSpan={5} className="px-2 py-2 text-right border-t border-gray-300">
                              Total amount
                            </td>
                            <td className="px-2 py-2 text-right border-t border-gray-300">
                              ₹{sfSummary.totalAmt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <Tile label="Parents" value={sfParents.length} />
                  <Tile label="Groups" value={sfSummary.groups} />
                  <Tile label="Line items" value={sfSummary.leaves} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-3">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-xs text-gray-700">
                    Replace existing BOQ for this project
                    {replaceExisting && (
                      <span className="text-amber-600 ml-1 font-medium">
                        (current items will be deleted)
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>
  );
}
