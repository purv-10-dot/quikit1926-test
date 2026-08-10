# Knowledge Base screenshots

PNG files in this folder replace the wireframe placeholders in the Knowledge
Base (`/help`) and in the generated PDF manual.

**Nothing here is required.** Every figure slot falls back to a labelled
placeholder that describes what the screenshot should show, so the guide is
complete and readable with zero images. Add them as you capture them — the web
reader picks them up on reload, and the PDF picks them up on the next download
(it probes each filename before generating, so a missing file never breaks the
export).

## Capture them automatically (recommended)

With QuikScale running locally, from `apps/quikscale`:

```
npm run kb:screens
```

That is the whole command — it works identically in Command Prompt, PowerShell
and bash. A browser window opens; sign in exactly as you normally would —
Google, Microsoft or email/password, whatever your org uses. The moment you
land on the dashboard the script takes over and captures all 32 shots into this
folder.

> **Do not** write `KB_MANUAL_LOGIN=1 npm run kb:screens`. That `VAR=value cmd`
> form is bash syntax; Command Prompt rejects it with
> *"'KB_MANUAL_LOGIN' is not recognized as an internal or external command"*.
> Manual sign-in is the default, so no variable is needed.

Manual sign-in is the default because QuikScale authenticates through the
central QuikIT auth app over OAuth, which a scripted form-fill cannot reliably
complete on every environment.

### Options

Pass flags after `--` (note the double dash — it tells npm the flags are for
the script, not for npm itself):

| Flag | Purpose |
|---|---|
| `--url=http://localhost:3003` | Where the app is running. This is the default |
| `--only=kpi-table,priority-table` | Capture a subset |
| `--cookie=<value>` | Your `next-auth.session-token`, copied from devtools |
| `--state=./auth.json` | A saved Playwright `storageState` file |
| `--email=... --password=...` | Scripted form-fill — only where `/login` shows a password form |
| `--scale=2` | Capture at 2× (bigger files; 1× is already ~245 DPI in print) |
| `--no-redact` | Turn OFF the data blurring described below (not recommended) |

```
npm run kb:screens -- --only=kpi-table --url=http://localhost:3003
```

Every flag also has a `KB_*` environment-variable equivalent for CI
(`KB_BASE_URL`, `KB_ONLY`, `KB_SESSION_COOKIE`, `KB_STORAGE_STATE`,
`KB_EMAIL`, `KB_PASSWORD`, `KB_SCALE`, `KB_MANUAL_LOGIN`).

## Tenant data is blurred automatically

Captures are **redacted by default**: the script blurs your organisation's real
data out of every screenshot at capture time, while leaving the interface sharp.
The screenshots teach the UI, not the numbers.

| Blurred | Left sharp |
|---|---|
| Table row content — names, owners, values, notes | Column headers |
| The signed-in user's name and email | Toolbars, buttons, filters |
| The organisation chip in the header | Sidebar and navigation |
| Values typed into dialogs, drawers and forms | Section titles and labels |
| Anything marked `data-kb-redact` in the app | Status and traffic-light **colours** |

Because the blur is applied in the browser before the pixel data is written, the
underlying text never reaches the PNG at all — unlike blurring in the reader,
which would leave it recoverable inside the file.

Colours survive the blur, so a KPI cell still reads as blue/green/yellow/red and
a Priority cell still reads as its status. That is deliberate: the colour is the
lesson, the number is the private part.

To mark something else for redaction, add `data-kb-redact` to the element in the
app. To disable redaction entirely — only for an internal, non-circulated
build — pass `--no-redact`.

> If you captured before redaction existed, **re-run the capture**. The existing
> PNGs contain readable tenant data and are embedded verbatim in every PDF
> anyone downloads.

### Notes

- **Use an account with real data and broad permissions.** The script captures
  what that account can see; an empty tenant produces empty screenshots.
- **Aspect ratios are preserved and images are never upscaled.** A narrow crop
  (the 219px sidebar strip) renders small and crisp rather than being stretched
  to full width and blurred. Capture the region the checklist names — a
  tightly-cropped shot is better than a full window.
- Shots whose module is disabled, whose permission is missing, or whose
  selector has moved are reported as `skipped` and keep their placeholder. A
  partial capture is fine — re-run with `KB_ONLY` to fill the gaps.
- The script refuses to save a login page. If the session expires mid-run you
  get skips, never 32 copies of the sign-in screen.
- One-time Playwright setup, if you have not run E2E before:
  `npx playwright install --with-deps chromium`
