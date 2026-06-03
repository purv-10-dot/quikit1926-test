/**
 * Local filesystem driver — for dev and air-gapped LAN deployments.
 *
 * Writes to `<STORAGE_LOCAL_DIR>/<bucket>/<key>`. The "presigned" upload
 * URL is a short-lived signed token routed through a local upload endpoint
 * (see app/api/files/local-upload/[...slug]/route.ts). The "download URL"
 * is the same — it returns the file via a streamed response.
 *
 * NEVER expose the local driver to the public internet. It's fine for
 * development and for the current LAN deployment where the server binds
 * to 0.0.0.0:3010 inside a trusted network.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { StorageDriver, PresignedUploadUrl, PresignedDownloadUrl } from "./driver";

export interface LocalDriverConfig {
  bucket: string;
  rootDir: string;         // filesystem root for all files
  baseUrl: string;         // e.g. "http://192.168.2.7:3010"
  signingSecret: string;   // used to HMAC-sign upload/download tokens
  uploadUrlTtlSeconds?: number;
  downloadUrlTtlSeconds?: number;
}

function signToken(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export class LocalDriver implements StorageDriver {
  public readonly kind = "local" as const;
  public readonly bucket: string;
  private cfg: LocalDriverConfig;

  constructor(cfg: LocalDriverConfig) {
    this.cfg = cfg;
    this.bucket = cfg.bucket;
  }

  private absPath(key: string): string {
    // Reject path traversal defensively.
    if (key.includes("..") || key.startsWith("/") || key.startsWith("\\")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return path.join(this.cfg.rootDir, this.bucket, key);
  }

  /**
   * Build a signed token that the local-upload endpoint can verify.
   * Format: base64url(JSON{ key, ct, cl, exp }).sig
   */
  private buildToken(
    key: string,
    contentType: string,
    contentLength: number | undefined,
    mode: "put" | "get",
    ttlSec: number
  ): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const body = { k: key, ct: contentType, cl: contentLength, m: mode, exp };
    const bodyB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
    const sig = signToken(this.cfg.signingSecret, bodyB64);
    return `${bodyB64}.${sig}`;
  }

  /** Verify a token from the upload/download endpoint. */
  verifyToken(
    token: string,
    expectedMode: "put" | "get"
  ): { key: string; contentType: string; contentLength?: number } | null {
    const [bodyB64, sig] = token.split(".");
    if (!bodyB64 || !sig) return null;
    const expected = signToken(this.cfg.signingSecret, bodyB64);
    // Constant-time comparison
    if (sig.length !== expected.length) return null;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (mismatch !== 0) return null;
    let body: any;
    try {
      body = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (body.m !== expectedMode) return null;
    if (typeof body.exp !== "number" || body.exp < Math.floor(Date.now() / 1000)) return null;
    return { key: body.k, contentType: body.ct, contentLength: body.cl };
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl> {
    const ttl = params.expiresIn ?? this.cfg.uploadUrlTtlSeconds ?? 300;
    const token = this.buildToken(params.key, params.contentType, params.contentLength, "put", ttl);
    return {
      method: "PUT",
      url: `${this.cfg.baseUrl}/api/files/local-upload?token=${encodeURIComponent(token)}`,
      headers: {
        "Content-Type": params.contentType,
        "Content-Length": String(params.contentLength),
      },
      expiresIn: ttl,
    };
  }

  async getPresignedDownloadUrl(params: {
    key: string;
    fileName?: string;
    expiresIn?: number;
  }): Promise<PresignedDownloadUrl> {
    const ttl = params.expiresIn ?? this.cfg.downloadUrlTtlSeconds ?? 300;
    const token = this.buildToken(params.key, "", undefined, "get", ttl);
    const url = new URL(`${this.cfg.baseUrl}/api/files/local-download`);
    url.searchParams.set("token", token);
    if (params.fileName) url.searchParams.set("fn", params.fileName);
    return { url: url.toString(), expiresIn: ttl };
  }

  async putObject(params: { key: string; body: Buffer | Uint8Array; contentType: string }) {
    const abs = this.absPath(params.key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, params.body);
  }

  async headObject(key: string) {
    const abs = this.absPath(key);
    try {
      const stat = await fs.stat(abs);
      return {
        exists: true,
        contentLength: stat.size,
        etag: undefined,
      };
    } catch {
      return { exists: false };
    }
  }

  async deleteObject(key: string): Promise<void> {
    const abs = this.absPath(key);
    try {
      await fs.unlink(abs);
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
  }

  /** Write a buffer for the local-upload endpoint (verifies token first). */
  async acceptUpload(key: string, body: Buffer): Promise<void> {
    return this.putObject({ key, body, contentType: "application/octet-stream" });
  }

  /** Read a buffer for the local-download endpoint. */
  async readObject(key: string): Promise<Buffer> {
    return fs.readFile(this.absPath(key));
  }
}
