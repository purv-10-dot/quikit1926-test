"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useActiveBrandId } from "@/hooks/useActiveBrandId";
import {
  Plus,
  Trash2,
  Upload,
  X,
  FileText,
  Film,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Quote,
  LayoutGrid,
  BookOpen,
  Layers,
} from "lucide-react";

// ─── Type system ─────────────────────────────────────────────────────────────

type AssetType =
  | "logo"
  | "gallery_image"
  | "image"
  | "video"
  | "pdf"
  | "case_study"
  | "blog_post"
  | "testimonial"
  | "portfolio_item";

const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: "Logo",
  gallery_image: "Gallery Image",
  image: "Gallery Image",
  case_study: "Case Study",
  blog_post: "Blog Post",
  video: "Video",
  pdf: "PDF",
  testimonial: "Testimonial",
  portfolio_item: "Portfolio",
};

// Types that render as square visual cards
const VISUAL_TYPES = new Set(["logo", "gallery_image", "image", "video"]);

// Types that render as wide document cards
const DOCUMENT_TYPES = new Set([
  "pdf",
  "case_study",
  "blog_post",
  "testimonial",
  "portfolio_item",
]);

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  types: string[]; // empty = all
}

const TABS: Tab[] = [
  { id: "all", label: "All", types: [] },
  { id: "logos", label: "Logos", types: ["logo"] },
  { id: "images", label: "Images", types: ["gallery_image", "image"] },
  { id: "videos", label: "Videos", types: ["video"] },
  { id: "case_studies", label: "Case Studies", types: ["case_study"] },
  {
    id: "documents",
    label: "Documents",
    types: ["pdf", "blog_post", "testimonial", "portfolio_item"],
  },
];

// Groups shown when "All" tab is active
const GROUP_ORDER: { types: string[]; label: string }[] = [
  { types: ["logo"], label: "Logos" },
  { types: ["gallery_image", "image"], label: "Gallery Images" },
  { types: ["video"], label: "Videos" },
  { types: ["case_study"], label: "Case Studies" },
  { types: ["blog_post"], label: "Blog Posts" },
  { types: ["pdf"], label: "PDFs" },
  { types: ["testimonial"], label: "Testimonials" },
  { types: ["portfolio_item"], label: "Portfolio" },
];

// Upload modal type options
const UPLOAD_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: "Gallery Image", value: "gallery_image" },
  { label: "Logo", value: "logo" },
  { label: "Video", value: "video" },
  { label: "PDF", value: "pdf" },
  { label: "Case Study", value: "case_study" },
  { label: "Blog Post", value: "blog_post" },
  { label: "Testimonial", value: "testimonial" },
  { label: "Portfolio", value: "portfolio_item" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface Asset {
  _id: string;
  name: string;
  type: string;
  url: string;
  thumbnailUrl?: string | null;
  fileSize?: number | null;
  format?: string | null;
  dimensions?: string | null;
  description?: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Type-specific placeholder visuals ──────────────────────────────────────

const TYPE_PLACEHOLDER: Record<
  string,
  { bg: string; iconColor: string; render: (name: string) => ReactNode }
> = {
  logo: {
    bg: "linear-gradient(135deg,rgba(139,92,246,0.35),rgba(167,139,250,0.15))",
    iconColor: "#a78bfa",
    render: (name) => (
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#7c3aed,#a78bfa)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "-0.02em",
        }}
      >
        {getInitials(name) || "L"}
      </div>
    ),
  },
  gallery_image: {
    bg: "linear-gradient(135deg,rgba(30,50,40,0.7),rgba(50,80,60,0.4))",
    iconColor: "rgba(255,255,255,0.3)",
    render: () => <ImageIcon size={40} style={{ color: "rgba(255,255,255,0.25)" }} />,
  },
  image: {
    bg: "linear-gradient(135deg,rgba(30,50,40,0.7),rgba(50,80,60,0.4))",
    iconColor: "rgba(255,255,255,0.3)",
    render: () => <ImageIcon size={40} style={{ color: "rgba(255,255,255,0.25)" }} />,
  },
  video: {
    bg: "linear-gradient(135deg,rgba(10,20,35,0.85),rgba(20,40,70,0.6))",
    iconColor: "#60a5fa",
    render: () => (
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(96,165,250,0.15)",
          border: "1.5px solid rgba(96,165,250,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Play size={22} fill="rgba(96,165,250,0.9)" style={{ color: "rgba(96,165,250,0.9)", marginLeft: 3 }} />
      </div>
    ),
  },
  case_study: {
    bg: "linear-gradient(135deg,rgba(30,58,138,0.5),rgba(59,130,246,0.2))",
    iconColor: "#93c5fd",
    render: () => <FileText size={28} style={{ color: "#93c5fd" }} />,
  },
  blog_post: {
    bg: "linear-gradient(135deg,rgba(120,53,15,0.5),rgba(251,146,60,0.2))",
    iconColor: "#fcd34d",
    render: () => <BookOpen size={28} style={{ color: "#fbbf24" }} />,
  },
  pdf: {
    bg: "linear-gradient(135deg,rgba(127,29,29,0.5),rgba(239,68,68,0.2))",
    iconColor: "#fca5a5",
    render: () => <FileText size={28} style={{ color: "#fca5a5" }} />,
  },
  testimonial: {
    bg: "linear-gradient(135deg,rgba(6,78,59,0.5),rgba(16,185,129,0.2))",
    iconColor: "#6ee7b7",
    render: () => <Quote size={28} style={{ color: "#6ee7b7" }} />,
  },
  portfolio_item: {
    bg: "linear-gradient(135deg,rgba(49,46,129,0.5),rgba(99,102,241,0.2))",
    iconColor: "#a5b4fc",
    render: () => <LayoutGrid size={28} style={{ color: "#a5b4fc" }} />,
  },
};

