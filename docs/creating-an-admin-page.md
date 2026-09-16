# Creating an admin page

How to add a page under `/admin` so it inherits the shared chrome (header, nav, width)
and looks like the rest of the app. Follow this and you get the sticky header, the content
column, the tokens and the no-horizontal-shift behaviour for free.

> Design tokens live in `src/styles/global.css` (`@theme`) and the brand notes in
> `brand-kit/BRAND.md`. Use the `frontend-design` skill when shaping new UI.

## 1. Use `AdminLayout`, never your own `<html>`

Every admin page wraps its content in `src/layouts/AdminLayout.astro`. The layout owns the
document, renders the sticky `AdminHeader`, and provides the single centered column
(`.admin-page`, `max-width: 1080px`, `scrollbar-gutter: stable`).

```astro
---
export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../db/client";
import AdminLayout from "../../layouts/AdminLayout.astro";

const userId = Astro.locals.userId;
if (!userId) return Astro.redirect("/login");   // middleware already gates; this narrows the type

const db = getDb(env.DB);
// ...load your data...
---
<AdminLayout eyebrow="Manage" title="Page title" sub="Optional one-liner." active="items">
  <div class="card">…</div>

  <style>
    /* page-specific styles only: no width rule, no reset, no font links */
  </style>
</AdminLayout>
```

Do **not** import `global.css`, set your own `max-width`, or define a bespoke token block.

## 2. `AdminLayout` props

| Prop | Required | What it does |
|---|---|---|
| `title` | yes | Title-band heading; also the tab title unless `docTitle` is set. |
| `active` | no | Which nav item is current, one of the `NavKey`s in `src/lib/admin/nav.ts`. Omit on pages that aren't a nav destination. |
| `eyebrow` | no | Small uppercase kicker above the title. |
| `sub` | no | One line under the title. |
| `primary` | no | `{ label, href }` rendered as the accent CTA on the right of the title band. |
| `docTitle` | no | Browser tab title when it should differ from `title` (e.g. edit pages whose `title` is the record name). |

If the page is a new **menu destination**, add it to `NAV` in `src/lib/admin/nav.ts`
(key + label + href). That array is the single source of truth for the header.

## 3. Reuse the primitives

From `global.css`: `.card` (white surface), `.field` (label + input/textarea/select with
focus ring), `.hint`, `.banner.ok` / `.banner.err` (post-redirect status), `.badge.draft`
/ `.badge.published`, `.btn-pill` (secondary action), `.btn-pill--danger`. The primary
button style lives in `ItemForm.astro` (`.primary`); a page-level primary action should
go through the layout's `primary` prop instead of a big button in the body.

Tokens: `var(--color-ink)`, `--color-ink-2`, `--color-accent`, `--color-accent-2`,
`--color-paper`, `--color-paper-2`, `--color-muted`, `--color-line`, the
success/error/warn triples, `var(--font-display)`, `var(--font-sans)`,
`var(--radius-brand)`.

## 4. Form → endpoint → banner

Admin pages post plain HTML forms to `src/pages/api/admin/...` endpoints, which redirect
back with `?saved=1` or `?error=<code>`. Read the marker in frontmatter and render the
banner. `src/pages/admin/items/[id]/edit.astro` is the complete example.

## 5. React islands

Only when the page needs interactivity a form can't express (the image uploader). Astro's
scoped `<style>` can't reach into an island, so style it inline or with a namespaced
`<style is:global>` block on the page. `ItemImage.tsx` is the pattern.

## 6. Before you call it done

Run the full gate, then browser-smoke the page (see `AGENTS.md`): the route returns the
right status, the key content renders, no console errors, and the header and column line
up with the other pages (they will, if you used the layout).
