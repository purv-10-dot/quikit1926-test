"use client";

/**
 * Client helper: call a server export route and trigger a browser download.
 *
 * Server export routes return either the file (with a Content-Disposition
 * filename) or a JSON `{ success:false, error }` on failure. This resolves the
 * filename from the header and surfaces server errors as thrown Errors so the
 * caller can toast them.
 */
export async function downloadExport(
  basePath: string,
  params: Record<string, string | number | boolean | undefined | null>,
): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }

  const res = await fetch(`${basePath}?${qs.toString()}`);
  const contentType = res.headers.get("content-type") ?? "";

  // Errors come back as JSON even on the file endpoint.
  if (!res.ok || contentType.includes("application/json")) {
    let msg = "Export failed";
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* non-JSON error body — keep default message */
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "export";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
