import defaultTheme from "tailwindcss/defaultTheme";

// Printlly design tokens for the ADMIN panel.
//
// The colour/radius/shadow scales below are copied verbatim from
// vendor-website/tailwind.config.js rather than re-invented, so the two internal
// surfaces read as one product - a teal is the same teal in both. The
// marketing-only pieces (the `hand` font used for the landing page's
// handwritten marginalia, the leaf decoratives) are dropped: nothing in
// an internal tool has any use for them.
//
// This panel is deliberately plainer and denser than the vendor
// dashboard - more tables, less polish - but it is built from the same
// tokens, not a separate palette.
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // =================================================================
        // DARK THEME
        // =================================================================
        //
        // Only the NEUTRAL and SURFACE tokens below were darkened. Every
        // brand and semantic colour is byte-for-byte what it was in the
        // light theme - primary, primary-deep, primary-accent, leaf,
        // leaf-natural, leaf-soft, success, error, busy, shut. Those are the
        // product's identity, not a theme concern.
        //
        // WHERE THE DARK VALUES COME FROM
        //
        // They are not invented. Printlly already contained its own dark
        // greens before this theme existed:
        //
        //   #0C2419  the deep green in the landing page's app-promo panel
        //   #123326  the old text-primary - the darkest brand neutral
        //   #0E3A33  the footer's teal-green ground (the old surface-deep)
        //
        // The surface ladder is derived from those three, so this is the same
        // hue family at lower lightness rather than a new palette. The page
        // family still leans green (as #F0FAF4 did) and the accent family
        // still leans teal (as #EAF7F4 did).
        //
        // ELEVATION, and why it is explicit now
        //
        // In light mode depth came mostly for free: a white card on a tinted
        // page is obviously a card. On dark, every surface is dark, so the
        // ladder has to be stated and each step has to be a real luminance
        // step:
        //
        //   background      the page ground, deepest
        //   background-soft a recessed area inside a card
        //   input           a form field (recessed within a card)
        //   surface         a card or panel, lifted off the page
        //   surface-raised  a nested card, dropdown, modal, hover state
        //
        // Every foreground/background pair these tokens can produce was
        // checked against WCAG rather than judged by eye - dark-on-dark is
        // exactly where eyeballing fails, because a pair can look plausible
        // and measure 2:1. Body text clears 4.5:1 on every surface it can
        // land on, muted text clears 3:1, and each surface clears its
        // neighbour in the ladder.

        // ---- Surfaces ----
        background: "#08201A", // page ground
        "background-page": "#08201A", // the dashboard's own ground
        "background-soft": "#0C2822", // recessed areas inside a card
        "background-tint": "#0A2621", // the teal-leaning ground note
        surface: "#123330", // cards, panels - was #FFFFFF
        // Nested cards, dropdowns, modals, popovers and hover states. New in
        // the dark theme: on white a nested surface could be separated by a
        // border alone, but on dark it needs its own step up or it dissolves
        // into the card around it.
        "surface-raised": "#18423D",
        // Form fields. Recessed relative to the card they sit in, which is
        // the opposite direction from the light theme (where an input was
        // white on a tinted card) and the right one here: a well, not a tile.
        input: "#0C2824",
        // The footer, and the scrim behind a modal. It was the ONE dark
        // landing in the light theme; it is now the deepest thing on the
        // page, so the floor still reads as the floor.
        "surface-deep": "#04120F",

        // ---- Brand teal - UNCHANGED ----
        primary: "#087F8C",
        "primary-deep": "#066A73", // hover / active
        "primary-accent": "#0EA5A8",
        // A tinted surface, not a brand colour: the light theme's #E8F7F7
        // served selected states and icon circles, and this is the same role
        // at dark lightness. Same teal hue.
        "primary-wash": "#0D3034",
        // The teal, light enough to READ as text on a dark surface.
        //
        // `primary` (#087F8C) is correct as a FILL - white on it clears
        // 4.7:1, and it pops harder against dark than it ever did against
        // white. But as TEXT on a dark card it measures about 2.2:1, which is
        // unreadable. This is the same hue at higher lightness, used only
        // where teal has to be legible as text or a small icon: links,
        // emphasis, active nav labels, icons in a wash circle. It is a tint
        // of the existing teal in the way primary-wash is, and not a second
        // brand colour.
        "primary-bright": "#4FC9D1",

        // ---- Text - three levels, inverted in lightness and nothing else ----
        //
        // text-primary is deliberately NOT pure white. Full white on a dark
        // green ground glares and makes long copy tiring; this is a very
        // light green-grey from the same family as the surfaces.
        "text-primary": "#E6F2EC",
        "text-secondary": "#A9C3BA", // body copy
        "text-muted": "#7A938B", // tertiary only - timestamps, placeholders

        // ---- Borders do more work than they did ----
        //
        // On white, a card was obvious because it was white on tint. On dark
        // a card is dark on dark, so the 1px edge is what actually draws it.
        // This is therefore a decisively visible value (1.5:1 against a card)
        // rather than the whisper #D7E8DB was.
        border: "#27504A",
        // For edges that must assert themselves: a focused input, a selected
        // row, the card that is the subject of the screen. Used at 1px in
        // most places and 2px only where a state must be unmistakable.
        "border-strong": "#3A6B63",

        // ---- Decorative organics - UNCHANGED ----
        //
        // The blurred orbs and leaf shapes on the marketing page. All three
        // are used at very low opacity, so on a dark ground they now read as
        // a soft green glow rather than a soft green shadow - the same
        // decoration, lit from the other side. Never for text, controls or
        // state; teal remains the only action colour.
        leaf: "#3FA96B",
        "leaf-natural": "#2E8B57",
        "leaf-soft": "#8CCFA6",

        // ---- Semantic - the signal colours are UNCHANGED ----
        //
        // success, error, busy and shut keep their exact values: they ARE the
        // signal, a vendor and their customer must see the same state in the
        // same colour, and each already reads well against dark. Only the
        // bg/text pair behind them moved, and each pair gained a `-border`.
        //
        // That border is new and load-bearing. On a dark card several of
        // these fills land at almost the same luminance as the card itself -
        // a teal-green "ready" fill on a teal-green card is the worst case -
        // so without an edge the pill stops reading as a pill and the label
        // looks like floating text. The border restores the boundary without
        // altering the fill's colour, which is the "increase contrast or
        // thickness, don't change colour" instruction applied to badges.
        success: "#159A8A",
        "success-bg": "#0D322C",
        "success-text": "#5FD3BC",
        "success-border": "#1C6B5C",
        error: "#D9534F",
        "error-bg": "#3A1E1D",
        "error-text": "#F2A5A1",
        "error-border": "#7A3B38",

        // Shop availability. Busy is deliberately amber and NOT red: a busy
        // shop is trading normally and still taking orders, so it must never
        // read as an error or an outage. Closed uses its own muted red rather
        // than `error` for the same reason in reverse - a vendor choosing to
        // close is not a fault condition.
        // Mirrored by availabilityColors in the mobile app's theme.
        busy: "#D99018",
        "busy-bg": "#3A2E10",
        "busy-text": "#F2CE76",
        "busy-border": "#6B5518",
        shut: "#C85C5C",
        "shut-bg": "#3A1E1D",
        "shut-text": "#F2A5A1",
        "shut-border": "#7A3B38",

        // Order status pairs. Not all teal, so a queue stays scannable, but
        // tuned to sit beside the brand palette rather than using Tailwind's
        // stock hues. Every hue is preserved from the light theme; only
        // lightness moved, and each gained a border for the reason above.
        // Mirrors statusColors in the mobile app.
        "status-pending-bg": "#3A2E10",
        "status-pending-text": "#F2CE76",
        "status-pending-border": "#6B5518",
        "status-active-bg": "#152C45", // accepted and (future) printing
        "status-active-text": "#9BC6EE",
        "status-active-border": "#2E5480",
        "status-ready-bg": "#0D322C",
        "status-ready-text": "#5FD3BC",
        "status-ready-border": "#1C6B5C",
        "status-done-bg": "#202C2B", // completed and expired
        "status-done-text": "#B3C5C1",
        "status-done-border": "#415854",
      },
      // Tailwind's Preflight gives any element with a bare `border` (or
      // `border-b`, `divide-y`, ...) and no colour class its default
      // #e5e7eb - a light grey from the stock palette that belongs to no
      // part of this theme. On a light page that was merely off-brand; on a
      // dark one it is a bright line across a dark card.
      //
      // The compiled-CSS audit found exactly this rule sitting in Preflight,
      // so the default is pointed at the theme's own border token. Nothing in
      // the source relies on the old value, and this also means a future
      // `border-b` written without a colour is correct by default rather than
      // quietly light.
      borderColor: {
        DEFAULT: "#27504A",
      },
      divideColor: {
        DEFAULT: "#27504A",
      },
      fontFamily: {
        // Body copy - overrides Tailwind's default sans stack.
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
        // Headings and buttons, applied explicitly via `font-heading`.
        heading: ["'Plus Jakarta Sans'", ...defaultTheme.fontFamily.sans],
        // Handwritten marginalia on the marketing page only (the arrows
        // and asides around the hero illustration). Never for UI copy -
        // it is decorative, and the product surfaces stay on Inter/PJS.
        hand: ["Caveat", "cursive"],
      },
      borderRadius: {
        // Controls stay tighter than the cards they sit in. Pills are
        // for status badges, filter chips and tags - nothing else.
        control: "12px",
        card: "14px",
        panel: "18px",
        hero: "22px",
        modal: "20px",
      },
      boxShadow: {
        // Structure comes from the border; the shadow only lifts a surface
        // off what is behind it, and never on its own.
        //
        // DARK THEME: these are near-black now, and roughly three times the
        // opacity they were. The old values were tinted teal at 8-14%, which
        // is how you lift a white card off a pale page - and does essentially
        // nothing on dark, because a faint dark shadow cast onto an already
        // dark ground is very nearly the ground's own colour.
        //
        // Deepening them keeps elevation perceptible, but the real work of
        // separating surfaces moved to the explicit ladder in `colors` above
        // (background -> surface -> surface-raised) and to the stronger
        // border. A dark theme that tries to express depth through shadow
        // alone ends up flat.
        card: "0 8px 24px rgba(0,0,0,.34)",
        "card-hover": "0 14px 34px rgba(0,0,0,.46)",
        // The CTA glow stays TEAL rather than going black. It is the one
        // shadow that is a brand gesture rather than a depth cue - a teal
        // bloom under a teal button - and on dark it reads better than it
        // ever did on white.
        cta: "0 6px 20px -6px rgba(8,127,140,.55)",
        "cta-hover": "0 12px 28px -8px rgba(14,165,168,.65)",
        dropdown: "0 4px 12px rgba(0,0,0,.40), 0 18px 36px -16px rgba(0,0,0,.60)",
        modal: "0 10px 24px rgba(0,0,0,.45), 0 36px 68px -24px rgba(0,0,0,.70)",
        // The nav's hairline. The first layer was a near-white 1px line that
        // separated the bar from a pale page; on dark it has to be a visible
        // dark-theme border instead, or the bar and the page merge.
        nav: "0 1px 0 rgba(39,80,74,.9), 0 8px 24px -12px rgba(0,0,0,.55)",
      },
    },
  },
  plugins: [],
};
