// Model-attributed "never-written" column finder.
// A column that no code path ever writes only ever holds NULL/its default →
// dropping it loses no data and breaks no write. That is the real safe-to-delete set.
//
// Method:
//  1. Parse schema → per-model scalar columns, excluding @id / @unique / FK-backing
//     scalars / relation nav fields / timestamps (all structural, never "dead").
//  2. Scan src+scripts+seed for db.<model>.{create,createMany,update,updateMany,upsert}
//     and collect the keys written in their data/create/update object LITERALS.
//  3. If any write for a model passes a non-literal (variable) or a {...spread}, the
//     model is marked OPAQUE — we can't see its keys, so we flag NOTHING for it.
//  4. Report, per non-opaque model, columns that never appear as a written key.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
const enumNames = new Set([...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map(m => m[1]));
const modelNames = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]));
const camel = s => s[0].toLowerCase() + s.slice(1);

// ---- parse models ----
const models = {};          // PascalModel -> [{name,type}]
const clientKeyToModel = {}; // camelModel -> PascalModel
const STRUCTURAL = new Set(["id", "orgId", "createdAt", "updatedAt", "deletedAt"]);
for (const [, name, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  clientKeyToModel[camel(name)] = name;
  const fkScalars = new Set();
  // collect FK-backing scalar names from @relation(fields:[...])
  for (const r of body.matchAll(/@relation\([^)]*fields:\s*\[([^\]]+)\]/g))
    r[1].split(",").forEach(f => fkScalars.add(f.trim()));
  const cols = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const m = line.match(/^(\w+)\s+([\w\[\]\?\.]+)(.*)$/);
    if (!m) continue;
    const [, fname, rawType, attrs] = m;
    const base = rawType.replace(/[\[\]\?]/g, "");
    if (modelNames.has(base)) continue;          // relation nav field, not a column
    if (STRUCTURAL.has(fname)) continue;          // id/tenant/timestamps — never dead
    if (fkScalars.has(fname)) continue;           // FK scalar — structural
    if (/@id\b|@unique\b/.test(attrs)) continue;  // key columns — structural
    if (/@default\(/.test(attrs)) continue;       // DB-defaulted — auto-populated, holds data
    if (/@updatedAt\b/.test(attrs)) continue;     // auto-maintained
    cols.push({ name: fname, type: rawType, hasDefault: false });
  }
  models[name] = cols;
}

// ---- scan source: collect GLOBAL written-key set ----
// writtenGlobal = keys inside any prisma write data/create/update literal
//               ∪ keys of any z.object({...}) schema  (covers `data:{...spread}`)
//               ∪ keys assigned via `obj.col =` mutation before a write
const writtenGlobal = new Set();
function balanced(text, openIdx, open = "{", close = "}") {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) return i; }
  }
  return text.length;
}
function collectKeys(block) {
  for (const k of block.matchAll(/\b(\w+)\s*:/g)) writtenGlobal.add(k[1]);     // key: value
  for (const k of block.matchAll(/[\{,]\s*(\w+)\s*[,}]/g)) writtenGlobal.add(k[1]); // shorthand {a, b}
  for (const k of block.matchAll(/[:,]\s*(\w+)\s*[,}]/g)) writtenGlobal.add(k[1]); // value idents (conservative)
}

const WRITE_RE = /\b(?:db|prisma|tx)\.(\w+)\.(create|createMany|update|updateMany|upsert)\b\s*\(/g;
const ZOBJ_RE  = /z\.object\s*\(\s*\{/g;
const ASSIGN_RE = /\.(\w+)\s*=\s*[^=]/g; // obj.field = value  (in-memory mutation that may be persisted)
function scan(text) {
  let m;
  while ((m = WRITE_RE.exec(text))) {
    if (!clientKeyToModel[m[1]]) continue;
    let i = m.index + m[0].length;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== "{") continue;
    const arg = text.slice(i, balanced(text, i) + 1);
    for (const key of ["data", "create", "update"]) {
      const kre = new RegExp("\\b" + key + "\\s*:\\s*", "g");
      let km;
      while ((km = kre.exec(arg))) {
        let j = km.index + km[0].length;
        while (j < arg.length && /\s/.test(arg[j])) j++;
        const b = arg[j] === "[" ? arg.indexOf("{", j) : (arg[j] === "{" ? j : -1);
        if (b !== -1) collectKeys(arg.slice(b, balanced(arg, b) + 1));
      }
    }
  }
  // every z.object({...}) block, anywhere
  while ((m = ZOBJ_RE.exec(text))) {
    const open = m.index + m[0].length - 1;
    collectKeys(text.slice(open, balanced(text, open) + 1));
  }
  // obj.field = ... assignments
  while ((m = ASSIGN_RE.exec(text))) writtenGlobal.add(m[1]);
}

const exts = new Set([".ts", ".tsx", ".js", ".mjs"]);
function walk(dir) {
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (e === "node_modules" || e === ".next") continue; walk(p); }
    else if (exts.has(p.slice(p.lastIndexOf(".")))) {
      try { scan(readFileSync(p, "utf8")); } catch {}
    }
  }
}
walk(join(ROOT, "src"));
walk(join(ROOT, "scripts"));
try { scan(readFileSync(join(ROOT, "prisma/seed.ts"), "utf8")); } catch {}

// ---- report ----
let nModels = 0, nDead = 0;
const report = [];
for (const [model, cols] of Object.entries(models)) {
  if (!cols.length) continue;
  nModels++;
  const dead = cols.filter(c => !writtenGlobal.has(c.name));
  if (dead.length) { nDead += dead.length; report.push({ model, total: cols.length, dead }); }
}
report.sort((a, b) => b.dead.length - a.dead.length);
console.log(`Non-structural columns analyzed across ${nModels} models.`);
console.log(`writtenGlobal key universe: ${writtenGlobal.size}`);
console.log(`Columns never set by any write-literal / Zod schema / field-assignment: ${nDead}\n`);
for (const r of report) {
  console.log(`### ${r.model}  (${r.dead.length} / ${r.total} non-structural)`);
  for (const c of r.dead) console.log(`   - ${c.name}: ${c.type}`);
}
