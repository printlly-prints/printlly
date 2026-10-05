# Printlly design tokens — web

The vendor dashboard's tokens live in `vendor-website/tailwind.config.js`. This file
explains the reasoning and the usage rules. **Keep the two in sync.**

The mobile app carries the same tokens in `userapp/src/theme/` (`colors.js`,
`typography.js`, `spacing.js`). A brand change means editing exactly two
files: `tailwind.config.js` and `userapp/src/theme/colors.js`.

> **The two are currently out of step.** The website moved to the Nature
> Green ground (pale green surfaces, dark green text); the app still
> carries the earlier off-white/dark-teal values. Only the *neutrals*
> differ — teal remains the brand and action colour on both — but the
> surfaces and text tokens in `userapp/src/theme/colors.js` need the same
> treatment before the two surfaces read as one product again.

## Colour

Use the token name, never a raw hex or a stock Tailwind class
(`bg-slate-50`, `text-indigo-600`). There are currently **zero** raw
palette classes in `vendor-website/src` and no hardcoded hex in `userapp/src` — the one
exception is `GetApp.jsx`, where `qrcode.react` takes literal colours
rather than classes, and is commented as such.

### Surfaces

| Token              | Hex       | Use |
| ------------------ | --------- | --- |
| `background`       | `#EAF7F4` | Page ground, and the base note of the landing backdrop |
| `background-soft`  | `#E9F6EC` | Natural green: recessed areas inside a card |
| `background-tint`  | `#DDF5F3` | Soft teal: the deepest of the three grounds |
| `surface`          | `#FFFFFF` | Cards, panels, inputs — **foreground material only** |
| `surface-deep`     | `#0E3A33` | The landing footer: the floor of the environment |
| `border`           | `#D7E8DB` | Dividers, input borders, card outlines |

The ground is one continuous teal + natural green. **White is a
foreground material, not a background**: cards, panels and inputs, never
a full-width section. A page that alternates white and tinted bands reads
as "a white site with some green on it", which is the opposite of the
intent — the contrast between the green ground and the white cards *is*
the visual hierarchy. Never paint a card in `background` either; it will
sink into the ground behind it.

### The landing backdrop

The marketing page does not give each section a background. One element,
`components/landing/PageBackdrop.jsx`, is inset to the full document
height and carries the whole environment: a base wash whose stops follow
the section order, five blurred wave bands, blurred orbs and the corner
leaves. Every section is transparent.

This is deliberate. Sections that each paint their own ground can only
approximate continuity — every boundary is a place where two fills meet,
and the eye finds them. With one layer behind everything there are no
boundaries in the background to find.

Two things to know before editing it:

* **The wave bands must stay blurred.** Squashed into a shallow band, the
  curve flattens towards a straight diagonal and its hard fill edge reads
  as a crease in cut paper. The blur dissolves the edge and leaves the
  gradient of the curve, which is what actually looks like water.
* **The wash stops are measured percentages**, taken from where the
  sections actually fall on the rendered desktop page. On narrower
  viewports the sections change height and the bands drift; that is
  harmless only because no two neighbouring tones are more than a few RGB
  points apart. Keep it that way.

### Brand

| Token             | Hex       | Use |
| ----------------- | --------- | --- |
| `primary`         | `#087F8C` | Primary actions, active nav, focus rings, emphasis |
| `primary-deep`    | `#066A73` | Hover/pressed for primary actions — never a resting state |
| `primary-accent`  | `#0EA5A8` | Small accents on dark surfaces, where `primary` goes muddy |
| `primary-wash`    | `#E8F7F7` | Tinted backgrounds: selected rows, icon circles, info banners |

The intended balance is roughly **70% white/pale green, 20% light green,
8% dark text, 2% strong teal**. Teal is punctuation — if a screen reads
as teal overall, something is wrong.

### Decorative greens — marketing page only

| Token       | Hex       | Use |
| ----------- | --------- | --- |
| `leaf`      | `#3FA96B` | Blurred orbs and leaf silhouettes behind landing content |
| `leaf-soft` | `#8CCFA6` | The lightest leaf in a sprig, for depth |

