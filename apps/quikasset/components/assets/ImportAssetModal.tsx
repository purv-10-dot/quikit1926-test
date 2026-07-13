"use client"

import { useState, useRef } from "react"
import { X, Upload, FileSpreadsheet, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import * as XLSX from "xlsx"

type ImportRow = Record<string, string>

const SYSTEM_FIELDS = [
  { key: "itemName",     label: "Item Name",      required: true  },
  { key: "itemCode",     label: "Item Code",       required: true  },
  { key: "serialNumber", label: "Serial Number",   required: true  },
  { key: "invoiceNumber",label: "Invoice Number",  required: true  },
  { key: "assetType",    label: "Asset Type",      required: true  },
  { key: "baseCategory", label: "Base Category",   required: true  },
  { key: "category",     label: "Category",        required: true  },
  { key: "purchaseDate", label: "Purchase Date",   required: true  },
  { key: "location",     label: "Location",        required: true  },
  { key: "condition",    label: "Condition",       required: true  },
  { key: "description",  label: "Description",     required: false },
  { key: "warehouse",    label: "Warehouse",       required: false },
  { key: "price",        label: "Price",           required: false },
  { key: "assignedTo",   label: "Assigned To",     required: false },
] as const

type FieldKey = typeof SYSTEM_FIELDS[number]["key"]

interface Props {
  onClose: () => void
  onImport: (rows: ImportRow[]) => Promise<void>
}

export default function ImportAssetModal({ onClose, onImport }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({})
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState("")
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function parseFile(f: File) {
    setParseError("")
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const result = e.target?.result
        if (!result) { setParseError("Could not read file."); return }
        const data = new Uint8Array(result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array", raw: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows2d: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false })
        const nonEmpty = rows2d.filter((r) => r.some((c) => String(c).trim()))
        if (!nonEmpty.length) { setParseError("The file appears to be empty."); return }
        const hdrs = nonEmpty[0].map(String).filter(Boolean)
        if (!hdrs.length) { setParseError("No column headers found in the first row."); return }
        const dataRows = nonEmpty.slice(1).map((r) =>
          Object.fromEntries(hdrs.map((h, i) => [h, String(r[i] ?? "").trim()]))
        )
        setHeaders(hdrs)
        setRows(dataRows)
        setFile(f)
        const autoMap: Partial<Record<FieldKey, string>> = {}
        for (const sf of SYSTEM_FIELDS) {
          const match = hdrs.find(
            (h) =>
              h.toLowerCase().replace(/[^a-z0-9]/g, "") ===
                sf.label.toLowerCase().replace(/[^a-z0-9]/g, "") ||
              h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(sf.key.toLowerCase())
          )
          if (match) autoMap[sf.key] = match
        }
        setMapping(autoMap)
      } catch {
        setParseError("Could not parse this file. Please use CSV, XLS, or XLSX format.")
      }
    }
    reader.onerror = () => setParseError("Failed to read the file.")
    reader.readAsArrayBuffer(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) parseFile(f)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) parseFile(f)
  }

  async function handleImport() {
    setImporting(true)
    const mapped: ImportRow[] = rows.map((row) => {
      const out: ImportRow = {}
      for (const sf of SYSTEM_FIELDS) {
        out[sf.key] = mapping[sf.key] ? row[mapping[sf.key]!] ?? "" : ""
      }
      return out
    }).filter((r) => r.itemName && r.itemCode && r.serialNumber)
    await onImport(mapped)
    setImporting(false)
  }

  const requiredMapped = SYSTEM_FIELDS.filter((f) => f.required).every((f) => mapping[f.key])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Import Assets</h2>
            <p className="text-xs text-gray-400 mt-0.5">Supports CSV, XLS, and XLSX files</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center px-6 py-4 border-b border-gray-100">
          {[{ n: 1, label: "Upload File" }, { n: 2, label: "Map Fields" }].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-0 flex-1">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                  step === n ? "bg-accent-600 text-white" :
                  step > n ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"
                )}>
                  {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
                </div>
                <span className={cn("text-xs font-medium", step === n ? "text-accent-700" : step > n ? "text-green-600" : "text-gray-400")}>
                  {label}
                </span>
              </div>
              {i < 1 && <div className={cn("flex-1 h-px mx-4", step > 1 ? "bg-green-400" : "bg-gray-200")} />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors",
                  dragOver ? "border-accent-400 bg-accent-50" :
                  file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-accent-300 hover:bg-gray-50"
                )}
              >
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                {file ? (
                  <>
                    <FileSpreadsheet className="w-10 h-10 text-green-500 mb-3" />
                    <p className="text-sm font-semibold text-green-700">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{rows.length} rows detected · Click to replace</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-300 mb-3" />
                    <p className="text-sm font-semibold text-gray-600">Drop your file here or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Accepts .csv, .xlsx, .xls</p>
                  </>
                )}
              </div>
              {parseError && (
                <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {parseError}
                </div>
              )}
              {file && !parseError && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Detected columns ({headers.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {headers.map((h) => (
                      <span key={h} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">{h}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Match each system field to a column from your file. Required fields must be mapped.</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-1/2">System Field</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-1/2">Your Column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SYSTEM_FIELDS.map((sf, i) => (
                      <tr key={sf.key} className={cn("border-b border-gray-100 last:border-0", i % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-700">{sf.label}</span>
                          {sf.required && <span className="text-red-500 ml-1">*</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={mapping[sf.key] ?? ""}
                            onChange={(e) => setMapping((m) => ({ ...m, [sf.key]: e.target.value || undefined }))}
                            className={cn(
                              "w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
                              mapping[sf.key] ? "border-green-300 text-gray-800" : "border-gray-200 text-gray-400"
                            )}
                          >
                            <option value="">— Skip —</option>
                            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">{rows.length} rows will be imported</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={step === 1 ? onClose : () => setStep(1)}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          {step === 1 ? (
            <button
              disabled={!file || !!parseError}
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              disabled={!requiredMapped || importing}
              onClick={handleImport}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? "Importing…" : `Import ${rows.length} Assets`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
