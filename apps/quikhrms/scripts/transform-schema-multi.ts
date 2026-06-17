// One-shot helper: rewrites schema.prisma to scope all models + enums to
// the `quikhrms` Postgres schema (multiSchema preview).
//
// Run:  npx tsx prisma/transform-schema-multi.ts
//
// Idempotent: skips models/enums that already carry @@schema.

import { readFileSync, writeFileSync } from "fs";
import path from "path";

const FILE = path.resolve(__dirname, "schema.prisma");
const SCHEMA_NAME = "quikhrms";

const src = readFileSync(FILE, "utf-8");
const lines = src.split("\n");
const out: string[] = [];

let mode: "none" | "generator" | "datasource" | "model" | "enum" = "none";
let blockStartIdx = -1;
let blockKind: "model" | "enum" | null = null;
let blockHasSchema = false;

function flushBlock(closingIdx: number) {
  if (!blockKind) return;
  if (!blockHasSchema) {
    out.push(`  @@schema("${SCHEMA_NAME}")`);
  }
  blockKind = null;
  blockHasSchema = false;
  blockStartIdx = -1;
  void closingIdx;
}

let generatorRewritten = false;
let datasourceRewritten = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  // Top-level block detect.
  if (mode === "none") {
    if (/^generator\s+\w+\s*\{/.test(trimmed)) { mode = "generator"; out.push(line); continue; }
    if (/^datasource\s+\w+\s*\{/.test(trimmed)) { mode = "datasource"; out.push(line); continue; }
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      mode = "model";
      blockKind = "model";
      blockHasSchema = false;
      blockStartIdx = i;
      out.push(line);
      continue;
    }
    const enumMatch = trimmed.match(/^enum\s+(\w+)\s*\{/);
    if (enumMatch) {
      mode = "enum";
      blockKind = "enum";
      blockHasSchema = false;
      blockStartIdx = i;
      out.push(line);
      continue;
    }
    out.push(line);
    continue;
  }

  // Inside generator/datasource — patch + watch for close.
  if (mode === "generator") {
    if (!generatorRewritten && /previewFeatures\s*=/.test(trimmed)) {
      // Replace existing previewFeatures line.
      out.push(`  previewFeatures = ["multiSchema"]`);
      generatorRewritten = true;
      continue;
    }
    if (trimmed === "}") {
      if (!generatorRewritten) {
        out.push(`  previewFeatures = ["multiSchema"]`);
        generatorRewritten = true;
      }
      out.push(line);
      mode = "none";
      continue;
    }
    out.push(line);
    continue;
  }
  if (mode === "datasource") {
    if (!datasourceRewritten && /^schemas\s*=/.test(trimmed)) {
      out.push(`  schemas  = ["${SCHEMA_NAME}"]`);
      datasourceRewritten = true;
      continue;
    }
    if (trimmed === "}") {
      if (!datasourceRewritten) {
        out.push(`  schemas  = ["${SCHEMA_NAME}"]`);
        datasourceRewritten = true;
      }
      out.push(line);
      mode = "none";
      continue;
    }
    out.push(line);
    continue;
  }

  // Inside model/enum.
  if (mode === "model" || mode === "enum") {
    if (/@@schema\(/.test(trimmed)) blockHasSchema = true;
    if (trimmed === "}") {
      flushBlock(i);
      out.push(line);
      mode = "none";
      void blockStartIdx;
      continue;
    }
    out.push(line);
    continue;
  }
}

writeFileSync(FILE, out.join("\n"), "utf-8");
console.log("Schema rewritten with @@schema(\"quikhrms\") on all models + enums.");