- After capturing, **reload `/help`** to see the images, and click **Download
  PDF** again — the PDF re-checks which files exist on every download, so no
  rebuild or restart is needed. Expect the manual to grow from 84 pages to
  roughly 95, and the download to take a few seconds longer.

## Capturing by hand

Drop a PNG named exactly as listed below into this folder. Guidelines:

- **Filenames must match exactly** — they are referenced by name from
  `apps/quikscale/lib/knowledge-base/content/*.ts`.
- **Format:** PNG. **Width:** 1600 px for full-page shots, 900 px for close-ups.
- **Browser:** a clean window at 1440×900 or wider, no dev tools, no extensions
  visible, no OS taskbar. Chrome's device-toolbar screenshot gives a consistent
  result.
- **Theme:** capture with the default blue accent so the images read correctly
  for every tenant.
- **Data:** use demo or sample data. Never capture real customer names, real
  revenue figures, or real employee performance data — this manual gets
  circulated as a PDF.
- **Crop tightly** to the region named in the checklist. A full-window capture
  where a close-up was asked for makes the PDF figure unreadable at print size.

## Checklist — 32 slots

### Foundations

| File | Capture |
|---|---|
| `app-shell-overview.png` | Full window on `/dashboard`: sidebar with all four pillar sections, header, content area. |
| `first-run-quarter-settings.png` | `/org-setup/quarters` with the Initialize / Generate modal open. |
| `sidebar-expanded.png` | Sidebar only, with Org Setup and KPI both expanded. |
| `header-controls.png` | Close-up of the header's right side: Help, app switcher, user menu. |
| `period-filter.png` | A module header strip: title, item count, week pill, year/quarter dropdown. |
| `grid-anatomy.png` | Individual KPI table, annotated: rail columns, data columns, week cells, footer. |
| `grid-column-menu.png` | A column header with its dropdown menu open. |
| `fiscal-year-model.png` | `/org-setup/quarters` listing a fiscal year with all four quarters. |

### Execution

| File | Capture |
|---|---|
| `dashboard-overview.png` | Full `/dashboard`: tabs, KPI Overview strip, the three preview tables. |
| `kpi-table.png` | Full-width `/kpi` grid including coloured week cells. |
| `kpi-add-form.png` | The Add KPI drawer with all fields visible. |
| `kpi-log-modal.png` | The KPI log modal: weekly values, notes, change history. |
| `kpi-traffic-light.png` | Close-up of week cells showing blue, green, yellow, red and grey together. |
| `team-kpi-grid.png` | `/kpi/teams` with two team sections expanded. |
| `priority-table.png` | `/priority` with a mix of weekly statuses. |
| `priority-week-cell.png` | Close-up of a week cell with its status dropdown open. |
| `www-table.png` | `/www` showing Who / What / When / Revised Date / Status / Category. |
| `meeting-rhythm-dashboard.png` | `/client-meetings`: client selector, mode toggle, six-month colour grid. |
| `analytics-scorecard.png` | `/performance/scorecard`: headline tiles and breakdown table. |

### Strategy

| File | Capture |
|---|---|
| `opsp-editor.png` | `/opsp` showing several sections of the strategic form. |
| `opsp-cascade-modal.png` | The Replace confirmation modal in the OPSP editor. |
| `opsp-export.png` | The OPSP export flow with the duplicate-detection list. |
| `habits-fill-form.png` | `/performance/habits` as a non-admin: habits and sub-items. |
| `habits-aggregate.png` | The admin aggregate view with per-habit scores. |
| `swt-page.png` | `/performance/swt`: the three colour-coded sections. |

### People

| File | Capture |
|---|---|
| `people-cycle-hub.png` | `/performance/cycle`: phase card and next-action links. |
| `people-review-panel.png` | The Reviews right panel: star rating, strengths, improvements. |
| `people-talent-grid.png` | `/performance/talent`: the 3×3 grid with people plotted. |
| `face-chart.png` | `/performance/face`: function rows, owners, measures. |
| `survey-list.png` | `/performance/survey`: tabs, survey list, public-link control. |

### Administration

| File | Capture |
|---|---|
| `org-setup-nav.png` | Sidebar with Org Setup expanded, alongside one of its pages. |
| `settings-company.png` | Settings → Company: name, timezone, currency, accent swatches. |

## Adding a new figure

Add a `figure` block to the relevant file in
`apps/quikscale/lib/knowledge-base/content/`:

```ts
{
  type: "figure",
  file: "my-new-screen.png",
  caption: "Short caption shown under the image",
  hint: "What the screenshot should show, used as the placeholder text",
}
```

Then add a row to the checklist above. Both renderers (web and PDF) pick it up
automatically — no component changes needed.
