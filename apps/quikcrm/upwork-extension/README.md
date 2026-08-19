# upwork-extension

Self-contained, loadable copy of the **Upwork feature** extracted from QuikFetch,
staged for migration into QuikCRM.

Nothing outside this folder was modified. The parent QuikFetch extension still
works exactly as before — this is a **copy**, not a move.

This folder is a valid MV3 extension on its own: `chrome://extensions` →
Load unpacked → select `upwork-extension/`.

## Provenance of every file

| File | Origin | Fidelity |
|---|---|---|
| `upwork.js` | `../upwork.js` | **Byte-identical copy.** No logic changes. |
| `upwork.html` | `../upwork.html` | **Byte-identical copy.** |
| `manifest.json` | `../manifest.json` | Rewritten: Upwork-only. See notes below. |
| `popup.js` | `../popup.js` + `../../linkedin-extension/linkedIn.js` | **Auth block replaced** with the LinkedIn extension's QuikCRM OAuth + org flow. `siteScriptMap`, `replacePopupScript`, `loadHTML`, `detectAndLoadScript`, `changeScript` and the toasts are verbatim. |
| `popup.html` | `../popup.html` | Login section replaced with QuikCRM Google/Microsoft buttons + org picker. Unsupported-site copy narrowed to Upwork. |
| `api.js` | `../../linkedin-extension/api.js` | **Byte-identical copy.** `API_BASE_URL` + `apiFetch`. |
| `background.js` | `../background.js` | Verbatim `closeSidePanel` handler + `onInstalled`. Dropped the unused `update_ui` listener. |
| `popup.css` | `../popup.css` + `../styles.css` | Merged. Only the rules the Upwork panel uses. |
| `assets/loader0.gif` | `../assets/loader0.gif` | Byte-identical. Used by `#fetchDataloader`. |
| `assets/icon16.png` | `../assets/icon16.png` | Extension icon. |
| `assets/quikitlogo.png`, `assets/Quikitlogo.png` | `../assets/quikitlogo.png` | Both casings shipped — see "Gotchas". |
| `assets/google.png`, `assets/microsoft.png` | `../assets/` | OAuth login buttons. |

### What changed vs. QuikFetch, exhaustively

1. `manifest.json` — removed all non-Upwork content scripts and host permissions.
   **`upwork.js` is no longer registered as a content script**, because it is a
   *side-panel* script; in a page context it throws immediately on `chrome.tabs`.
   That registration was vestigial in QuikFetch and is intentionally not carried over.
2. `popup.js` — `siteScriptMap` and `detectAndLoadScript` map Upwork only.
   Everything else (auth, org token, `loadHTML`, `changeScript`, toasts) is verbatim.
3. `popup.html` — the "doesn't support this site" paragraph no longer links
   LinkedIn/Freelancer, since those aren't in this folder.
4. `background.js` — dropped the `update_ui` listener (ContactOut-only).
5. `popup.css` — dropped `#right-side-container` (LinkedIn content-script styling).

No Upwork logic, selector, endpoint, field key, or storage key was altered.

## How it runs

```
Extension icon → side panel opens popup.html
  → popup.js reads chrome.storage.local.token (login flow writes it)
  → hostname "upwork.com" → siteScriptMap → loadHTML("upwork.html") into #htmlContainer
  → detectAndLoadScript() → <script src="upwork.js"> appended
  → upwork.js runs in the PANEL document
      ├─ resolves CRM page IDs → sessionStorage (UpworkId / UpworkAIId / GroupId)
      ├─ group typeahead (#groupSearch)
      └─ chrome.scripting.executeScript({function: scrapeData}) → runs in the UPWORK TAB
```

`scrapeData` and `retrunFunction` are the only functions that execute in the Upwork
page. They are serialized across the process boundary, so they **must stay
self-contained** — no outer-scope references. Preserve that when refactoring.

## External dependencies (unchanged)

**QuikCRM Upwork module** (Bearer token from `chrome.storage.local.token`) —
this is where "Add to CRM" now writes:
- `POST {API_BASE_URL}/api/upwork` — capture the scraped job. Idempotent:
  returns `{ job, duplicate }`, 201 for a new row and **200 with the existing
  row** when the job is already in the CRM.
