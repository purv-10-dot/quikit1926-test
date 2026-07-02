# Frontend Patterns

UI conventions across QuikIT apps. Read once; reference whenever you build a new screen.

## Components — use `@quikit/ui` first, build local second

The shared library at `@quikit/ui` exports ~50 primitives. Use them. Don't reinvent.

```tsx
import {
  Button, Input, Card, Badge, Modal, Avatar,
  Select, NumberInput, DateInput, Textarea, Checkbox,
  Tabs, DataTable, Skeleton, EmptyState, Pagination,
  UserPicker, FilterPicker, AddButton, MoreMenu,
  Tooltip, SlidePanel, ToggleSwitch,
  cn, formatDate, formatRelativeDate,
} from "@quikit/ui";
```

If something's missing:

1. **Stop**. Check `packages/ui/components/` source. The component you want often exists with a different name.
2. If genuinely missing, build it locally in `apps/<your-app>/components/`. Mark with a comment:
   ```tsx
   // TODO(integration): upstream to @quikit/ui — discussed in PR #XX
   ```
3. Don't propose adding to `@quikit/ui` from your repo (you can't edit it). The integration owner upstreams reusable patterns.

## File naming — strictly enforced

| What | How |
|---|---|
| Directories | `lowercase` — `components/dashboard/`, not `Dashboard/` |
| Component files | `lowercase.tsx` — `sidebar.tsx`, not `Sidebar.tsx` |
| Component exports | `PascalCase` — `export function Sidebar()` |
| Route files | Next.js conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` |
| Hooks | `useThing.ts` — `useUsers.ts`, not `Users.hook.ts` |
| Utilities | `lowercase.ts` — `validateEmail.ts`, exports `validateEmail` |
| Tests | `<name>.test.ts` for unit/api, `<name>.dom.test.tsx` for component tests |

CI doesn't enforce this automatically. The integration owner does, in review.

## Provider order — never change

```tsx
// components/providers.tsx
<SessionProvider>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      {children}
    </ThemeProvider>
  </QueryClientProvider>
</SessionProvider>
```

Reasons:
- `SessionProvider` outermost so every layer can read `useSession()`.
- `QueryClientProvider` next so React Query has a session to use in fetchers.
- `ThemeProvider` innermost because it sets DOM attrs and shouldn't gate auth.

If you add a provider (rare), place it inside `ThemeProvider` unless you have written approval otherwise. `ConfirmProvider` from `@quikit/ui` (which backs the `useConfirm()` hook) is the one commonly nested inside — most apps mount it just inside `ThemeProvider`.

## Theming — `accent-*` classes

Use Tailwind's `accent-*` utilities for branded interactive elements. They're mapped to CSS variables that change per org via `<ThemeApplier />` (each org sets its own `brandColor`/accent).

```tsx
// ✅ Themeable — buttons, focus rings, active tabs
<button className="bg-accent-600 hover:bg-accent-700 text-white" />
<a className="text-accent-600 hover:underline" />
<input className="focus:ring-accent-400" />
<span className="bg-accent-100 text-accent-700">Active</span>

// ✅ Hardcoded — semantic states (NOT themeable)
<div className="bg-green-500" />     // Success
<div className="bg-amber-400" />     // Warning
<div className="bg-red-500" />       // Error
<div className="bg-blue-500" />      // Info / completed
```

### Locked tables — do NOT theme cells

The 4 KPI/Priority/WWW tables in quikscale are locked. You won't touch them in your apps, but **the rule extends**: status indicators like "Completed" / "On Track" / "Behind" must use **fixed colors** (blue/green/amber/red), not `accent-*`. They represent semantic states tenants compare across, not brand.

For your domain status: pick fixed colors, document them, stick to them.

## Tailwind — what to use

- All apps extend `@quikit/ui/tailwind-config`. Don't override the theme.
- Use Tailwind utility classes. Avoid `style={{ … }}` inline styles unless dynamic.
- `cn()` helper from `@quikit/ui` (via `@/lib/utils`) merges classes intelligently:
  ```tsx
  <div className={cn("p-2", isActive && "bg-accent-50", className)} />
  ```

Do NOT define new colors in `tailwind.config.ts`. The theme is shared.

## Icons — Lucide only

```tsx
import { Plus, Pencil, Trash, Settings, ChevronDown } from "lucide-react";

