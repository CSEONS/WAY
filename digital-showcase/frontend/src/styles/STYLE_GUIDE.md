# Style guide — spacing & radius

This file is the single source of truth for spacing and corner-radius in
`global.css`. Any change to padding, margin, gap, or border-radius must
follow the rules below. If a rule and the code disagree, the code is wrong —
fix the code, not the rule (or update this file first, in the same commit,
with a reason).

## The rule

Padding, margin, gap, and border-radius are never written as raw `px`.
Always use a token: `var(--space-*)` for spacing, `var(--radius-*)` for
corners. This applies to every value in a shorthand (`padding: var(--space-2)
var(--space-4)`, not `padding: 8px var(--space-4)`).

Raw `px` is still fine for things that are *not* spacing/radius: font-size,
icon width/height, border thickness, fixed component dimensions
(`width: 44px` on a thumbnail), `top`/`left`/`right`/`bottom` offsets,
transform/animation values.

## Spacing scale (4px grid)

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

## Radius scale

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

## Exceptions (documented in the CSS, not just here)

- **`--space-0-5` (2px half-step).** A few components need a gap tighter
  than 4px: tight two-line text stacks (`.product-row-title`,
  `.store-card-title`) and the `.segmented` control's button gutter. Rounding
  these up to `--space-1` (4px) would visibly double the gap, so this
  half-step token exists instead of forcing a bad round. Don't reach for it
  for anything else — if you think you need it, first check whether
  `--space-1` actually looks fine.
- **`calc(44px + var(--space-3))`** in `.product-row-meta` /
  `.product-row-actions`. The `44px` mirrors `.product-thumb`'s fixed
  `width: 44px`, so text/action rows line up under the thumbnail. It's a
  component-size offset, not a spacing choice — don't round it to a space
  token, and if `.product-thumb`'s size ever changes, update this value to
  match.

## Adding a new token

Before adding a token, try the two options above (nearest existing token,
or reuse an existing exception). Only add a new token when a value is used
in more than one place (a true one-off should just round to the nearest
token) and no existing token is within ~25% of it. When you do add one:

1. Add it to `:root` in `global.css`, in the spacing or radius block, in
   ascending order.
2. Name it by its position in the scale (`--space-7`, not `--space-28px`).
3. Add a one-line comment above it explaining what it's for, same as
   `--space-0-5`.
4. Add a row to the table in this file.
