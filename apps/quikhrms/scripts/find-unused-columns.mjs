// Conservative dead-column finder.
// 1. Parse schema.prisma → per-model scalar columns (skip relation nav fields).
// 2. Tokenize all of src/ + scripts/ + prisma/seed.ts into a Set of identifiers.
// 3. Flag any column whose exact name never appears as a token anywhere.
//    (Conservative: a single textual reference anywhere keeps the column.)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");

// ---- collect enum + model names ----
const enumNames = new Set([...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map(m => m[1]));
const modelNames = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]));

// ---- parse models → scalar columns ----
const models = {}; // model -> [{name, type, isFk}]
const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
for (const [, name, body] of blocks) {
  const cols = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const m = line.match(/^(\w+)\s+([\w\[\]\?\.]+)/);
    if (!m) continue;
    const fname = m[1];
    let base = m[2].replace(/[\[\]\?]/g, "");
    // relation navigation field (type is a model) → NOT a db column
    if (modelNames.has(base)) continue;
    const isEnum = enumNames.has(base);
    cols.push({ name: fname, type: m[2], isEnum });
  }
  models[name] = cols;
}

// ---- build inverted index: token -> Set(bucket) ----
const SRC_DIRS = ["app", "components", "lib", "scripts"];
const EXTRA_FILES = ["prisma/seed.ts"];
const exts = new Set([".ts", ".tsx", ".js", ".mjs"]);
const idx = new Map(); // token -> Set(bucket)
function bucketFor(p) {
  const u = p.replace(/\\/g, "/");
  if (u.includes("/lib/validations/")) return "validation";
  if (u.includes("/lib/types/")) return "type";
  if (u.includes("/app/api/")) return "api";
  if (u.endsWith(".tsx") || u.includes("/components/")) return "ui";
  if (u.includes("/scripts/") || u.endsWith("seed.ts")) return "seed";
  return "lib";
}
function tokenize(text, bucket) {
  for (const t of text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []) {
    let s = idx.get(t); if (!s) idx.set(t, (s = new Set()));
    s.add(bucket);
  }
}
function walk(dir) {
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (e === "node_modules" || e === ".next") continue; walk(p); }
    else if (exts.has(p.slice(p.lastIndexOf(".")))) {
      if (p.endsWith("find-unused-columns.mjs")) continue;
      try { tokenize(readFileSync(p, "utf8"), bucketFor(p)); } catch {}
    }
  }
}
for (const d of SRC_DIRS) walk(join(ROOT, d));
for (const f of EXTRA_FILES) { try { tokenize(readFileSync(join(ROOT, f), "utf8"), "seed"); } catch {} }

// ---- classify ----
// "real use" buckets = api | ui | lib (actually queried/rendered/business logic)
// low-signal buckets  = validation | type (schema mirrors) , seed (only inserted)
const ALWAYS_KEEP = new Set(["id", "orgId", "createdAt", "updatedAt", "deletedAt"]);
const REAL = new Set(["api", "ui", "lib"]);
let totalCols = 0;
const neverAnywhere = [], onlyTypeValidation = [], onlySeedTypeValidation = [];
for (const [model, cols] of Object.entries(models)) {
  totalCols += cols.length;
  for (const c of cols) {
    if (ALWAYS_KEEP.has(c.name)) continue;
    const b = idx.get(c.name) || new Set();
    const entry = `${model}.${c.name}: ${c.type}  [${[...b].join(",") || "—"}]`;
    if (b.size === 0) neverAnywhere.push(entry);
    else if (![...b].some(x => REAL.has(x))) {
      if (b.has("seed")) onlySeedTypeValidation.push(entry);
      else onlyTypeValidation.push(entry);
    }
  }
}
function dump(title, arr) {
  console.log(`\n## ${title}  (${arr.length})`);
  for (const e of arr) console.log("   - " + e);
}
console.log(`Models ${Object.keys(models).length}  Scalar columns ${totalCols}`);
dump("A. Never referenced anywhere (safest)", neverAnywhere);
dump("B. Only in validation/type, never queried/rendered (strong candidates)", onlyTypeValidation);
dump("C. Only in seed + validation/type, never read in api/ui/lib (review)", onlySeedTypeValidation);
