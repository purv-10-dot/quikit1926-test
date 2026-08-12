/**
 * TEMP read-only: dump ALL fields + ALL dropdown option values for the
 * custom "Call Disposition" activity types (213, 214) — and 200 for comparison.
 *
 * Run: npx tsx --env-file=.env.local scripts/tmp-lsq-activity-fields.mjs
 * READ-ONLY: only GET ActivityTypes.Get. Nothing is written.
 */
const HOST = (process.env.LEADSQUARED_HOST || "https://api-in21.leadsquared.com").replace(/\/+$/, "");
const ACCESS = process.env.LEADSQUARED_ACCESS_KEY;
const SECRET = process.env.LEADSQUARED_SECRET_KEY;
// Which activity-type codes to expand. Override via TYPES=200,210,214 env.
const WANT = (process.env.TYPES || "200,213,214,210,208").split(",").map((s) => Number(s.trim()));

async function get(path) {
  const res = await fetch(`${HOST}${path}`, {
    headers: { "x-LSQ-AccessKey": ACCESS, "x-LSQ-SecretKey": SECRET },
  });
  return res.json();
}

function parseOptions(optionSetRaw) {
  try {
    const arr = JSON.parse(optionSetRaw || "[]");
    return arr
      .map((o) => (typeof o.Value === "string" ? o.Value : ""))
      .filter((v) => v !== "");
  } catch {
    return [];
  }
}

async function main() {
  const types = await get("/v2/ProspectActivity.svc/ActivityTypes.Get");
  for (const code of WANT) {
    const t = (Array.isArray(types) ? types : []).find((x) => x.ActivityEvent === code);
    if (!t) {
      console.log(`\n########## [${code}] NOT FOUND ##########`);
      continue;
    }
    console.log(`\n########## [${code}] ${t.ActivityEventName}  (EventType=${t.EventType}, dir=${t.EventDirection}) ##########`);
    let props;
    try {
      props = JSON.parse(t.ActivityProperties || "{}");
    } catch {
      console.log("  (could not parse ActivityProperties)");
      continue;
    }
    const meta = Array.isArray(props.FormMetaData) ? props.FormMetaData : [];
    for (const f of meta) {
      const opts = parseOptions(f.OptionSet);
      const isDrop = /dropdown/i.test(f.DataType || "");
      console.log(
        `\n  • ${f.SchemaName}  "${f.DisplayName}"  (${f.DataType})${f.IsMandatory ? " [MANDATORY]" : ""}${isDrop ? `  — ${opts.length} options` : ""}${f.ParentField ? `  [depends on: ${f.ParentField}]` : ""}`,
      );
      if (opts.length) {
        for (const o of opts) console.log(`        - ${o}`);
      }
      // For 0-option dropdowns, inspect the dependent-option structure.
      if (isDrop && opts.length === 0) {
        let dep = f.DependentOptionSet;
        try {
          if (typeof dep === "string") dep = JSON.parse(dep);
        } catch {
          /* leave as-is */
        }
        if (dep && typeof dep === "object") {
          const keys = Array.isArray(dep) ? null : Object.keys(dep);
          if (keys && keys.length) {
            console.log(`        (dependent options, keyed by parent value — ${keys.length} parent keys)`);
            for (const k of keys) {
              const vals = Array.isArray(dep[k])
                ? dep[k].map((o) => (typeof o === "string" ? o : o.Value ?? o.Text)).filter(Boolean)
                : [];
              console.log(`          [${k}] -> ${vals.length ? vals.join(", ") : JSON.stringify(dep[k]).slice(0, 200)}`);
            }
          } else if (Array.isArray(dep) && dep.length) {
            console.log(`        (dependent on parent value — ${dep.length} parent groups):`);
            for (const entry of dep) {
              const parent = entry.Parent ?? entry.parent ?? "?";
              const vals = Array.isArray(entry.Options)
                ? entry.Options.map((o) => o.Value).filter((v) => v !== "" && v != null)
                : [];
              console.log(`          [${parent}] -> ${vals.length ? vals.join(" | ") : "(none)"}`);
            }
          } else {
            console.log(`        (DependentOptionSet present but empty/parse-fail: ${JSON.stringify(f.DependentOptionSet).slice(0, 200)})`);
          }
        } else {
          console.log(`        (no options and no DependentOptionSet — dropdown appears empty in this account)`);
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
