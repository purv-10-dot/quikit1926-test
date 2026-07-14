"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Pencil, Trash2, Check, X, Loader2, FolderOpen, Tag, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BaseCategory, Category } from "@/types/asset"



export default function CategoryMasterPage() {
  const [baseCats, setBaseCats] = useState<BaseCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedBase, setSelectedBase] = useState<BaseCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [catLoading, setCatLoading] = useState(false)

  // base category add/edit
  const [addingBase, setAddingBase] = useState(false)
  const [newBaseName, setNewBaseName] = useState("")
  const [editingBase, setEditingBase] = useState<{ id: string; name: string } | null>(null)
  const [deletingBase, setDeletingBase] = useState<BaseCategory | null>(null)

  // category add/edit
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [editingCat, setEditingCat] = useState<{ id: string; name: string } | null>(null)
  const [deletingCat, setDeletingCat] = useState<Category | null>(null)

  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const loadBase = useCallback(async () => {
    const res = await fetch("/api/base-categories")
    const json = await res.json()
    setBaseCats(json.data ?? [])
    setLoading(false)
  }, [])

  const loadCats = useCallback(async (baseCategoryId: string) => {
    setCatLoading(true)
    const res = await fetch(`/api/categories?baseCategoryId=${baseCategoryId}`)
    const json = await res.json()
    setCategories(json.data ?? [])
    setCatLoading(false)
  }, [])

  useEffect(() => { loadBase() }, [loadBase])
  useEffect(() => { if (selectedBase) loadCats(selectedBase.id) }, [selectedBase, loadCats])

  // -- Base Category actions --
  async function handleAddBase() {
    if (!newBaseName.trim()) return
    await fetch("/api/base-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBaseName.trim() }),
    })
    setNewBaseName(""); setAddingBase(false)
    await loadBase()
    showToast("Base category added")
  }

  async function handleEditBase() {
    if (!editingBase || !editingBase.name.trim()) return
    await fetch(`/api/base-categories/${editingBase.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingBase.name.trim() }),
    })
    if (selectedBase?.id === editingBase.id) setSelectedBase((b) => b ? { ...b, name: editingBase.name } : b)
    setEditingBase(null)
    await loadBase()
    showToast("Base category updated")
  }

  async function handleDeleteBase() {
    if (!deletingBase) return
    await fetch(`/api/base-categories/${deletingBase.id}`, { method: "DELETE" })
    if (selectedBase?.id === deletingBase.id) { setSelectedBase(null); setCategories([]) }
    setDeletingBase(null)
    await loadBase()
    showToast("Base category deleted")
  }

  // -- Category actions --
  async function handleAddCat() {
    if (!newCatName.trim() || !selectedBase) return
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim(), baseCategoryId: selectedBase.id }),
    })
    setNewCatName(""); setAddingCat(false)
    await loadCats(selectedBase.id)
    await loadBase()
    showToast("Category added")
  }

  async function handleEditCat() {
    if (!editingCat || !editingCat.name.trim()) return
    await fetch(`/api/categories/${editingCat.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingCat.name.trim() }),
    })
    setEditingCat(null)
    if (selectedBase) await loadCats(selectedBase.id)
    showToast("Category updated")
  }

  async function handleDeleteCat() {
    if (!deletingCat || !selectedBase) return
    await fetch(`/api/categories/${deletingCat.id}`, { method: "DELETE" })
    setDeletingCat(null)
    await loadCats(selectedBase.id)
    await loadBase()
    showToast("Category deleted")
  }

  return (
    <>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-5 h-full">

          {/* Left — Base Categories */}
          <div className="w-full lg:w-80 lg:flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Base Categories</h2>
                <p className="text-xs text-gray-400 mt-0.5">{baseCats.length} total</p>
              </div>
              <button
                onClick={() => { setAddingBase(true); setNewBaseName("") }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : baseCats.length === 0 && !addingBase ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                  <FolderOpen className="w-8 h-8 text-gray-200" />
                  <p className="text-xs">No base categories yet</p>
                </div>
              ) : null}

              {addingBase && (
                <div className="flex items-center gap-1 p-2 bg-accent-50 border border-accent-200 rounded-lg">
                  <input
                    autoFocus
                    value={newBaseName}
                    onChange={(e) => setNewBaseName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddBase(); if (e.key === "Escape") setAddingBase(false) }}
                    placeholder="Category name…"
                    className="flex-1 text-xs bg-transparent outline-none text-gray-800 placeholder:text-gray-400"
                  />
                  <button onClick={handleAddBase} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setAddingBase(false)} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}

              {baseCats.map((bc) => (
                <div
                  key={bc.id}
                  onClick={() => setSelectedBase(bc)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer group transition-colors",
                    selectedBase?.id === bc.id ? "bg-accent-50 border border-accent-200" : "hover:bg-gray-50"
                  )}
                >
                  {editingBase?.id === bc.id ? (
                    <input
                      autoFocus
                      value={editingBase.name}
                      onChange={(e) => setEditingBase({ ...editingBase, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") handleEditBase(); if (e.key === "Escape") setEditingBase(null) }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-xs bg-white border border-blue-300 rounded px-2 py-1 outline-none"
                    />
                  ) : (
                    <span className={cn("flex-1 text-xs font-medium", selectedBase?.id === bc.id ? "text-accent-700" : "text-gray-700")}>
                      {bc.name}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {bc._count?.categories ?? 0}
                  </span>
                  {editingBase?.id === bc.id ? (
                    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={handleEditBase} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-3 h-3" /></button>
                      <button onClick={() => setEditingBase(null)} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingBase({ id: bc.id, name: bc.name })} className="p-1 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeletingBase(bc)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right — Sub Categories */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col">
            {!selectedBase ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3">
                <FolderOpen className="w-12 h-12" />
                <p className="text-sm font-medium">Select a base category to manage its sub-categories</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">{selectedBase.name} — Categories</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{categories.length} sub-categories</p>
                  </div>
                  <button
                    onClick={() => { setAddingCat(true); setNewCatName("") }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Category
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {catLoading ? (
                    <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {addingCat && (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-accent-50 border border-accent-200 rounded-lg">
                          <Tag className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <input
                            autoFocus
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddCat(); if (e.key === "Escape") setAddingCat(false) }}
                            placeholder="Category name…"
                            className="flex-1 text-xs bg-transparent outline-none text-gray-800 placeholder:text-gray-400"
                          />
                          <button onClick={handleAddCat} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setAddingCat(false)} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      )}

                      {categories.length === 0 && !addingCat ? (
                        <div className="col-span-2 flex flex-col items-center justify-center py-10 text-gray-300 gap-2">
                          <Tag className="w-8 h-8" />
                          <p className="text-xs text-gray-400">No categories yet — click Add Category to create one</p>
                        </div>
                      ) : categories.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg group hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                          <Tag className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                          {editingCat?.id === cat.id ? (
                            <>
                              <input
                                autoFocus
                                value={editingCat.name}
                                onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") handleEditCat(); if (e.key === "Escape") setEditingCat(null) }}
                                className="flex-1 text-xs bg-white border border-blue-300 rounded px-2 py-0.5 outline-none"
                              />
                              <button onClick={handleEditCat} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-3 h-3" /></button>
                              <button onClick={() => setEditingCat(null)} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X className="w-3 h-3" /></button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-xs font-medium text-gray-700">{cat.name}</span>
                              {(cat._count?.assets ?? 0) > 0 && (
                                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{cat._count?.assets}</span>
                              )}
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingCat({ id: cat.id, name: cat.name })} className="p-1 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => setDeletingCat(cat)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Base Category confirm */}
      {deletingBase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Delete &ldquo;{deletingBase.name}&rdquo;?</p>
              <p className="text-xs text-gray-500 mt-1">This will also delete all sub-categories and may affect linked assets.</p>
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={() => setDeletingBase(null)} className="flex-1 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDeleteBase} className="flex-1 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category confirm */}
      {deletingCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Delete &ldquo;{deletingCat.name}&rdquo;?</p>
              <p className="text-xs text-gray-500 mt-1">Assets linked to this category will be affected.</p>
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={() => setDeletingCat(null)} className="flex-1 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDeleteCat} className="flex-1 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-green-400" /> {toast}
        </div>
      )}
    </>
  )
}
