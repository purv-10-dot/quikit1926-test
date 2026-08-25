/* ═══════════════════════════════════════════════════════════════════
   Meeting Rhythm — Transcripts & Reports  ·  click-through prototype
   No backend. All state is in memory and resets on reload.
   ═══════════════════════════════════════════════════════════════════ */

const state = {
  scope: 'daily',
  clientId: 'quikit',
  date: '2026-08-25',
  year: 2026,
  month: 8,
  selectedId: 't1',
  tab: 'transcript',
  listSearch: '',
  transcriptSearch: '',
  editing: false,
  loading: false,
  genStep: -1,
  highlight: null,
  lastDeleted: null,
};

const SCOPES = [
  { key: 'daily', label: 'Daily', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>' },
  { key: 'weekly', label: 'Weekly', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
  { key: 'month', label: 'Month', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 18h3"/>' },
  { key: 'unassigned', label: 'Unassigned', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 17h.01M12 11a2 2 0 1 1 2 2c-.8.4-1 1-1 2"/>' },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ─────────────────────────── helpers ─────────────────────────── */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

function icon(path, cls) {
  return `<svg class="${cls || 'h-4 w-4'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const AV_COLORS = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700'];
function avColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AV_COLORS[h % AV_COLORS.length];
}

function avatar(name, size) {
  const s = size || 'h-6 w-6 text-[10px]';
  return `<span class="grid ${s} shrink-0 place-items-center rounded-full font-semibold ${avColor(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(d);
}

function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* Confidence → colour band. Suggestion #2. */
function confBand(v) {
  if (v >= 0.85) return { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500', label: 'High' };
  if (v >= 0.60) return { cls: 'bg-amber-50 text-amber-700 ring-amber-200', bar: 'bg-amber-500', label: 'Medium' };
  return { cls: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500', label: 'Low' };
}

function confChip(v) {
  const b = confBand(v);
  return `<span class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${b.cls}"
    data-tip="${b.label} confidence — the model scored this ${Math.round(v * 100)} out of 100.">
    <span class="h-1.5 w-1.5 rounded-full ${b.bar}"></span>${Math.round(v * 100)}%</span>`;
}

function confBar(v) {
  const b = confBand(v);
  return `<div class="flex items-center gap-2">
    <div class="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200"><div class="h-full ${b.bar}" style="width:${Math.round(v * 100)}%"></div></div>
    <span class="text-[11px] font-semibold text-gray-600">${Math.round(v * 100)}%</span>
  </div>`;
}

const STATUS_PILL = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  edited: 'bg-sky-50 text-sky-700 ring-sky-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};
function statusPill(s) {
  return `<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${STATUS_PILL[s] || 'bg-gray-100 text-gray-600 ring-gray-200'}">${esc(s)}</span>`;
}

/* ─────────────────────────── toasts ─────────────────────────── */

let toastSeq = 0;
function toast(message, opts) {
  opts = opts || {};
  const id = 'toast' + ++toastSeq;
  const el = document.createElement('div');
  el.id = id;
  el.className = 'pointer-events-auto flex items-center gap-3 rounded-xl bg-gray-900 px-4 py-2.5 text-[13px] text-white shadow-pop animate-slideUp';
  el.innerHTML = `
    ${opts.tone === 'error' ? '<span class="h-2 w-2 shrink-0 rounded-full bg-rose-400"></span>' : '<span class="h-2 w-2 shrink-0 rounded-full bg-emerald-400"></span>'}
    <span>${esc(message)}</span>
    ${opts.undo ? `<button onclick="undoDelete('${id}')" class="ml-1 rounded-lg bg-white/15 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/25">Undo</button>` : ''}
    <button onclick="document.getElementById('${id}')?.remove()" class="ml-1 text-white/50 hover:text-white">${icon('<path d="M18 6 6 18M6 6l12 12"/>', 'h-3.5 w-3.5')}</button>`;
  $('toasts').appendChild(el);
  setTimeout(() => document.getElementById(id)?.remove(), opts.undo ? 8000 : 3600);
}

/* ─────────────────────────── data access ─────────────────────────── */

function visibleTranscripts() {
  const q = state.listSearch.trim().toLowerCase();
  return TRANSCRIPTS.filter((t) => {
    if (t.deleted) return false;
    if (t.scope !== state.scope) return false;
    if (state.scope !== 'unassigned' && t.clientId !== state.clientId) return false;
    if (q && !(t.title + ' ' + t.attendees.join(' ')).toLowerCase().includes(q)) return false;
    return true;
  });
}

function selected() {
  return TRANSCRIPTS.find((t) => t.id === state.selectedId && !t.deleted) || null;
}

function reportLabel() {
  return state.scope === 'weekly' ? 'Weekly Report' : state.scope === 'month' ? 'Monthly Report' : 'Report';
}

/* ─────────────────────────── top chrome ─────────────────────────── */

function renderScopeTabs() {
  $('scopeTabs').innerHTML = SCOPES.map((s) => {
    const on = state.scope === s.key;
    return `<button onclick="setScope('${s.key}')" class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${on ? 'bg-accent-600 text-white shadow-soft' : 'text-gray-600 hover:bg-gray-100'}">
      ${icon(s.icon, 'h-3.5 w-3.5')}<span class="hidden sm:inline">${s.label}</span></button>`;
  }).join('');
}

function renderClientSel() {
  const dis = state.scope === 'unassigned';
  const sel = $('clientSel');
  sel.disabled = dis;
  sel.className = `ml-1 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium shadow-soft focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100 ${dis ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400' : 'border-gray-200 bg-white text-gray-700'}`;
  sel.innerHTML = CLIENTS.map((c) => `<option value="${c.id}" ${c.id === state.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function renderDateNav() {
  const btn = 'grid h-8 w-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-soft transition hover:bg-gray-50 hover:text-gray-800';
  if (state.scope === 'unassigned') {
    $('dateNav').innerHTML = `<span class="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-700 ring-1 ring-amber-200">2 recordings could not be matched to a client</span>`;
    return;
  }
  if (state.scope === 'month') {
    $('dateNav').innerHTML = `
      <button onclick="stepMonth(-1)" class="${btn}">${icon('<path d="m15 18-6-6 6-6"/>')}</button>
      <div class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-gray-700 shadow-soft">
        ${MONTH_NAMES[state.month - 1]} ${state.year}</div>
      <button onclick="stepMonth(1)" class="${btn}">${icon('<path d="m9 18 6-6-6-6"/>')}</button>`;
    return;
  }
  const step = state.scope === 'weekly' ? 7 : 1;
  const label = state.scope === 'weekly' ? weekLabel(state.date) : prettyDate(state.date);
  $('dateNav').innerHTML = `
    <button onclick="stepDate(${-step})" class="${btn}">${icon('<path d="m15 18-6-6 6-6"/>')}</button>
    <div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-soft">
      ${icon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 'h-3.5 w-3.5 text-gray-400')}
      <span class="text-[13px] font-medium text-gray-700">${esc(label)}</span>
    </div>
    <button onclick="stepDate(${step})" class="${btn}">${icon('<path d="m9 18 6-6-6-6"/>')}</button>
    <button onclick="goToday()" class="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-accent-700 transition hover:bg-accent-50">Today</button>`;
}

function weekLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = shiftDate(iso, -dow);
  const sun = shiftDate(mon, 6);
  return `${shortDate(mon)} – ${shortDate(sun)}`;
}

/* ─────────────────────────── left list ─────────────────────────── */

function renderList() {
  if (state.loading) {
    $('list').innerHTML = Array.from({ length: 3 }).map(() =>
      `<div class="rounded-xl border border-gray-100 p-3"><div class="skel h-3.5 w-3/4 rounded"></div><div class="skel mt-2 h-2.5 w-1/2 rounded"></div><div class="skel mt-3 h-4 w-20 rounded-full"></div></div>`).join('');
    return;
  }
  const rows = visibleTranscripts();
  if (!rows.length) {
    $('list').innerHTML = `<div class="rounded-xl border border-dashed border-gray-200 p-6 text-center">
      ${icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', 'mx-auto h-6 w-6 text-gray-300')}
      <p class="mt-2 text-[13px] font-medium text-gray-600">No transcripts here</p>
      <p class="mt-0.5 text-[12px] text-gray-400">Nothing was recorded for this ${state.scope === 'month' ? 'month' : state.scope === 'weekly' ? 'week' : 'day'}.</p>
    </div>`;
    return;
  }
  $('list').innerHTML = rows.map((t) => {
    const on = t.id === state.selectedId;
    const hasReport = !!t.report;
    return `<button onclick="selectTranscript('${t.id}')" class="w-full rounded-xl border p-3 text-left transition ${on ? 'border-accent-300 bg-accent-50/60 ring-1 ring-accent-200' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="truncate text-[13px] font-semibold text-gray-900">${esc(t.title)}</div>
          <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
            <span>${shortDate(t.date)}</span><span class="text-gray-300">·</span>
            <span>${esc(t.duration)}</span><span class="text-gray-300">·</span>
            <span>${esc(t.type || 'Unmatched')}</span>
          </div>
        </div>
      </div>
      <div class="mt-2.5 flex items-center justify-between gap-2">
        <div class="flex gap-1">${t.attendees.slice(0, 4).map((a) => avatar(a, 'h-5 w-5 text-[9px] ring-2 ring-white')).join('')}
          ${t.attendees.length > 4 ? `<span class="grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-[9px] font-semibold text-gray-500 ring-2 ring-white">+${t.attendees.length - 4}</span>` : ''}</div>
        ${hasReport
          ? `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">${icon('<path d="M20 6 9 17l-5-5"/>', 'h-3 w-3')}Report ready</span>`
          : `<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200">No report</span>`}
      </div>
    </button>`;
  }).join('');
}

/* ─────────────────────────── right pane ─────────────────────────── */

function renderPane() {
  const t = selected();
  if (state.loading) {
    $('pane').innerHTML = `<div class="p-6"><div class="skel h-6 w-64 rounded"></div><div class="skel mt-3 h-3 w-40 rounded"></div>
      <div class="skel mt-6 h-9 w-56 rounded-lg"></div>
      <div class="mt-6 space-y-2">${Array.from({ length: 8 }).map(() => '<div class="skel h-4 w-full rounded"></div>').join('')}</div></div>`;
    return;
  }
  if (!t) {
    $('pane').innerHTML = `<div class="grid h-full place-items-center p-10 text-center">
      <div>${icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', 'mx-auto h-10 w-10 text-gray-200')}
      <p class="mt-3 text-[15px] font-semibold text-gray-700">Select a transcript</p>
      <p class="mt-1 max-w-xs text-[13px] text-gray-500">Pick a recording on the left to read it, or generate the report built from it.</p></div></div>`;
    return;
  }

  const tabs = state.scope === 'weekly'
    ? [['transcript', 'Transcript'], ['report', reportLabel()], ['rollup', 'Daily-Huddle Rollup']]
    : state.scope === 'unassigned'
      ? [['transcript', 'Transcript']]
      : [['transcript', 'Transcript'], ['report', reportLabel()]];

  const body = state.tab === 'report' ? renderReport(t) : state.tab === 'rollup' ? renderRollup() : renderTranscript(t);

  $('pane').innerHTML = `
    <div class="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-[17px] font-semibold tracking-tight text-gray-900">${esc(t.title)}</h3>
            ${t.report ? statusPill(t.report.status) : ''}
          </div>
          <p class="mt-0.5 text-[12px] text-gray-500">
            ${esc(CLIENTS.find((c) => c.id === t.clientId)?.name || 'Unassigned')} · ${esc(t.type || 'Unmatched')} · ${esc(t.date)} · ${esc(t.duration)} · ${esc(t.platform)}
          </p>
        </div>
        <div class="flex items-center gap-2">
          ${downloadMenu()}
          <button onclick="askDelete()" class="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-[13px] font-semibold text-rose-600 transition hover:bg-rose-50">
            ${icon('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>', 'h-3.5 w-3.5')}Delete</button>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-1 rounded-xl bg-gray-100/80 p-1">
        ${tabs.map(([k, label]) => `<button onclick="setTab('${k}')" class="rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${state.tab === k ? 'bg-white text-gray-900 shadow-soft' : 'text-gray-500 hover:text-gray-800'}">${esc(label)}</button>`).join('')}
      </div>
    </div>
    <div class="px-5 py-5 sm:px-6">${body}</div>`;
}

function downloadMenu() {
  return `<div class="relative">
    <button onclick="toggleDl(event)" class="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-[13px] font-semibold text-white shadow-soft transition hover:bg-accent-700">
      ${icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', 'h-3.5 w-3.5')}Download
      ${icon('<path d="m6 9 6 6 6-6"/>', 'h-3.5 w-3.5 opacity-70')}
    </button>
    <div id="dlMenu" class="absolute right-0 z-30 mt-1 hidden w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-pop">
      ${[['Word (.docx)', 'docx'], ['Plain text (.txt)', 'txt'], ['PDF (.pdf)', 'pdf']].map(([l, k]) =>
        `<button onclick="doDownload('${k}')" class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50">
          ${icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', 'h-3.5 w-3.5 text-gray-400')}${l}</button>`).join('')}
    </div>
  </div>`;
}

/* ─────────────────────────── transcript view ─────────────────────────── */

function renderTranscript(t) {
  const q = state.transcriptSearch.trim().toLowerCase();
  const spoke = new Set(t.lines.map((l) => l[1]));
  const silent = t.attendees.filter((a) => !spoke.has(a));

  const lines = t.lines.map((l, i) => {
    const [time, speaker, text] = l;
    if (q && !(speaker + ' ' + text).toLowerCase().includes(q)) return '';
    let shown = esc(text);
    if (q) shown = shown.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark class="q">$1</mark>');
    if (state.highlight && text.toLowerCase().includes(state.highlight.toLowerCase())) {
      shown = shown.replace(esc(state.highlight), `<mark class="q">${esc(state.highlight)}</mark>`);
    }
    const flash = state.highlight && text.toLowerCase().includes(state.highlight.toLowerCase()) ? ' line-flash' : '';
    return `<div id="line-${i}" class="flex gap-3 rounded-lg px-2 py-2${flash}">
      ${avatar(speaker, 'h-7 w-7 text-[10px]')}
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="text-[12px] font-semibold text-gray-800">${esc(speaker)}</span>
          <span class="text-[11px] tabular-nums text-gray-400">${esc(time)}</span>
        </div>
        <p class="prose-body mt-0.5 text-[13px] text-gray-700">${shown}</p>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="relative min-w-[200px] flex-1">
        ${icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 'pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400')}
        <input value="${esc(state.transcriptSearch)}" oninput="setTranscriptSearch(this.value)" placeholder="Search inside this transcript…"
          class="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-[13px] placeholder:text-gray-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100" />
      </div>
      <div class="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 ring-1 ring-gray-200">
        <span class="text-[11px] font-semibold text-gray-600">${spoke.size} spoke</span>
        ${silent.length ? `<span class="text-gray-300">·</span><span class="text-[11px] font-semibold text-amber-600">${silent.length} silent</span>` : ''}
      </div>
    </div>

    <div class="mb-4 flex flex-wrap gap-1.5">
      ${t.attendees.map((a) => {
        const did = spoke.has(a);
        return `<span class="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11px] font-medium ring-1 ${did ? 'bg-white text-gray-700 ring-gray-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}">
          ${avatar(a, 'h-5 w-5 text-[9px]')}${esc(a)}${did ? '' : ' · silent'}</span>`;
      }).join('')}
    </div>

    ${state.highlight ? `<div class="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-amber-200">
      ${icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 'h-3.5 w-3.5')}
      Showing the line this item was extracted from.
      <button onclick="clearHighlight()" class="ml-auto font-semibold underline">Clear</button></div>` : ''}

    <div class="rounded-xl border border-gray-200 bg-white p-2">${lines || '<p class="p-6 text-center text-[13px] text-gray-400">No lines match your search.</p>'}</div>`;
}

/* ─────────────────────────── report view ─────────────────────────── */

const GEN_STEPS = [
  'Reading the transcript',
  'Identifying participants and attendance',
  'Scoring adherence and blockers',
  'Extracting KPIs, Priorities and WWW',
  'Checking for duplicates in QuikScale',
  'Composing the report',
];

function renderReport(t) {
  if (state.genStep >= 0) {
    return `<div class="mx-auto max-w-md py-10">
      <div class="mb-6 text-center">
        <div class="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-accent-50 text-accent-600">
          ${icon('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>', 'h-5 w-5 animate-spin')}
        </div>
        <p class="mt-3 text-[15px] font-semibold text-gray-800">Generating the report</p>
        <p class="mt-0.5 text-[12px] text-gray-500">Gemini 3.6 Flash · usually 20–40 seconds</p>
      </div>
      <ol class="space-y-2.5">${GEN_STEPS.map((s, i) => {
        const done = i < state.genStep, now = i === state.genStep;
        return `<li class="flex items-center gap-3 rounded-xl border px-3 py-2.5 ${now ? 'border-accent-200 bg-accent-50/60' : done ? 'border-emerald-100 bg-emerald-50/40' : 'border-gray-100'}">
          <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? 'bg-emerald-500 text-white' : now ? 'bg-accent-600 text-white' : 'bg-gray-200 text-gray-400'}">
            ${done ? icon('<path d="M20 6 9 17l-5-5"/>', 'h-3 w-3') : `<span class="text-[9px] font-bold">${i + 1}</span>`}</span>
          <span class="text-[13px] ${now ? 'font-semibold text-accent-800' : done ? 'text-emerald-700' : 'text-gray-400'}">${s}</span>
          ${now ? '<span class="ml-auto text-[11px] text-accent-600">working…</span>' : ''}
        </li>`;
      }).join('')}</ol>
    </div>`;
  }

  if (!t.report) {
    return `<div class="mx-auto max-w-md py-14 text-center">
      <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-400">
        ${icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/>', 'h-6 w-6')}</div>
      <p class="mt-4 text-[15px] font-semibold text-gray-800">No report yet</p>
      <p class="mx-auto mt-1 max-w-sm text-[13px] text-gray-500">Generate the ${esc(reportLabel().toLowerCase())} from this transcript. You will be able to review and edit every line before anything is created in QuikScale.</p>
      <button onclick="generate()" class="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-soft transition hover:bg-accent-700">
        ${icon('<path d="m12 3 1.9 5.8L20 10.7l-4.9 3.6L16.5 21 12 17.7 7.5 21l1.4-6.7L4 10.7l6.1-1.9z"/>', 'h-4 w-4')}Generate report</button>
    </div>`;
  }

  const r = t.report;
  const e = state.editing;

  return `
    <!-- Report toolbar -->
    <div class="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-[13px] font-semibold text-gray-800">${esc(r.title)}</span>${statusPill(r.status)}
        </div>
        <div class="mt-0.5 text-[11px] text-gray-500">Generated ${esc(r.generatedAt)} · ${esc(r.model)}</div>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-3">
        <div class="hidden sm:block">
          <div class="text-[10px] font-medium uppercase tracking-wide text-gray-500">Overall confidence</div>
          ${confBar(r.overallConfidence)}
        </div>
        ${e
          ? `<button onclick="saveReport()" class="rounded-lg bg-accent-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-soft hover:bg-accent-700">Save &amp; create items</button>
             <button onclick="cancelEdit()" class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50">Cancel</button>`
          : `<button onclick="startEdit()" class="inline-flex items-center gap-1.5 rounded-lg border border-accent-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-accent-700 shadow-soft hover:bg-accent-50">
               ${icon('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 'h-3.5 w-3.5')}Edit report</button>
             ${r.status === 'edited' ? `<button onclick="publishReport()" class="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-soft hover:bg-emerald-700">Publish</button>` : ''}`}
      </div>
    </div>

    <!-- Summary -->
    <section class="mb-6">
      <h4 class="mb-1.5 text-[13px] font-semibold text-gray-900">Executive summary</h4>
      ${e
        ? `<textarea oninput="editField('summary', this.value)" rows="4" class="w-full rounded-xl border border-gray-200 p-3 text-[13px] leading-relaxed focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100">${esc(r.summary)}</textarea>`
        : `<p class="prose-body text-[13px] text-gray-700">${esc(r.summary)}</p>`}
    </section>

    ${r.meetingDetails ? renderMeetingDetails(r.meetingDetails) : ''}
    ${r.attendance ? renderAttendance(r.attendance) : ''}
    ${r.adherence ? renderAdherence(r.adherence) : ''}
    ${(r.sections || []).map((s, i) => renderSection(s, i, e)).join('')}
    ${r.scorecard ? renderScorecard(r.scorecard) : ''}
    ${r.blockers ? renderBlockers(r.blockers) : ''}

    ${r.reportType === 'DAILY' ? '' : renderGroup('KPIs', 'kpis', r.extractedItems.kpis, e)}
    ${r.reportType === 'DAILY' ? '' : renderGroup('Priorities', 'priorities', r.extractedItems.priorities, e)}
    ${renderGroup('WWW — Who / What / When', 'wwws', r.extractedItems.wwws, e)}
  `;
}

function renderSection(s, i, e) {
  return `<section class="mb-6">
    <h4 class="mb-1.5 text-[13px] font-semibold text-gray-900">${esc(s.heading)}</h4>
    ${e
      ? `<textarea oninput="editSection(${i}, this.value)" rows="4" class="w-full rounded-xl border border-gray-200 p-3 text-[13px] leading-relaxed focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100">${esc(s.body)}</textarea>`
      : `<p class="prose-body text-[13px] text-gray-700">${esc(s.body)}</p>`}
    ${s.assessment ? `<p class="mt-1.5 border-l-2 border-accent-200 pl-2.5 text-[12px] italic text-gray-500">${esc(s.assessment)}</p>` : ''}
  </section>`;
}

function renderMeetingDetails(d) {
  const rows = [['Meeting type', d.meetingType], ['Date', d.dateLabel], ['Start (recording mark)', d.startMark], ['End (recording mark)', d.endMark], ['Total duration', d.durationLabel], ['Time of day', d.timeOfDay]].filter((r) => r[1]);
  return `<section class="mb-6">
    <h4 class="mb-2 text-[13px] font-semibold text-gray-900">1 · Meeting details</h4>
    <div class="overflow-hidden rounded-xl border border-gray-200">
      <table class="w-full text-left">${rows.map(([k, v], i) => `<tr class="${i % 2 ? 'bg-white' : 'bg-gray-50/60'}">
        <td class="w-56 px-3 py-2 text-[12px] font-medium text-gray-600">${esc(k)}</td>
        <td class="px-3 py-2 text-[12px] text-gray-800">${esc(v)}</td></tr>`).join('')}</table>
    </div></section>`;
}

function renderAttendance(a) {
  return `<section class="mb-6">
    <h4 class="mb-2 text-[13px] font-semibold text-gray-900">2 · Attendance</h4>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="overflow-hidden rounded-xl border border-emerald-200">
        <div class="bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white">Present (${a.present.length})</div>
        <div class="space-y-1.5 bg-emerald-50/40 px-3 py-2.5">
          ${a.present.map((p) => `<div class="flex items-center gap-2 text-[12px] text-gray-700">${avatar(p.name, 'h-5 w-5 text-[9px]')}<span class="font-medium">${esc(p.name)}</span>${p.role ? `<span class="text-gray-400">· ${esc(p.role)}</span>` : ''}</div>`).join('')}
        </div>
      </div>
      <div class="overflow-hidden rounded-xl border border-gray-200">
        <div class="bg-gray-600 px-3 py-1.5 text-[11px] font-semibold text-white">Not present (${a.notPresent.length})${a.comparisonNote ? ` — ${esc(a.comparisonNote)}` : ''}</div>
        <div class="space-y-1.5 bg-gray-50 px-3 py-2.5">
          ${a.notPresent.map((n) => `<div class="flex items-center gap-2 text-[12px] text-gray-600">${avatar(n, 'h-5 w-5 text-[9px] opacity-60')}${esc(n)}</div>`).join('')}
        </div>
      </div>
    </div></section>`;
}

const RATING_TONE = { Full: 'bg-emerald-100 text-emerald-700', Good: 'bg-emerald-50 text-emerald-600', Partial: 'bg-amber-100 text-amber-700', Poor: 'bg-rose-100 text-rose-700' };
const YN_TONE = { YES: 'bg-emerald-50 text-emerald-700 ring-emerald-200', PARTIAL: 'bg-amber-50 text-amber-700 ring-amber-200', NO: 'bg-rose-50 text-rose-700 ring-rose-200' };
const YN_LABEL = { YES: 'Yes', PARTIAL: 'Partial', NO: 'No' };

function ynChip(v) {
  if (!v) return '<span class="text-gray-300">—</span>';
  return `<span class="rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${YN_TONE[v]}">${YN_LABEL[v]}</span>`;
}

function scoreNum(score) {
  const m = String(score || '').match(/([\d.]+)\s*\/\s*([\d.]+)/);
  return m ? (parseFloat(m[1]) / parseFloat(m[2])) : 0;
}

/* Suggestion #7 — adherence as a score bar per participant, not a flat table. */
function renderAdherence(rows) {
  const tally = { Full: 0, Good: 0, Partial: 0, Poor: 0 };
  rows.forEach((r) => { if (tally[r.rating] !== undefined) tally[r.rating]++; });
  const avg = rows.length ? (rows.reduce((s, r) => s + scoreNum(r.score), 0) / rows.length) : 0;

  return `<section class="mb-6">
    <h4 class="mb-2 text-[13px] font-semibold text-gray-900">3 · Adherence snapshot</h4>

    <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      ${[['Full adherence', tally.Full, 'text-emerald-700'], ['Good', tally.Good, 'text-emerald-600'], ['Partial', tally.Partial, 'text-amber-600'], ['Poor', tally.Poor, 'text-rose-600'], ['Attendees', rows.length, 'text-gray-800']]
        .map(([l, v, c]) => `<div class="rounded-xl border border-gray-200 bg-white py-2.5 text-center shadow-soft">
          <div class="text-xl font-bold ${c}">${v}</div><div class="text-[10px] text-gray-500">${l}</div></div>`).join('')}
    </div>

    <div class="mb-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
      <span class="text-[12px] font-medium text-gray-600">Team adherence</span>
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div class="h-full rounded-full ${avg >= .8 ? 'bg-emerald-500' : avg >= .6 ? 'bg-amber-500' : 'bg-rose-500'}" style="width:${Math.round(avg * 100)}%"></div>
      </div>
      <span class="text-[13px] font-bold text-gray-800">${(avg * 10).toFixed(1)}<span class="text-[11px] font-medium text-gray-400">/10</span></span>
    </div>

    <div class="space-y-2.5">
      ${rows.map((r) => {
        const pct = Math.round(scoreNum(r.score) * 100);
        return `<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-soft">
          <div class="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-3 py-2.5">
            ${avatar(r.participant, 'h-8 w-8 text-[11px]')}
            <div class="min-w-0">
              <div class="text-[13px] font-semibold text-gray-900">${esc(r.participant)}</div>
              ${r.role ? `<div class="text-[11px] text-gray-500">${esc(r.role)}</div>` : ''}
            </div>
            <div class="ml-auto flex items-center gap-3">
              <div class="hidden h-2 w-28 overflow-hidden rounded-full bg-gray-200 sm:block">
                <div class="h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'}" style="width:${pct}%"></div></div>
              <span class="text-[12px] font-bold tabular-nums text-gray-700">${esc(r.score)}</span>
              <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RATING_TONE[r.rating] || 'bg-gray-100 text-gray-600'}">${esc(r.rating)}</span>
            </div>
          </div>
          <div class="divide-y divide-gray-100">
            ${[['Achievement (yesterday)', r.achievement, r.achievementNote], ['Focus area (today)', r.focus, r.focusNote], ['Stuck / blockers', r.stuck, r.stuckNote]]
              .map(([l, v, note]) => `<div class="flex flex-wrap items-start gap-3 px-3 py-2">
                <span class="w-44 shrink-0 text-[12px] font-medium text-gray-600">${l}</span>
                ${ynChip(v)}
                ${note ? `<span class="min-w-[160px] flex-1 text-[12px] text-gray-500">${esc(note)}</span>` : ''}
              </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

const RAG_TONE = { GREEN: 'bg-emerald-500', AMBER: 'bg-amber-500', RED: 'bg-rose-500' };
const RAG_CHIP = { GREEN: 'bg-emerald-50 text-emerald-700 ring-emerald-200', AMBER: 'bg-amber-50 text-amber-700 ring-amber-200', RED: 'bg-rose-50 text-rose-700 ring-rose-200' };

function renderScorecard(rows) {
  return `<section class="mb-6">
    <h4 class="mb-2 text-[13px] font-semibold text-gray-900">Scorecard</h4>
    <div class="overflow-hidden rounded-xl border border-gray-200">
      <table class="w-full text-left text-[12px]">
        <thead><tr class="bg-accent-50 text-gray-700">
          <th class="px-3 py-2 font-semibold">Metric</th><th class="px-3 py-2 font-semibold">Reading</th><th class="px-3 py-2 text-center font-semibold">RAG</th></tr></thead>
        <tbody>${rows.map((s, i) => `<tr class="border-t border-gray-100 ${i % 2 ? 'bg-white' : 'bg-gray-50/40'}">
          <td class="px-3 py-2"><div class="flex items-center gap-2"><span class="h-2 w-2 rounded-full ${RAG_TONE[s.rag] || 'bg-gray-300'}"></span><span class="font-medium text-gray-800">${esc(s.metric)}</span></div></td>
          <td class="px-3 py-2 text-gray-600">${esc(s.reading)}</td>
          <td class="px-3 py-2 text-center"><span class="rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${RAG_CHIP[s.rag] || ''}">${esc(s.rag)}</span></td>
        </tr>`).join('')}</tbody>
      </table>
    </div></section>`;
}

const BLOCK_TONE = { OPEN: 'bg-rose-50 text-rose-700 ring-rose-200', IN_PROGRESS: 'bg-amber-50 text-amber-700 ring-amber-200', RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };

function renderBlockers(rows) {
  if (!rows.length) return '';
  return `<section class="mb-6">
    <h4 class="mb-1 text-[13px] font-semibold text-gray-900">4 · Stucks &amp; blockers — consolidated</h4>
    <p class="mb-2 text-[12px] text-gray-500">${rows.length} blocker${rows.length === 1 ? '' : 's'} raised during the meeting.</p>
    <div class="space-y-2">
      ${rows.map((b, i) => `<div class="rounded-xl border border-gray-200 bg-white p-3 shadow-soft">
        <div class="flex flex-wrap items-center gap-2">
          <span class="grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">${i + 1}</span>
          <span class="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">${esc(b.category)}</span>
          ${b.status ? `<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${BLOCK_TONE[b.status]}">${esc(b.status.replace('_', ' '))}</span>` : '<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200">status not stated</span>'}
          <span class="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500">
            ${avatar(b.raisedBy, 'h-5 w-5 text-[9px]')}raised by <span class="font-medium text-gray-700">${esc(b.raisedBy)}</span>
            ${b.raisedFor ? `<span class="text-gray-300">→</span> on <span class="font-medium text-gray-700">${esc(b.raisedFor)}</span>` : ''}</span>
        </div>
        <p class="mt-2 text-[13px] font-medium text-gray-800">${esc(b.description)}</p>
        ${b.impact ? `<p class="mt-1 text-[12px] text-gray-600"><span class="font-semibold">Impact:</span> ${esc(b.impact)}</p>` : ''}
        ${b.requiredAction ? `<p class="mt-0.5 text-[12px] text-gray-600"><span class="font-semibold">Required action:</span> ${esc(b.requiredAction)}</p>` : ''}
      </div>`).join('')}
    </div></section>`;
}

/* ── extracted items: KPIs / Priorities / WWW ─────────────────────
   The WWW rows carry Who · What · When, and the Who is editable —
   this is the gap in the current build, where only `what` is shown. */

const KIND_META = {
  kpis: { noun: 'KPI', label: (i) => i.name, empty: 'No KPIs were found in this transcript.' },
  priorities: { noun: 'Priority', label: (i) => i.name, empty: 'No priorities were found in this transcript.' },
  wwws: { noun: 'WWW', label: (i) => i.what, empty: 'No action items were found in this transcript.' },
};

function renderGroup(title, kind, items, editing) {
  if (!items || !items.length) return '';
  const selectable = items.filter((i) => !i.duplicate && !i.createdRecordId);
  const chosen = selectable.filter((i) => i.accepted).length;

  return `<section class="mb-6" data-group="${kind}">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <h4 class="text-[13px] font-semibold text-gray-900">${esc(title)}</h4>
      <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">${items.length}</span>
      ${selectable.length ? `<span class="text-[11px] font-medium ${chosen ? 'text-accent-700' : 'text-gray-400'}">${chosen} of ${selectable.length} selected to create</span>` : ''}
      ${editing && selectable.length ? `<div class="ml-auto flex items-center gap-1.5">
        <button onclick="bulkAccept('${kind}', true)" class="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">Accept all</button>
        <button onclick="bulkAccept('${kind}', false)" class="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">Clear all</button>
      </div>` : ''}
    </div>

    <div class="space-y-2">
      ${items.map((item, i) => renderItemRow(kind, item, i, editing)).join('')}
    </div>
  </section>`;
}

function renderItemRow(kind, item, i, editing) {
  const created = !!item.createdRecordId;
  const dup = item.duplicate;
  const label = KIND_META[kind].label(item) || '';
  const who = kind === 'wwws' ? item.who : kind === 'priorities' ? item.owner : null;
  const lowConf = item.confidence < 0.6;

  const stateChip = created
    ? `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">${icon('<path d="M20 6 9 17l-5-5"/>', 'h-3 w-3')}Created · ${esc(item.createdRecordId)}</span>`
    : dup
      ? `<button onclick="showDuplicate('${kind}',${i})" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-200">
          ${icon('<path d="M8 3H5a2 2 0 0 0-2 2v3M3 16v3a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3"/>', 'h-3 w-3')}Already exists · compare</button>`
      : `<span class="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200">New</span>`;

  return `<div class="rounded-xl border ${item.accepted && !dup && !created ? 'border-accent-200 bg-accent-50/30' : 'border-gray-200 bg-white'} p-3 shadow-soft transition">
    <div class="flex flex-wrap items-start gap-3">
      ${!dup && !created
        ? `<input type="checkbox" ${item.accepted ? 'checked' : ''} ${editing ? '' : 'disabled'} onchange="toggleItem('${kind}',${i},this.checked)"
             class="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-accent-600 focus:ring-accent-400 ${editing ? '' : 'opacity-50'}" />`
        : '<span class="mt-0.5 h-4 w-4 shrink-0"></span>'}

      <div class="min-w-0 flex-1">
        ${editing && !created
          ? `<input value="${esc(label)}" oninput="renameItem('${kind}',${i},this.value)"
              class="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100" />`
          : `<div class="text-[13px] font-medium text-gray-900">${esc(label)}</div>`}

        <!-- Who · When line -->
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          ${kind !== 'kpis' ? `
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">${kind === 'wwws' ? 'Who' : 'Owner'}</span>
              ${editing && !created
                ? `<select onchange="setOwner('${kind}',${i},this.value)" class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] font-medium text-gray-800 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100">
                    ${PEOPLE.map((p) => `<option ${p === who ? 'selected' : ''}>${esc(p)}</option>`).join('')}
                   </select>`
                : `<span class="inline-flex items-center gap-1.5 rounded-full bg-gray-50 py-1 pl-1 pr-2.5 text-[12px] font-medium text-gray-800 ring-1 ring-gray-200">
                     ${avatar(who || 'Unassigned', 'h-5 w-5 text-[9px]')}${esc(who || 'Unassigned')}</span>`}
              ${who ? `<span class="text-[10px] text-gray-400" data-tip="The model read this name straight out of the transcript. Change it here if the wrong person was matched.">matched from transcript</span>` : ''}
            </div>` : `
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Unit</span>
              <span class="rounded-md bg-gray-50 px-2 py-0.5 text-[12px] font-medium text-gray-700 ring-1 ring-gray-200">${esc(item.measurementUnit || '—')}</span>
              <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Target</span>
              <span class="text-[12px] font-medium text-gray-800">${item.target != null ? esc(item.target.toLocaleString('en-IN')) : '—'}</span>
            </div>`}

          ${kind === 'wwws' ? `
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">When</span>
              ${editing && !created
                ? `<input type="date" value="${esc(item.when || '')}" onchange="setWhen(${i}, this.value)" class="rounded-lg border border-gray-200 px-2 py-1 text-[12px] focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100" />`
                : `<span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ${item.when ? 'bg-gray-50 text-gray-700 ring-gray-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}">
                     ${icon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 'h-3 w-3')}${item.when ? shortDate(item.when) : 'no date in transcript'}</span>`}
            </div>` : ''}
        </div>

        ${item.description && kind !== 'wwws' ? `<p class="mt-1.5 text-[12px] text-gray-500">${esc(item.description)}</p>` : ''}
      </div>

      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <div class="flex items-center gap-1.5">${stateChip}${confChip(item.confidence)}</div>
        ${item.sourceQuote ? `<button onclick="showEvidence('${esc(item.sourceQuote).replace(/'/g, '&#39;')}')"
            class="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-accent-300 hover:text-accent-700"
            data-tip="Jump to the transcript line this came from">
            ${icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 'h-3 w-3')}Evidence</button>` : ''}
      </div>
    </div>

    ${lowConf && !created && !dup ? `<div class="mt-2 flex items-start gap-2 rounded-lg bg-rose-50/70 px-2.5 py-1.5 text-[11px] text-rose-700 ring-1 ring-rose-200">
      ${icon('<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', 'mt-px h-3.5 w-3.5 shrink-0')}
      <span>Low confidence — left unselected by default. Check the evidence line before you accept it.</span></div>` : ''}

    ${item.sourceQuote ? `<p class="mt-2 border-l-2 border-gray-200 pl-2.5 text-[11px] italic text-gray-500">“${esc(item.sourceQuote)}”</p>` : ''}
  </div>`;
}

/* ─────────────────────────── daily-huddle rollup ─────────────────────────── */

function renderRollup() {
  const r = ROLLUP;
  const held = r.days.filter((d) => d.held).length;
  return `
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div><h4 class="text-[15px] font-semibold text-gray-900">Daily-Huddle Rollup</h4>
      <p class="text-[12px] text-gray-500">${esc(r.weekLabel)} · ${held} of ${r.days.length} huddles held</p></div>
    </div>
    <div class="mb-5 grid gap-2 sm:grid-cols-5">
      ${r.days.map((d) => `<div class="rounded-xl border ${d.held ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'} p-3 text-center shadow-soft">
        <div class="text-[11px] font-semibold text-gray-500">${esc(d.label)}</div>
        ${d.held
          ? `<div class="mt-1 text-xl font-bold ${d.avgScore >= 8 ? 'text-emerald-600' : d.avgScore >= 6 ? 'text-amber-600' : 'text-rose-600'}">${d.avgScore.toFixed(1)}</div>
             <div class="text-[10px] text-gray-500">${esc(d.attendance)} present</div>
             <div class="mt-1 text-[10px] ${d.blockers ? 'text-rose-600' : 'text-gray-400'}">${d.blockers} blocker${d.blockers === 1 ? '' : 's'}</div>`
          : `<div class="mt-2 text-[11px] font-medium text-gray-400">Not held</div>`}
      </div>`).join('')}
    </div>
    <div class="overflow-hidden rounded-xl border border-gray-200">
      <table class="w-full text-left text-[12px]">
        <thead><tr class="bg-accent-50 text-gray-700">
          <th class="px-3 py-2 font-semibold">Participant</th><th class="px-3 py-2 font-semibold">Attendance</th>
          <th class="px-3 py-2 font-semibold">Average adherence</th><th class="px-3 py-2 text-right font-semibold">Score</th></tr></thead>
        <tbody>${r.participants.map((p, i) => `<tr class="border-t border-gray-100 ${i % 2 ? 'bg-white' : 'bg-gray-50/40'}">
          <td class="px-3 py-2"><div class="flex items-center gap-2">${avatar(p.name, 'h-6 w-6 text-[10px]')}<span class="font-medium text-gray-800">${esc(p.name)}</span></div></td>
          <td class="px-3 py-2 ${p.present === 0 ? 'text-rose-600 font-semibold' : 'text-gray-600'}">${p.present} of ${p.of}</td>
          <td class="px-3 py-2"><div class="h-2 w-32 overflow-hidden rounded-full bg-gray-200">
            <div class="h-full ${p.avg == null ? 'bg-gray-300' : p.avg >= 8 ? 'bg-emerald-500' : p.avg >= 6 ? 'bg-amber-500' : 'bg-rose-500'}" style="width:${p.avg == null ? 0 : p.avg * 10}%"></div></div></td>
          <td class="px-3 py-2 text-right font-bold tabular-nums text-gray-700">${p.avg == null ? '—' : p.avg.toFixed(1)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

/* ─────────────────────────── dialogs ─────────────────────────── */

function closeDialog() { $('dialogHost').innerHTML = ''; }

function dialog(html, width) {
  $('dialogHost').innerHTML = `<div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" onclick="closeDialog()"></div>
    <div class="relative w-full ${width || 'max-w-md'} overflow-hidden rounded-2xl bg-white shadow-pop animate-popIn">${html}</div></div>`;
}

function askDelete() {
  const t = selected();
  if (!t) return;
  dialog(`
    <div class="px-5 py-4">
      <div class="flex items-start gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
          ${icon('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>', 'h-4 w-4')}</div>
        <div>
          <h3 class="text-[15px] font-semibold text-gray-900">Delete from Meeting Rhythm</h3>
          <p class="mt-0.5 text-[13px] text-gray-500">${esc(t.title)}</p>
        </div>
      </div>
      <div class="mt-4 space-y-2">
        <label class="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
          <input type="radio" name="delmode" value="report" checked class="mt-0.5 text-accent-600 focus:ring-accent-400" ${t.report ? '' : 'disabled'} />
          <span><span class="block text-[13px] font-semibold text-gray-800">Report only</span>
          <span class="block text-[12px] text-gray-500">Keeps the transcript. You can regenerate the report afterwards.${t.report ? '' : ' (No report exists yet.)'}</span></span>
        </label>
        <label class="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
          <input type="radio" name="delmode" value="both" class="mt-0.5 text-accent-600 focus:ring-accent-400" ${t.report ? '' : 'checked'} />
          <span><span class="block text-[13px] font-semibold text-gray-800">Transcript and report</span>
          <span class="block text-[12px] text-gray-500">Removes the recording from Meeting Rhythm entirely.</span></span>
        </label>
      </div>
      <p class="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
        ${icon('<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', 'mt-px h-3.5 w-3.5 shrink-0')}
        Items already created in KPI, Priority or WWW stay where they are — deleting a report never removes records it created.</p>
    </div>
    <div class="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
      <button onclick="closeDialog()" class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
      <button onclick="confirmDelete()" class="rounded-lg bg-rose-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700">Delete</button>
    </div>`);
}

function confirmDelete() {
  const t = selected();
  const mode = document.querySelector('input[name=delmode]:checked')?.value || 'both';
  closeDialog();
  if (!t) return;
  if (mode === 'report') {
    state.lastDeleted = { id: t.id, mode, report: t.report };
    t.report = null;
    state.tab = 'report';
    toast('Report deleted.', { undo: true });
  } else {
    state.lastDeleted = { id: t.id, mode, report: t.report };
    t.deleted = true;
    const next = visibleTranscripts()[0];
    state.selectedId = next ? next.id : null;
    state.tab = 'transcript';
    toast('Transcript and report deleted.', { undo: true });
  }
  state.editing = false;
  render();
}

function undoDelete(toastId) {
  document.getElementById(toastId)?.remove();
  const d = state.lastDeleted;
  if (!d) return;
  const t = TRANSCRIPTS.find((x) => x.id === d.id);
  if (!t) return;
  if (d.mode === 'report') t.report = d.report; else { t.deleted = false; t.report = d.report; }
  state.selectedId = t.id;
  state.lastDeleted = null;
  toast('Restored.');
  render();
}

function showDuplicate(kind, i) {
  const t = selected();
  const item = t.report.extractedItems[kind][i];
  const d = item.duplicate;
  const label = KIND_META[kind].label(item);
  const cell = (title, body, tone) => `<div class="flex-1 overflow-hidden rounded-xl border ${tone}">
    <div class="border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wide">${title}</div>
    <div class="space-y-2 px-3 py-3 text-[12px]">${body}</div></div>`;
  const row = (k, v) => `<div><div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">${k}</div><div class="text-gray-800">${v}</div></div>`;

  dialog(`
    <div class="px-5 py-4">
      <h3 class="text-[15px] font-semibold text-gray-900">This looks like something you already have</h3>
      <p class="mt-0.5 text-[13px] text-gray-500">Compare them before deciding. Nothing is created unless you accept it.</p>
      <div class="mt-4 flex flex-col gap-3 sm:flex-row">
        ${cell('Existing in QuikScale', [
          row('Record', `<span class="font-semibold">${esc(d.name)}</span> <span class="text-gray-400">· ${esc(d.id)}</span>`),
          row('Owner', `<span class="inline-flex items-center gap-1.5">${avatar(d.ownerName, 'h-5 w-5 text-[9px]')}${esc(d.ownerName)}</span>`),
          row(kind === 'wwws' ? 'When' : 'Detail', esc(d.when || '—')),
          row('Status', `<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">${esc(d.status)}</span>`),
          row('Created', esc(d.createdAt)),
        ].join(''), 'border-gray-200')}
        ${cell('Extracted from this meeting', [
          row('Item', `<span class="font-semibold">${esc(label)}</span>`),
          row('Owner', `<span class="inline-flex items-center gap-1.5">${avatar(item.who || item.owner || '—', 'h-5 w-5 text-[9px]')}${esc(item.who || item.owner || '—')}</span>`),
          row(kind === 'wwws' ? 'When' : 'Detail', esc(item.when || item.description || '—')),
          row('Confidence', confChip(item.confidence)),
          row('Evidence', `<span class="italic text-gray-500">“${esc(item.sourceQuote || '')}”</span>`),
        ].join(''), 'border-amber-300 bg-amber-50/30')}
      </div>
    </div>
    <div class="flex flex-wrap justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
      <button onclick="closeDialog()" class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100">Keep the existing record</button>
      <button onclick="forceCreate('${kind}',${i})" class="rounded-lg bg-accent-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-accent-700">Create anyway</button>
    </div>`, 'max-w-2xl');
}

function forceCreate(kind, i) {
  const t = selected();
  const item = t.report.extractedItems[kind][i];
  item.duplicate = null;
  item.accepted = true;
  closeDialog();
  toast('Marked as a new item. It will be created on save.');
  render();
}

function openUpload() {
  dialog(`
    <div class="px-5 py-4">
      <h3 class="text-[15px] font-semibold text-gray-900">Upload a transcript</h3>
      <p class="mt-0.5 text-[13px] text-gray-500">Use this when a recording was not captured automatically.</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <label class="block"><span class="mb-1 block text-[12px] font-medium text-gray-600">Client</span>
          <select class="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px]">${CLIENTS.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="block"><span class="mb-1 block text-[12px] font-medium text-gray-600">Meeting type</span>
          <select class="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px]"><option>Daily Huddle</option><option>Weekly Meeting</option></select></label>
        <label class="block"><span class="mb-1 block text-[12px] font-medium text-gray-600">Meeting date</span>
          <input type="date" value="2026-08-25" class="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px]" /></label>
        <label class="block"><span class="mb-1 block text-[12px] font-medium text-gray-600">Title</span>
          <input placeholder="Leaders _ Daily Huddle" class="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px]" /></label>
      </div>
      <div class="mt-3 rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center">
        ${icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>', 'mx-auto h-7 w-7 text-gray-300')}
        <p class="mt-2 text-[13px] font-medium text-gray-600">Drop a .txt, .docx or .vtt file here</p>
        <p class="text-[12px] text-gray-400">or click to browse</p>
      </div>
    </div>
    <div class="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
      <button onclick="closeDialog()" class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
      <button onclick="closeDialog(); toast('Transcript uploaded and matched to Quikit.')" class="rounded-lg bg-accent-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-accent-700">Upload</button>
    </div>`, 'max-w-lg');
}

/* ─────────────────────────── actions ─────────────────────────── */

function openModal() { $('modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; render(); }
function closeModal() { $('modal').classList.add('hidden'); document.body.style.overflow = ''; }

function withLoading(fn) {
  state.loading = true;
  render();
  setTimeout(() => { state.loading = false; fn(); render(); }, 420);
}

function setScope(s) {
  if (state.scope === s) return;
  state.scope = s;
  state.editing = false;
  state.tab = 'transcript';
  state.highlight = null;
  withLoading(() => {
    const first = visibleTranscripts()[0];
    state.selectedId = first ? first.id : null;
  });
}

function setClient(id) { state.clientId = id; withLoading(() => { const f = visibleTranscripts()[0]; state.selectedId = f ? f.id : null; }); }
function stepDate(d) { state.date = shiftDate(state.date, d); withLoading(() => { const f = visibleTranscripts()[0]; state.selectedId = f ? f.id : null; }); }
function stepMonth(d) {
  let m = state.month + d, y = state.year;
  if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  state.month = m; state.year = y;
  withLoading(() => {});
}
function goToday() { state.date = '2026-08-25'; withLoading(() => { const f = visibleTranscripts()[0]; state.selectedId = f ? f.id : null; }); }
function setListSearch(v) { state.listSearch = v; renderList(); }
function setTranscriptSearch(v) { state.transcriptSearch = v; renderPane(); }
function selectTranscript(id) { state.selectedId = id; state.editing = false; state.tab = 'transcript'; state.highlight = null; render(); }
function setTab(t) { state.tab = t; state.editing = false; render(); }

function generate() {
  const t = selected();
  state.genStep = 0;
  renderPane();
  const tick = () => {
    state.genStep++;
    if (state.genStep < GEN_STEPS.length) { renderPane(); setTimeout(tick, 520); return; }
    state.genStep = -1;
    const base = t.scope === 'weekly' ? WEEKLY_REPORT : t.scope === 'month' ? MONTHLY_REPORT : DAILY_REPORT;
    t.report = JSON.parse(JSON.stringify(base));
    t.report.status = 'draft';
    toast('Report generated. Review it before creating any items.');
    render();
  };
  setTimeout(tick, 520);
}

function startEdit() { state.editing = true; renderPane(); }
function cancelEdit() { state.editing = false; renderPane(); toast('Changes discarded.'); }

function editField(k, v) { selected().report[k] = v; }
function editSection(i, v) { selected().report.sections[i].body = v; }
function toggleItem(kind, i, v) { selected().report.extractedItems[kind][i].accepted = v; renderPane(); }
function renameItem(kind, i, v) {
  const item = selected().report.extractedItems[kind][i];
  if (kind === 'wwws') item.what = v; else item.name = v;
}
function setOwner(kind, i, v) {
  const item = selected().report.extractedItems[kind][i];
  if (kind === 'wwws') item.who = v; else item.owner = v;
}
function setWhen(i, v) { selected().report.extractedItems.wwws[i].when = v; }
function bulkAccept(kind, v) {
  selected().report.extractedItems[kind].forEach((it) => { if (!it.duplicate && !it.createdRecordId) it.accepted = v; });
  renderPane();
}

let createdSeq = 200;
function saveReport() {
  const r = selected().report;
  let created = 0;
  ['kpis', 'priorities', 'wwws'].forEach((kind) => {
    r.extractedItems[kind].forEach((it) => {
      if (it.accepted && !it.duplicate && !it.createdRecordId) {
        const prefix = kind === 'kpis' ? 'KPI' : kind === 'priorities' ? 'PRI' : 'WWW';
        it.createdRecordId = prefix + '-' + ++createdSeq;
        created++;
      }
    });
  });
  r.status = 'edited';
  state.editing = false;
  render();
  toast(created ? `Created ${created} item${created === 1 ? '' : 's'} in QuikScale · report saved.` : 'Report saved.');
}

function publishReport() {
  selected().report.status = 'published';
  render();
  toast('Report published. It is now visible on the client dashboard.');
}

function showEvidence(quote) {
  state.highlight = quote;
  state.tab = 'transcript';
  render();
  setTimeout(() => {
    const el = document.querySelector('.line-flash');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}
function clearHighlight() { state.highlight = null; renderPane(); }

function toggleDl(ev) {
  ev.stopPropagation();
  $('dlMenu').classList.toggle('hidden');
}
function doDownload(kind) {
  $('dlMenu').classList.add('hidden');
  toast(`Preparing the ${kind.toUpperCase()} download… (prototype — no file is produced)`);
}
document.addEventListener('click', () => $('dlMenu')?.classList.add('hidden'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('dialogHost').innerHTML) { closeDialog(); return; }
    if (!$('modal').classList.contains('hidden')) closeModal();
  }
});

/* ─────────────────────────── boot ─────────────────────────── */

/* Background dashboard table — QuikScale traffic-light bands. */
function cellTone(v) {
  if (v >= 98) return 'bg-blue-600 text-white';
  if (v >= 90) return 'bg-green-600 text-white';
  if (v >= 80) return 'bg-yellow-500 text-white';
  return 'bg-red-600 text-white';
}

function renderRhythmTable() {
  const host = $('rhythmRows');
  if (!host) return;
  const totals = RHYTHM_ROWS[0].vals.map((_, i) =>
    Math.round(RHYTHM_ROWS.reduce((s, r) => s + r.vals[i], 0) / RHYTHM_ROWS.length));

  host.innerHTML = RHYTHM_ROWS.map((r, i) => {
    const avg = Math.round(r.vals.reduce((a, b) => a + b, 0) / r.vals.length);
    return `<tr class="border-t border-gray-100 hover:bg-blue-50">
      <td class="px-3 py-2 text-gray-500">${i + 1}</td>
      <td class="px-3 py-2 font-medium text-gray-900">${esc(r.metric)}</td>
      ${r.vals.map((v) => `<td class="px-1 py-1 text-center"><span class="block rounded px-2 py-1 text-[12px] font-semibold ${cellTone(v)}">${v}%</span></td>`).join('')}
      <td class="px-1 py-1 text-center"><span class="block rounded px-2 py-1 text-[12px] font-bold ${cellTone(avg)}">${avg}%</span></td>
    </tr>`;
  }).join('') + `<tr class="border-t-2 border-gray-200 bg-gray-50">
      <td class="px-3 py-2 text-gray-400">—</td>
      <td class="px-3 py-2 font-bold text-gray-900">Total</td>
      ${totals.map((v) => `<td class="px-1 py-1 text-center"><span class="block rounded px-2 py-1 text-[12px] font-bold ${cellTone(v)}">${v}%</span></td>`).join('')}
      <td class="px-1 py-1 text-center"><span class="block rounded px-2 py-1 text-[12px] font-bold ${cellTone(Math.round(totals.reduce((a, b) => a + b, 0) / totals.length))}">${Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)}%</span></td>
    </tr>`;
}

function render() {
  renderRhythmTable();
  renderScopeTabs();
  renderClientSel();
  renderDateNav();
  renderList();
  renderPane();
}

render();
