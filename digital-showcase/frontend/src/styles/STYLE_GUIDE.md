# Style guide

This file is the single source of truth for how the frontend is styled. If a
rule and the code disagree, the code is wrong — fix the code, not the rule
(or update this file first, in the same commit, with a reason).

## Where styles live

| File | What goes there |
|---|---|
| `styles/tokens.css` | Design tokens (`:root` custom properties). The only place raw colors, sizes and timings are written. |
| `src/ui/*.module.css` | UI-kit components. Every new screen is built from `src/ui` (`import { Button, Field, … } from "../ui"`). |
| `*.module.css` next to a page/component | Layout of that page: grids, columns, which kit component sits where. No new visual styles for buttons, fields, chips etc. — extend the kit instead. |
| `styles/global.css` | Reset and element defaults only (`body`, `a`, `img`, headings' margins), inside `@layer base`, plus the global reduced-motion rule. No class selectors. |

The catalog of every kit component and state is at **`/dev/ui`** (dev server
only; it is not in the production bundle). Check a change there first.

### Automatic checks

`npm run lint:css` (stylelint, config in `frontend/stylelint.config.mjs`)
checks every `.css` file under `src/`:

- no hex, named or `rgb()/hsl()` colors — use `--color-*` tokens;
- `font-size` only `var(--font-size-*)` (or `inherit`);
- no `px` in margin, padding, gap, inset or border-radius — use
  `--space-*` / `--radius-*`;
- `z-index` only `var(--z-*)` (or 0, 1, -1, auto);
- no `!important` (except the reduced-motion rule in `global.css`);
- unknown properties, units, pseudo-classes and at-rules, empty blocks.

`tokens.css` is the only file exempt from the value rules. Run the check
before every commit; fix the code rather than adding
`stylelint-disable` comments. If a rule is genuinely wrong for a case, change
the rule here and in the config, in the same commit.

### How the cascade is ordered

1. `global.css` is in `@layer base`, so every CSS Module (unlayered) beats it.
2. Kit modules load before page modules (`main.tsx` imports global styles
   first; `src/ui` is imported before any page). A page may therefore adjust
   a kit component through `className` with a single class of the same
   specificity — e.g. `<Card className={styles.hero}>` to change its radius.
3. Kit roots avoid layout properties (outer margin, width, flex, min-width) so
   the page decides where and how wide a component sits.
4. Grids in `Page` and `Card` use `minmax(0, 1fr)`: a wide child (a scrolling
   chip row, a long link) scrolls or truncates inside instead of widening the
   page. Do the same in page grids.

## UI-kit components

| Need | Use |
|---|---|
| Any button or button-looking link | `Button`, `ButtonLink` (`to` for app routes, `href` for downloads/external), `IconButton`, `IconButtonLink` |
| Pick files (photos, logo) | `FileButton` |
| «⋮» row actions | `Menu` |
| An icon | `Icon` with `size="xs" | "sm" | "md" | "lg"` — never `HugeiconsIcon` directly, never another icon library |
| Form field with label/hint/error | `Field` wrapping `Input`, `Textarea`, `Select` |
| On/off setting | `Switch` |
| Size / filter / category toggles | `Chip` inside `ChipGroup` |
| A color | `ColorSwatch` (static, or a toggle with `onClick`) |
| 2–3 mutually exclusive modes | `SegmentedControl` |
| Status label | `Badge`, `StatusDot` |
| Page shell | `Page` (`width="narrow"` for forms), `PageHeader`, `BackLink`, `Breadcrumbs`, `Card` + `CardHeader`, `SectionLabel`, `Stat` |
| Dialog | `Modal` (native `<dialog>`, bottom sheet on phones), `ConfirmModal` for irreversible actions |
| Short feedback | `useToast().show(…)`, `useCopyToClipboard()` |
| Inline message (error, warning, hint, «saved in background») | `Notice` with `tone` |
| Progress of a long upload | `ProgressBar` |
| Empty / loading / failed screen | `EmptyState`, `LoadingState`, `ErrorState` (with `onRetry`) |

## Typography

Font sizes come from tokens only; there is no raw `font-size: 13px`.

| Token | Value | Use for |
|---|---|---|
| `--font-size-2xs` | 11px | Counter bubbles only. |
| `--font-size-xs` | 12px | Badges, uppercase stat labels. |
| `--font-size-sm` | 13px | Field labels, hints, small buttons, chips. |
| `--font-size-md` | 14px | Buttons, menu options, secondary text. |
| `--font-size-base` | 15px | Body text. |
| `--font-size-lg` | 17px | Card and empty-state titles, brand. |
| `--font-size-xl` | 20px | Modal and section titles. |
| `--font-size-2xl` | 24px | Stat values. |
| `--font-size-h2` | clamp(20px, 4vw, 26px) | Page section headings. |
| `--font-size-title` | clamp(24px, 5vw, 32px) | Name of a store or product at the top of its page. |
| `--font-size-h1` | clamp(30px, 6vw, 44px) | Page titles. |
| `--font-size-input` | 16px | Every form field. Below 16px iOS Safari zooms the page on focus. |

Weights: `--font-weight-regular/medium/semibold/bold`. Line heights:
`--line-height-tight` (headings), `--line-height-snug` (labels, badges),
`--line-height-base` (body).

## Color

Semantic tokens only — no hex values outside `tokens.css`.

| Group | Tokens |
|---|---|
| Surfaces | `--color-bg` (page), `--color-surface` (cards), `--color-surface-muted` (fields, neutral buttons), `--color-surface-hover` |
| Text | `--color-ink` (primary), `--color-ink-muted` (secondary), `--color-ink-subtle` (placeholders, hints) |
| Lines | `--color-border`, `--color-border-strong` |
| Accent | `--color-accent`, `-strong` (hover), `-active`, `-soft` (tinted background), `-soft-hover`, `-ink` (text on accent) |
| Status | `--color-success/-soft`, `--color-warning/-soft`, `--color-danger/-strong/-soft/-soft-hover` |
| Other | `--color-overlay` (modal backdrop), `--focus-ring` |

## Sizes, layers, motion

- Control heights: `--control-xs` 32, `--control-sm` 36, `--control-md` 40,
  `--control-lg` 46, `--control-input` 44. To make the whole UI more
  finger-friendly, change these tokens, not components.
- Icon sizes: `--icon-xs` 14, `--icon-sm` 16, `--icon-md` 20, `--icon-lg` 24.
- Stacking: `--z-header` < `--z-dropdown` < `--z-modal` < `--z-jobs` <
  `--z-toast`. Modals and toasts also use the browser top layer.
- Motion: `--duration-fast` (hover), `--duration-base` (toasts),
  `--duration-slow` (sheets), `--ease-standard`. Reduced motion is handled
  globally in `global.css`.
- Shadows: `--shadow-hover` for clickable tiles and floating panels.

## Spacing & radius

### The rule

Padding, margin, gap, and border-radius are never written as raw `px`.
Always use a token: `var(--space-*)` for spacing, `var(--radius-*)` for
corners. This applies to every value in a shorthand (`padding: var(--space-2)
var(--space-4)`, not `padding: 8px var(--space-4)`).

Raw `px` is still fine for things that are *not* spacing/radius: font-size,
icon width/height, border thickness, fixed component dimensions
(`width: 44px` on a thumbnail), `top`/`left`/`right`/`bottom` offsets,
transform/animation values.

### Spacing scale (4px grid)

| Token | Value | Use for |
|---|---|---|
| `--space-0-5` | 2px | Hairline gaps only — see "Exceptions" below. Do not use for anything else. |
| `--space-1` | 4px | Icon-to-label gaps, badge padding, smallest paddings (e.g. `input[type="color"]`). |
| `--space-2` | 8px | Default small gap between related inline items (icon+text, chip content, list gaps). |
| `--space-3` | 12px | Default control padding (inputs, selects, chips, buttons' horizontal padding). |
| `--space-4` | 16px | Default gap between grouped blocks/sections; default card padding for compact cards. |
| `--space-5` | 20px | Slightly larger block padding (pill-shaped elements like toasts). |
| `--space-6` | 24px | Card/panel padding, page-section gaps. |
| `--space-8` | 32px | Large section spacing. |
| `--space-10` | 40px | Icon-inset padding (e.g. text input with a leading search icon), large control sizing. |
| `--space-12` | 48px | Large layout gaps. |
| `--space-16` | 64px | Largest layout gaps (hero/page-level). |

### Radius scale

| Token | Value | Use for |
|---|---|---|
| `--radius-sm` | 8px | Small elements — badges, thumbnails, popup list items. |
| `--radius-md` | 12px | Default control radius — inputs, buttons, chips, cards. |
| `--radius-lg` | 16px | Panels, cards, larger containers. |
| `--radius-xl` | 20px | Large containers (galleries). |
| `--radius-2xl` | 24px | Largest containers. |
| `--radius-pill` | 999px | Fully-rounded pills and circles on rectangular elements (chips, avatars-in-a-box, dots). Never write `999px` directly — always `var(--radius-pill)`. |

For a true circle on an already-square element (`width === height`),
`border-radius: 50%` is fine and preferred over `var(--radius-pill)` — it's
the standard CSS idiom for circles and reads more clearly than a pill radius
on a square box. `border-radius: 0` to explicitly remove rounding is also
fine as-is (it's not a missing token, it's "no radius").

### Exceptions (documented in the CSS, not just here)

- **`--space-0-5` (2px half-step).** A few components need a gap tighter
  than 4px: tight two-line text stacks (`.rowTitle` in DashboardPage,
  `.storeTitle`, `Switch` label/description, `Notice` title/text) and the
  `SegmentedControl` button gutter. Rounding these up to `--space-1` (4px)
  would visibly double the gap, so this half-step token exists instead of
  forcing a bad round. Don't reach for it for anything else — if you think
  you need it, first check whether `--space-1` actually looks fine.
- **Offsets derived from a component size.** When a spacing value has to
  follow the size of an element (e.g. a product row's second line starts
  under the title, after a 44px thumbnail), don't write `calc(44px + …)` in
  a margin. Declare the size once as a local custom property on the parent
  and derive the offset from it:
  `--thumb-size: 44px; --under-title: calc(var(--thumb-size) + var(--space-3));`
  then `width: var(--thumb-size)` on the thumbnail and
  `margin-left: var(--under-title)` on the second line. The size itself is a
  dimension (width/height), not spacing.

### Adding a new token

Before adding a token, try the two options above (nearest existing token,
or reuse an existing exception). Only add a new token when a value is used
in more than one place (a true one-off should just round to the nearest
token) and no existing token is within ~25% of it. When you do add one:

1. Add it to `:root` in `tokens.css`, in the matching block, in
   ascending order.
2. Name it by its position in the scale (`--space-7`, not `--space-28px`).
3. Add a one-line comment above it explaining what it's for, same as
   `--space-0-5`.
4. Add a row to the table in this file.
