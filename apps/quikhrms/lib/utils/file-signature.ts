/**
 * Content-based file-type validation ("magic bytes").
 *
 * Browser-supplied MIME (file.type) and the filename extension are both
 * attacker-controlled — an .html or .svg payload can be renamed .pdf and sent
 * with `Content-Type: application/pdf`. These helpers sniff the actual leading
 * bytes so we can reject files whose real content doesn't match the claim.
 */

/** Detect a MIME from the buffer's magic bytes, or null if unrecognised. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  const b = buf;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";                 // %PDF
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";                       // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";                                        // JPEG
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";                  // RIFF....WEBP
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";                                         // GIF
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "image/heic";     // ....ftyp (HEIC/HEIF/MP4-family)
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) return "application/zip"; // PK.. (docx/xlsx/pptx)
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "application/x-ole-storage";        // legacy .doc/.xls
  // AutoCAD DWG — every version tag (AC1006 through AC1032) starts "AC10".
  if (b[0] === 0x41 && b[1] === 0x43 && b[2] === 0x31 && b[3] === 0x30) return "application/acad";                // AC10.. (DWG)
  return null;
}

/** True when the sniffed content is compatible with the claimed MIME. */
export function contentMatchesClaim(buf: Buffer, claimedMime: string): boolean {
  const sniffed = sniffMime(buf);
  if (!sniffed) return false; // unrecognised / spoofed → reject
  const claim = (claimedMime || "").toLowerCase();
  if (sniffed === claim) return true;
  if (sniffed === "image/jpeg" && (claim === "image/jpg" || claim === "image/jpeg")) return true;
  if (sniffed === "image/heic" && (claim === "image/heic" || claim === "image/heif")) return true;
  if (sniffed === "application/zip" && claim === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  if (sniffed === "application/x-ole-storage" && claim === "application/msword") return true;
  // Browsers report wildly inconsistent (or no) MIME for .dwg — accept the
  // common variants, plus the generic/empty fallback browsers send instead.
  if (sniffed === "application/acad" && ["application/acad", "application/x-dwg", "application/x-autocad", "image/vnd.dwg", "application/dwg", "application/octet-stream", ""].includes(claim)) return true;
  return false;
}