function getPlaceholder(type: string) {
  return TYPE_PLACEHOLDER[type] ?? TYPE_PLACEHOLDER.gallery_image;
}

// ─── Square card (logo / image / video) ──────────────────────────────────────

function SquareCard({
  asset,
  onDelete,
}: {
  asset: Asset;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const typeLabel = ASSET_TYPE_LABELS[asset.type] ?? asset.type;
  const placeholder = getPlaceholder(asset.type);
  const hasImage =
    (asset.type === "logo" || asset.type === "gallery_image" || asset.type === "image") &&
    asset.url;

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/api/assets/${asset._id}`, { method: "DELETE" });
      if (res.ok) onDelete(asset._id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: `1px solid ${hovered ? "rgba(255, 255, 255, 0.20)" : "rgba(255, 255, 255, 0.10)"}`,
        borderRadius: 16,
        overflow: "hidden",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        transition: "border-color 0.18s",
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
    >
      {/* Preview — 70% height */}
      <div
        style={{
          height: 160,
          position: "relative",
          background: placeholder.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {hasImage ? (
          <img
            src={asset.url}
            alt={asset.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          placeholder.render(asset.name)
        )}

        {/* Type badge */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {asset.type === "video" && <Film size={9} />}
          {(asset.type === "logo" || asset.type === "gallery_image" || asset.type === "image") && <ImageIcon size={9} />}
          {typeLabel.toUpperCase()}
        </div>

        {/* Delete overlay */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.8)" : "rgba(239,68,68,0.5)"}`,
                background: confirmDelete ? "rgba(239,68,68,0.55)" : "rgba(239,68,68,0.18)",
                color: "#fff",
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {confirmDelete ? "Confirm" : "Delete"}
            </button>
          </div>
        )}
      </div>

      {/* Bottom — 30% */}
      <div style={{ padding: "10px 12px 11px" }}>
        <p
          style={{
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 2,
          }}
          title={asset.name}
        >
          {asset.name}
        </p>
        <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>
          {typeLabel}
          {asset.fileSize ? ` · ${formatBytes(asset.fileSize)}` : ""}
        </p>
      </div>
    </div>
  );
}

// ─── Wide document card (case_study / blog_post / pdf / etc.) ────────────────

