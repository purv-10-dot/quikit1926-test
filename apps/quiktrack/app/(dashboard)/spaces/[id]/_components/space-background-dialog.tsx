"use client";

import { useRef, useState } from "react";
import { Button } from "@quikit/ui";
import { Check, Upload } from "lucide-react";
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  BACKGROUND_IMAGE_TYPES,
  MAX_BACKGROUND_IMAGE_BYTES,
  backgroundCss,
  type SpaceBackground,
} from "@/lib/spaceBackgrounds";
import { SpaceDialog } from "./space-dialog";

type Tab = "color" | "gradient" | "image";

/**
 * "Set space background" — pick a theme colour, a gradient, or upload a custom
 * image for this space's header (project header "..." menu).
 *
 * Presets are submitted as KEYS, never raw CSS: the value ends up in a style
 * attribute for every viewer of the space, so the server validates against the
 * same registry this picker reads from (`lib/spaceBackgrounds.ts`).
 */
export function SpaceBackgroundDialog({
  projectId,
  current,
  onClose,
  onSaved,
}: {
  projectId: string;
  current: SpaceBackground | null;
  onClose: () => void;
  onSaved: (background: SpaceBackground | null) => void;
}) {
  const [tab, setTab] = useState<Tab>(current?.type ?? "color");
  const [selected, setSelected] = useState<SpaceBackground | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(next: SpaceBackground | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/background`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Failed to save background");
      }
      onSaved(next);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save background");
    } finally {
      setBusy(false);
    }
  }

  function onPickFile(file: File) {
    if (!BACKGROUND_IMAGE_TYPES.some((t) => t === file.type)) {
      setError("Choose a PNG, JPEG, WebP or GIF image.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError("Couldn't read that file.");
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      // The data URL, not the file, is what gets stored — so measure the encoded
      // string (~4/3 the file size), which is what the server's cap checks.
      if (value.length > MAX_BACKGROUND_IMAGE_BYTES) {
        setError("That image is too large. Choose one under 1.5 MB.");
        return;
      }
      setError(null);
      setSelected({ type: "image", value });
    };
    reader.readAsDataURL(file);
  }

  const presets = tab === "gradient" ? BACKGROUND_GRADIENTS : BACKGROUND_COLORS;
  const previewCss = backgroundCss(selected);

  return (
    <SpaceDialog
      open
      title="Set space background"
      description="Personalise this space's header. Everyone who can see the space sees the same background."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button
            variant="outline"
            size="md"
            onClick={() => void save(null)}
            disabled={busy || !current}
          >
            Remove background
          </Button>
          <Button variant="outline" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void save(selected)}
            loading={busy}
            disabled={busy || !selected}
          >
            Save
          </Button>
        </>
      }
    >
      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div
        className="mb-4 flex h-24 items-end rounded-lg border border-gray-200 p-3"
        style={previewCss ? { background: previewCss } : { backgroundColor: "#ffffff" }}
      >
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            previewCss ? "bg-black/35 text-white" : "text-gray-500"
          }`}
        >
          Preview
        </span>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["color", "gradient", "image"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
              tab === t
                ? "border-accent-600 font-medium text-accent-700"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t === "image" ? "Custom image" : `${t}s`}
          </button>
        ))}
      </div>

      {tab === "image" ? (
        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept={BACKGROUND_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              // Reset so re-picking the same file fires onChange again.
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-sm text-gray-600 hover:border-accent-400 hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload className="h-5 w-5 text-gray-400" />
            {selected?.type === "image" ? "Choose a different image" : "Upload an image"}
            <span className="text-xs text-gray-400">PNG, JPEG, WebP or GIF · up to 1.5 MB</span>
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-3">
          {presets.map((p) => {
            const isSelected = selected?.type === tab && selected.value === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelected({ type: tab, value: p.key })}
                disabled={busy}
                title={p.label}
                aria-label={p.label}
                aria-pressed={isSelected}
                className={`relative h-16 rounded-lg border transition ${
                  isSelected
                    ? "border-accent-600 ring-2 ring-accent-400"
                    : "border-gray-200 hover:border-gray-400"
                }`}
                style={{ background: p.css }}
              >
                {isSelected && (
                  <Check
                    className={`absolute right-1.5 top-1.5 h-4 w-4 ${
                      p.foreground === "light" ? "text-white" : "text-gray-800"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </SpaceDialog>
  );
}