<Plus className="h-4 w-4" />
```

Icon size by context:
- Inline next to text: `h-3 w-3` to `h-4 w-4`.
- Standalone button: `h-5 w-5`.
- Hero / empty state: `h-12 w-12` to `h-16 w-16`.

Don't use emoji 🚫 — accessibility + cross-platform inconsistency.

## Layout — server vs client components

Default to server components (no `"use client"`). Add `"use client"` only when you need:
- React hooks (`useState`, `useEffect`, `useRef`, etc.)
- Browser APIs (`localStorage`, `window`)
- Event handlers (`onClick`, `onChange`)

Move client logic into a small leaf component, keep the parent server-side. This minimizes client JS bundle.

```tsx
// app/(dashboard)/page.tsx — server component, no "use client"
import { ClientToolbar } from "@/components/client-toolbar";

export default async function HomePage() {
  const session = await getServerSession();
  return (
    <div>
      <h1>Welcome {session.user.name}</h1>
      <ClientToolbar />        {/* "use client" lives here */}
    </div>
  );
}
```

## Data fetching

| Where | How |
|---|---|
| Server Components | Direct DB calls via `db` (already typed, fast). |
| Client Components (initial render) | Pass server data as props from the parent server component. |
| Client Components (interaction) | React Query (`@tanstack/react-query`). |

```tsx
// Client component using React Query
"use client";
import { useQuery } from "@tanstack/react-query";

export function WidgetList() {
  const { data, isLoading } = useQuery({
    queryKey: ["widgets"],
    queryFn: () => fetch("/api/widgets").then((r) => r.json()),
  });
  if (isLoading) return <Skeleton />;
  if (!data?.success) return <EmptyState />;
  return <ul>{data.data.map((w) => <li key={w.id}>{w.name}</li>)}</ul>;
}
```

Don't `useEffect(() => fetch(...))`. React Query handles caching, retries, refetch-on-focus.

## Forms

```tsx
import { Field, FormRow, Input, Button } from "@quikit/ui";
import { useState } from "react";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export function CreateWidgetForm() {
  const [form, setForm] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }
    const res = await fetch("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const json = await res.json();
    if (!json.success) {
      setErrors({ submit: json.error });
      return;
    }
    // success path
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <FormRow>
        <Field label="Name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
      </FormRow>
      {/* ... */}
      <Button type="submit">Create</Button>
    </form>
  );
}
```

Don't pull in `react-hook-form` or `formik` unless the integration owner agrees. Keeping forms simple keeps bundle size low.

## Loading + empty states

- Use `<Skeleton />` / `<TableSkeleton />` from `@quikit/ui` for loading.
- Use `<EmptyState />` for empty lists. Always include a primary CTA.
- Don't ship "Loading…" text. Skeletons feel faster.

## Tables — use `<DataTable />`

```tsx
import { DataTable, type DataTableColumn } from "@quikit/ui";

const columns: DataTableColumn<Widget>[] = [
  { key: "name", label: "Name", render: (w) => w.name },
  { key: "owner", label: "Owner", render: (w) => w.owner.firstName },
  { key: "createdAt", label: "Created", render: (w) => formatRelativeDate(w.createdAt) },
];

<DataTable columns={columns} rows={widgets} />
```

Don't roll a table from scratch. The shared `DataTable` handles sticky headers, column resize, sort, hover.

## Modals — Radix-based primitives

```tsx
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter, Button } from "@quikit/ui";

<Modal open={open} onOpenChange={setOpen}>
  <ModalContent>
    <ModalHeader>
      <ModalTitle>Confirm delete</ModalTitle>
    </ModalHeader>
    <ModalBody>Are you sure?</ModalBody>
    <ModalFooter>
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="danger" onClick={onConfirm}>Delete</Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

Don't write custom backdrop / portal logic. The shared modal handles focus trap, scroll lock, esc-to-close.

## Accessibility — minimum bar

- All interactive elements have either text or an `aria-label`.
- Form inputs have associated `<label>` elements (use `<Field label>` from `@quikit/ui`).
- Color is never the only signal — pair with icon or text.
- Keyboard navigation: tab through every interactive element, esc closes modals, enter submits forms.
- Focus rings: never `outline: none` without a visible focus alternative.

## Common rejections

- ❌ Inline `style={{ color: "red" }}` instead of Tailwind classes.
- ❌ Hardcoded brand colors (`#0066cc`) instead of `accent-*`.
- ❌ Custom modal/dropdown/select instead of `@quikit/ui`.
- ❌ `useEffect(fetch)` instead of React Query.
- ❌ Provider order changed.
- ❌ Emoji as icons.
- ❌ "Loading..." text instead of `<Skeleton />`.
- ❌ Files named `Sidebar.tsx` (PascalCase) instead of `sidebar.tsx`.

## See also

- `packages/ui/components/` — full source of shared components.
- `docs/06-shared-packages.md` — what each `@quikit/*` package contains.
- `docs/exemplars/component-with-auth.example.tsx` — annotated reference.
