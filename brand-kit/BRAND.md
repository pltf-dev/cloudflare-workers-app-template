# Brand kit

This template ships a deliberately **neutral** identity so that nothing here has to be
undone: dark ink, warm paper, one accent. Rebranding is a token swap.

## Tokens

All tokens are defined once in `src/styles/global.css` under `@theme`. Components only
ever reference them, so changing the values there restyles the whole app.

| Token | Default | Role |
|---|---|---|
| `--color-ink` | `#14171C` | Dark surfaces (header, error pages), headings |
| `--color-ink-2` | `#23282F` | Body text, dark panels |
| `--color-accent` | `#2F6BFF` | The one bright colour: primary actions, focus rings, links |
| `--color-accent-2` | `#5C8CFF` | Accent on dark backgrounds, hover states |
| `--color-on-accent` | `#FFFFFF` | Text on an accent fill |
| `--color-paper` | `#F6F5F1` | Page background |
| `--color-paper-2` | `#ECEAE3` | Alternate light background, input borders |
| `--color-muted` | `#5E6672` | Secondary text |
| `--color-on-dark` / `-dim` | `#ECEFF4` / `#A6AFBC` | Text on dark surfaces |
| `--color-line` / `--color-line-dark` | rgba | Hairlines on light / dark |
| `--color-success|error|warn` (+ `-bg`, `-border`) | greens/reds/ambers | Banners, badges, toasts |
| `--font-display` | serif system stack | Headings, wordmark |
| `--font-sans` | `system-ui` stack | Everything else |
| `--radius-brand` | `16px` | Cards and panels; buttons are pills (`999px`) |

## Swapping in your brand

1. Replace the hex values in `@theme`. Keep one bright accent; check contrast of
   `--color-accent` on `--color-paper` and of `--color-on-accent` on `--color-accent`.
2. Web fonts: add the `<link>` tags to both layouts (`Layout.astro`, `AdminLayout.astro`)
   and `login.astro` / `ErrorScreen.astro`, then change `--font-display` / `--font-sans`.
   The template ships system stacks so a page never waits on a third-party font request
   unless you choose to.
3. Logo: edit `src/components/ui/Logo.astro` (mark + wordmark) and `public/favicon.svg`.
   The email template in `src/lib/email/login-code.ts` uses inline hex on purpose (email
   clients ignore CSS variables); update it by hand.
4. Display name and domain: `pnpm rename <name> <domain>` handles these.

## Voice

Plain, short, sentence case. Say what happened and what to do next. Error and empty
states speak in the interface's voice: no apologising, no jargon.

## Quality floor

Responsive to 375px, visible keyboard focus, `prefers-reduced-motion` respected, touch
targets at least 44px.