- `POST {API_BASE_URL}/api/upwork/{id}/ai-analysis` — attach the AI chain's
  output to that job row.

Legacy QuikFetch endpoints still called by the group picker / page-id lookups
(not yet migrated):
- `POST https://lcncbackend.quikit.ai/api/backend/pages/found/searchPageId`
- `GET  https://lcncbackend.quikit.ai/api/backend/form-data/{groupId}/it_crm-group-text`

AI:
- `POST https://salesmy.moreyeahs.in/api/extract`  ← **no auth header** (commented out upstream)
- `POST https://salesmy.moreyeahs.in/api/generate_message`

Auth — **QuikCRM, same flow as the LinkedIn extension** (replaces the old
QuikFetch `backend.quikit.ai` / `go.quikit.ai` auth, which has been removed):
- `GET {API_BASE_URL}/api/extension-auth/start?provider=google|microsoft&return=<chromiumapp url>`
- `GET {API_BASE_URL}/api/extension-auth/callback` (server-side; not called by the extension)
- `GET {API_BASE_URL}/api/extension-auth/organizations` (Bearer)

`API_BASE_URL` lives in `api.js` — the same file the LinkedIn extension uses,
copied byte-for-byte. Switch local/UAT/prod by editing the constant there.

Storage contract:

| Store | Key | Written by | Read by |
|---|---|---|---|
| `chrome.storage.local` | `authToken` | `popup.js` → `startOAuth` | `api.js` → `apiFetch` |
| `chrome.storage.local` | `token` | `popup.js` → `startOAuth` (mirror of `authToken`) | every fetch in `upwork.js` |
| `chrome.storage.local` | `userEmail` | `popup.js` → `startOAuth` | — |
| `chrome.storage.local` | `selectedOrganization` | `popup.js` → `storeOrg` | org switcher |
| `chrome.storage.local` | `apiResponse3` | `upwork.js:708` | `getData()` |
| `sessionStorage` | `UpworkId`, `UpworkAIId`, `GroupId` | the 3 page-ID fetchers | `handleSaveClick`, `check` |

`token` is written as a mirror of `authToken` purely so the existing `upwork.js`
scraping fetches keep working without modification. When the Upwork scraping/AI
logic is migrated to QuikCRM APIs, switch those fetches to `apiFetch` and drop
the mirror.

`sessionStorage` here is the **side panel's**, not the Upwork page's.

## Gotchas carried over intentionally

Per instruction, existing Upwork logic was **not** fixed. Known issues:

1. ~~**`upwork.js:771`** reads `sessionStorage.getItem('UpworkId')` into a
   variable named `UpworkAIId` — the AI record is filed against the wrong CRM
   page.~~ **FIXED** by the QuikCRM Upwork module migration: the AI output is now
   PATCHed onto the job row it belongs to (`/api/upwork/{id}/ai-analysis`), so
   there is no second record and no page-id to mis-file.
2. `upwork.js:459` — `if (document.querySelectorAll(...))` is always truthy;
   `fetchGroups()` on line 463 is called without its required `groupId`.
3. `upwork.js:872` — inline `onclick="check()"` is dead under
   `script-src 'self'`; the `addEventListener` on line 950 is what works.
4. `upwork.js:1205` — a live `debugger;` statement in `retrunFunction`.
5. `upwork.js:742` — `parseJwt` defined but never called.
6. `getSearchPageData` / `getFreelancerPageIds` / `getgroupSearchPageData` are the
   same function with a different `name`. The "Freelancer" name is a misnomer —
   its body is Upwork logic.
7. Implicit globals: `spanText` (1116), `postData` (773).
8. Empty catch blocks at 229 / 956 / 959 swallow all AI-chain failures.
9. `innerHTML` with unescaped scraped + AI text (821).
10. AI feedback/client_message textareas are display-only; edits are discarded.
11. Toast helpers are duplicated between `popup.js` and `upwork.js`.
12. **Asset casing:** `popup.html` requests `./assets/Quikitlogo.png` but the file
    on disk is `quikitlogo.png`. Harmless on Windows/macOS, **breaks on
    case-sensitive filesystems**. Both casings are shipped here as a safety net;
    settle on one during the QuikCRM merge.