function WideCard({
  asset,
  onDelete,
}: {
  asset: Asset;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const typeLabel = ASSET_TYPE_LABELS[asset.type] ?? asset.type;
  const placeholder = getPlaceholder(asset.type);

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/api/assets/${asset._id}`, { method: "DELETE" });
      if (res.ok) onDelete(asset._id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${hovered ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.10)"}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 0.18s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
    >
      {/* Left icon block */}
      <div
        style={{
          width: 80,
          flexShrink: 0,
          background: placeholder.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {placeholder.render(asset.name)}
      </div>

      {/* Right content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "14px 14px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 3,
        }}
      >
        <p
          style={{
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.4,
          }}
          title={asset.name}
        >
          {asset.name}
        </p>
        {asset.description && (
          <p
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              lineHeight: 1.4,
            }}
          >
            {asset.description}
          </p>
        )}
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>
          {typeLabel}
          {asset.fileSize ? ` · ${formatBytes(asset.fileSize)}` : ""}
          {asset.format ? ` · ${asset.format.toUpperCase()}` : ""}
        </p>
      </div>

      {/* Delete button — visible on hover */}
      {hovered && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 12px",
              borderRadius: 8,
              border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.8)" : "rgba(239,68,68,0.4)"}`,
              background: confirmDelete ? "rgba(239,68,68,0.5)" : "rgba(239,68,68,0.12)",
              color: confirmDelete ? "#fff" : "#fca5a5",
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {confirmDelete ? "Confirm" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Asset renderer — picks card type ────────────────────────────────────────

function AssetCard({ asset, onDelete }: { asset: Asset; onDelete: (id: string) => void }) {
  if (DOCUMENT_TYPES.has(asset.type)) {
    return <WideCard asset={asset} onDelete={onDelete} />;
  }
  return <SquareCard asset={asset} onDelete={onDelete} />;
}

// ─── Grouped section (used in All view) ──────────────────────────────────────

function AssetSection({
  label,
  assets,
  onDelete,
}: {
  label: string;
  assets: Asset[];
  onDelete: (id: string) => void;
}) {
  if (assets.length === 0) return null;

  const hasDocuments = assets.some((a) => DOCUMENT_TYPES.has(a.type));
  const hasVisuals = assets.some((a) => VISUAL_TYPES.has(a.type));

  return (
    <div>
      <p
        style={{
          color: "rgba(255,255,255,0.35)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {label} ({assets.length})
      </p>

      {hasDocuments && !hasVisuals ? (
        // document list — stacked
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {assets.map((a) => (
            <AssetCard key={a._id} asset={a} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        // visual grid
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 12,
          }}
        >
          {assets.map((a) => (
            <AssetCard key={a._id} asset={a} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  brandId,
  onClose,
  onUploaded,
}: {
  brandId: string;
  onClose: () => void;
  onUploaded: (asset: Asset) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState("gallery_image");
  const [assetName, setAssetName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_EXTS = ["jpg", "jpeg", "png", "svg", "webp", "gif", "mp4", "mov", "pdf"];

  function autoDetectType(f: File): string {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "svg") return "logo";
    if (f.type.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
    if (f.type === "application/pdf" || ext === "pdf") return "pdf";
    return "gallery_image";
  }

  function pickFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`File type .${ext} not allowed. Use JPG, PNG, SVG, MP4, or PDF.`);
      return;
    }
    setError("");
    setFile(f);
    setAssetType(autoDetectType(f));
    setAssetName(f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("brandId", brandId);
    fd.append("type", assetType);
    if (assetName.trim()) fd.append("name", assetName.trim());

    try {
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const data = unwrap(await res.json());
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      setSuccess(true);
      setTimeout(() => { onUploaded(data.asset); onClose(); }, 700);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        // Primary glass card tokens — design-tokens.md §1. Matches the
        // Create Post wizard step card exactly.
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: 28,
          width: "100%",
          maxWidth: 460,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Add Asset</h2>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
              JPG · PNG · SVG · MP4 · PDF
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "rgba(255,255,255,0.6)" }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => !file && inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pickFile(f); setDragOver(false); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          style={{
            border: `2px dashed ${dragOver ? "rgba(255,255,255,0.5)" : file ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.18)"}`,
            borderRadius: 12,
            padding: "28px 20px",
            textAlign: "center",
            cursor: file ? "default" : "pointer",
            background: dragOver ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
            marginBottom: 18,
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.svg,.webp,.gif,.mp4,.mov,.pdf"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />
          {file ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {success
                ? <CheckCircle2 size={20} color="#22C55E" />
                : <ImageIcon size={20} style={{ color: "rgba(255,255,255,0.55)" }} />}
              <span style={{ color: "#fff", fontSize: 13 }}>{file.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setError(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: 0 }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              <Upload size={28} style={{ color: "rgba(255,255,255,0.25)", margin: "0 auto 10px" }} />
              <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                Drag & drop or <span style={{ color: "#fff", textDecoration: "underline" }}>browse</span>
              </p>
            </>
          )}
        </div>

        {/* Fields — shown after file pick */}
        {file && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
            <div>
              <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 5 }}>
                Asset name
              </label>
              <input
                type="text"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 9,
                  padding: "9px 12px",
                  color: "#fff",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 5 }}>
                Asset type
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {UPLOAD_TYPE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setAssetType(t.value)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 20,
                      border: `1px solid ${assetType === t.value ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.12)"}`,
                      background: assetType === t.value ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)",
                      color: assetType === t.value ? "#fff" : "rgba(255,255,255,0.5)",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.28)", borderRadius: 8, padding: "9px 12px", marginBottom: 14, color: "#fca5a5", fontSize: 12 }}>
            <AlertCircle size={13} />
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 9 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)", fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading || success}
            style={{
              flex: 2,
              padding: "11px 0",
              borderRadius: 10,
              border: "none",
              background: !file || uploading || success ? "rgba(255,255,255,0.25)" : "#fff",
              color: !file || uploading || success ? "rgba(0,0,0,0.35)" : "#0A0A0A",
              fontSize: 13,
              fontWeight: 600,
              cursor: !file || uploading || success ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            {uploading ? <><Loader2 size={14} className="animate-spin" />Uploading…</> : success ? <><CheckCircle2 size={14} />Uploaded!</> : <><Upload size={14} />Upload Asset</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function TabBar({
  activeTab,
  onChange,
  counts,
}: {
  activeTab: string;
  onChange: (id: string) => void;
  counts: Record<string, number>;
}) {
  function tabCount(tab: Tab): number {
    if (tab.types.length === 0) return counts.total ?? 0;
    return tab.types.reduce((s, t) => s + (counts[t] ?? 0), 0);
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        const count = tabCount(tab);
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 20,
              border: `1px solid ${active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.12)"}`,
              background: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)",
              color: active ? "#fff" : "rgba(255,255,255,0.5)",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
            {count > 0 && (
              <span
                style={{
                  background: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  padding: "1px 6px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: active ? "#fff" : "rgba(255,255,255,0.55)",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const activeBrandId = useActiveBrandId();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0 });
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const brandId = activeBrandId ?? "";

  // Get types param for current tab
  function tabTypes(): string[] {
    const tab = TABS.find((t) => t.id === activeTab);
    return tab?.types ?? [];
  }

  const fetchAssets = useCallback(
    async (page = 1, append = false) => {
      if (!brandId) return;
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const types = tabTypes();
        const params = new URLSearchParams({ brandId, page: String(page) });
        if (types.length > 0) params.set("types", types.join(","));

        const res = await fetch(`/api/assets?${params}`);
        if (!res.ok) return;
        const data = unwrap(await res.json());

        setAssets((prev) => append ? [...prev, ...data.assets] : data.assets);
        if (data.counts) setCounts(data.counts);
        setPagination(data.pagination);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, activeTab]
  );

  useEffect(() => {
    fetchAssets(1, false);
  }, [fetchAssets]);

  function handleDeleted(id: string) {
    setAssets((prev) => prev.filter((a) => a._id !== id));
    setPagination((prev) => prev ? { ...prev, total: prev.total - 1 } : prev);
  }

  function handleUploaded(asset: Asset) {
    const types = tabTypes();
    if (types.length === 0 || types.includes(asset.type)) {
      setAssets((prev) => [asset, ...prev]);
    }
    // refresh counts
    fetchAssets(1, false);
  }

  // ── Render content ──────────────────────────────────────────────────────────

  function renderContent() {
    if (loading) {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              // Match the real AssetCard's primary-glass tint so the
              // wallpaper shows through and dimensions don't shift on
              // content arrival. qs-pulse keyframe is in globals.css.
              style={{
                height: 216,
                borderRadius: 16,
                background: "rgba(33, 33, 33, 0.14)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                animation: "qs-pulse 1.4s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      );
    }

    if (assets.length === 0) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "72px 24px", gap: 14 }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={30} style={{ color: "rgba(255,255,255,0.25)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#fff", fontSize: 15, fontWeight: 500 }}>No assets yet</p>
            <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 13, marginTop: 3 }}>
              {activeTab === "all"
                ? "Upload logos, images, videos or documents for your brand."
                : `No ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} found.`}
            </p>
          </div>
          {activeTab === "all" && (
            <button
              onClick={() => setShowUpload(true)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", background: "#fff", color: "#0A0A0A", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 6 }}
            >
              <Plus size={15} />
              Add your first asset
            </button>
          )}
        </div>
      );
    }

    if (activeTab === "all") {
      // Grouped sections
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {GROUP_ORDER.map((group) => {
            const groupAssets = assets.filter((a) => group.types.includes(a.type));
            if (groupAssets.length === 0) return null;
            const allDocs = groupAssets.every((a) => DOCUMENT_TYPES.has(a.type));
            return (
              <div key={group.label}>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                  {group.label} ({groupAssets.length})
                </p>
                {allDocs ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {groupAssets.map((a) => <AssetCard key={a._id} asset={a} onDelete={handleDeleted} />)}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 12 }}>
                    {groupAssets.map((a) => <AssetCard key={a._id} asset={a} onDelete={handleDeleted} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Filtered tab — mixed layout
    const tabDef = TABS.find((t) => t.id === activeTab);
    const allDocs = tabDef?.types.every((t) => DOCUMENT_TYPES.has(t)) ?? false;

    if (allDocs) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {assets.map((a) => <AssetCard key={a._id} asset={a} onDelete={handleDeleted} />)}
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 12 }}>
        {assets.map((a) => <AssetCard key={a._id} asset={a} onDelete={handleDeleted} />)}
      </div>
    );
  }

  return (
    /* Outer page wrapper — no padding/margin/max-width. The
       dashboard layout shell owns all outer spacing. */
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 500, marginBottom: 4 }}>Asset Library</h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}>
            Upload and manage your media assets
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "none", background: "#fff", color: "#0A0A0A", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={15} />
          Add Assets
        </button>
      </div>

      {/* Tabs */}
      <TabBar activeTab={activeTab} onChange={setActiveTab} counts={counts} />

      {/* Content */}
      {renderContent()}

      {/* Load more */}
      {!loading && pagination?.hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
          <button
            onClick={() => fetchAssets((pagination.page ?? 1) + 1, true)}
            disabled={loadingMore}
            style={{ padding: "9px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: loadingMore ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 7 }}
          >
            {loadingMore ? <><Loader2 size={14} className="animate-spin" />Loading…</> : `Load more (${pagination.total - assets.length} remaining)`}
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && brandId && (
        <UploadModal brandId={brandId} onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />
      )}

      {/* No brand guard */}
      {showUpload && !brandId && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.60)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={() => setShowUpload(false)}
        >
          <div style={{ background: "rgba(33, 33, 33, 0.14)", border: "1px solid rgba(255, 255, 255, 0.10)", borderRadius: 16, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)", padding: 28, maxWidth: 340, textAlign: "center" }}>
            <p style={{ color: "#fff", fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No brand selected</p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Select or create a brand workspace before uploading assets.</p>
          </div>
        </div>
      )}
    </div>
  );
}