These are **decoration only**. They never carry text, state, or an
action — teal remains the only colour that means "you can do something
here". Everything drawn with them is `aria-hidden` and
`pointer-events-none`.

### Text — three levels

| Token            | Hex       | Use |
| ---------------- | --------- | --- |
| `text-primary`   | `#123326` | Headings and body text |
| `text-secondary` | `#4A6357` | Secondary copy: addresses, descriptions, row labels |
| `text-muted`     | `#72887C` | Tertiary only: timestamps, placeholders, inactive labels |

All three are deep greens rather than neutral greys, so type sits in the
same family as the ground instead of reading as grey on green.

`text-muted` is about 3.8:1 on white and **still below AA for body
text** — it is for things that are genuinely incidental. It is deliberately
a little darker than a pure-grey equivalent would be, because the pale
green grounds are darker than white: on the tinted band and the footer it
lands at 3.4:1 and 3.3:1, where a lighter tone would have dropped under
3:1. Anything the user actually has to read belongs in `text-secondary`
(6.5:1 on white, 5.7:1 on the footer) or `text-primary` (12:1 or better
everywhere).

One pre-existing exception this palette does not fix: `primary` teal as
*small* text sits at 4.2–4.5:1 on the tinted grounds (the footer link
hover, the `SectionLabel` pill), just under the 4.5:1 AA line. It was
4.3:1 on the old off-white footer too, so this is not new — but
`primary-deep` (5.6:1 there) is the drop-in fix whenever it matters.

### Feedback and status

| Token                                     | Use |
| ----------------------------------------- | --- |
| `success` / `success-bg` / `success-text` | Completion, "ready" confirmations |
| `error` / `error-bg` / `error-text`       | Failures, destructive actions, cancelled orders |
| `status-pending-*`                        | Pending orders |
| `status-active-*`                         | Accepted, and (when it exists) printing |
| `status-ready-*`                          | Ready for pickup |
| `status-done-*`                           | Completed and expired — both terminal |

Status colour is never the only signal: every badge carries its label
too, so the queue is readable without colour vision.

## Typography

| Family              | Weights       | Class          | Use |
| ------------------- | ------------- | -------------- | --- |
| Inter               | 400, 500, 600 | (default)      | Body copy, labels, inputs |
| Plus Jakarta Sans   | 600, 700, 800 | `font-heading` | Headings, buttons, prices, numerals |

Both are loaded in `index.html`. Headings carry slight negative tracking
at larger sizes; prices and OTPs use `tabular-nums` so digits don't jitter
as values change.

## Radius

| Token            | Value   | Use |
| ---------------- | ------- | --- |
| `rounded-control`| `12px`  | Buttons, inputs, small controls |
| `rounded-card`   | `14px`  | Inner cards, list rows |
| `rounded-panel`  | `18px`  | Order cards, page panels |
| `rounded-hero`   | `22px`  | Hero cards |
| `rounded-modal`  | `20px`  | Modals and sheets |
| `rounded-full`   | pill    | Status badges, filter chips, tags — **nothing else** |

Controls stay tighter than the cards they sit inside.

## Elevation

| Token             | Use |
| ----------------- | --- |
| `shadow-card`     | Cards and panels, paired with the 1px border |
| `shadow-dropdown` | Menus and popovers |
| `shadow-modal`    | Modals |

Structure comes from the border; the shadow only lifts a surface off
what's behind it. Nothing should look like it's floating.

## Spacing

Tailwind's default 4px scale, used as-is. There is deliberately no custom
scale: `p-3` / `p-4` / `p-5` / `gap-2` / `gap-4` cover the dashboard, and
an extra layer of names would only add a second way to say the same
thing. The mobile app does define named tokens (`spacing.md`, `spacing.lg`)
because React Native has no utility classes to fall back on.

## Interaction and accessibility

- Every interactive element has a visible focus ring:
  `focus-visible:ring-2 focus-visible:ring-primary/40`.
- Buttons and inputs are at least `min-h-11` (44px) so they're
  comfortably tappable on touch screens.
- One primary action per view. `OrderCard` shows exactly one teal button
  at a time — whichever step that order is actually at.