13. `popup.html` loads Tailwind 2.0.0 from `cdn.jsdelivr.net`. Permitted today
    because it's a stylesheet, but a stricter `style-src`/`default-src` in QuikCRM
    would break every class in `upwork.html`. Consider vendoring Tailwind.

## CRM field-key mapping

Opaque keys forming the contract with the QuikIT low-code backend. Get one wrong
and data lands in the wrong column silently.

**Main record** (`upwork.js:521-551`), `pageId: UpworkId`:

| Key | Source |
|---|---|
| `it_crm-pipeline-text-6` | jobTitle |
| `it_crm-pipeline-textarea-4` | jobDescription |
| `it_crm-pipeline-text-15` | projectprice |
| `it_crm-pipeline-text-14` | projectType |
| `it_crm-pipeline-text-12` | SkillsandExpertise |
| `it_crm-pipeline-text-16` | reviews |
| `it_crm-pipeline-text-17` | clientLocation |
| `it_crm-pipeline-text-13` | proposals |
| `it_crm-pipeline-text-18` | projectTime |
| `it_crm-pipeline-text-19` | ConnectsValue |
| `it_crm-pipeline-lookup` | `selectedGroup` |
| `it_crm-pipeline-select` | `"Upwork"` |
| `it_crm-pipeline-stage` | `"Raw"` |

**AI record** (`upwork.js:773-797`), `pageId: UpworkAIId`:

| Key | Source |
|---|---|
| `it_crm-pipeline-number` | match_percentages.description |
| `it_crm-pipeline-number-5` | match_percentages.industry |
| `it_crm-pipeline-number-4` | match_percentages.pain_points |
| `it_crm-pipeline-number-6` | match_percentages.roles |
| `it_crm-pipeline-number-3` | match_percentages.skills |
| `it_crm-pipeline-number-2` | match_percentages.technology |
| `it_crm-pipeline-textarea-2` | client_message |
| `it_crm-pipeline-textarea-1` | `#customMessege` (user input) |
| `it_crm-pipeline-textarea-3` | feedback |
| `it_crm-pipeline-number-1` | score |
| `it_crm-pipeline-text-8` | confidence |
| `it_crm-pipeline-select` | `"Upwork AI"` |
| `it_crm-pipeline-stage` | `"Raw"` |
| `it_crm-pipeline-text-6` | `"OK"` (hardcoded) |

## DOM contract

`upwork.js` requires these IDs. Most access sites are bare
`document.getElementById(...).value`, so a missing ID fails silently.

From `upwork.html`: `upworkdata`, `groupSearch`, `groupList`, `fetchsection`,
`fetchData`, `fetchDatatext`, `fetchDataloader`, `intialdata`, `output`, `save`,
`jobTitle`, `projectType`, `SkillsandExpertise`, `clientLocation`, `proposals`,
`reviews`, `projectprice`, `projectTime`, `ConnectsValue`, `jobDescription`,
`AI`, `alo`.

From `popup.html`: `htmlContainer`, `sucesstoaster`, `errortoaster`, `errorImage`,
`backButton`, `log`, `logOut`, `orgSelect`, `orgContainer`, `dj`, `hidemsgoogle`,
`loginbutton`, `or`, `email`, `password`, `logIn`, `googleSignInButton`,
`microsoftLogin`.

Created at runtime by `upwork.js`: `skipLoaderBtn`, `handleSave`, `customMessege`.

## Note on OAuth

Login now goes through QuikCRM's own extension-auth endpoints, identical to the
LinkedIn extension. There are **no OAuth client IDs in the extension** — the
provider client ID/secret live server-side (`GOOGLE_CLIENT_ID`,
`MICROSOFT_CLIENT_ID`, …), and the only redirect URI either provider needs
registered is QuikCRM's own `{origin}/api/extension-auth/callback`, which is
already registered for LinkedIn.

Consequence: this extension's ID does **not** need registering with Google or
Microsoft. `chrome.identity.launchWebAuthFlow` returns to
`https://<extension-id>.chromiumapp.org/`, and `/api/extension-auth/start`
accepts any `*.chromiumapp.org` return URL (signed into the `state` JWT), so a
freshly loaded unpacked copy works immediately.

Email/password login has been removed — only existing QuikCRM users can sign in.
