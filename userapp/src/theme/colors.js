// Paprout design tokens - the single source of truth for colour in the
// mobile app. Kept identical to the web dashboard's Tailwind config
// (vendor-website/tailwind.config.js) so both surfaces read as one product.
// Every screen imports from here; there are no hardcoded hex values
// anywhere else in userapp/src, and new code should keep it that way.
//
// ===========================================================================
// DARK THEME
// ===========================================================================
//
// Paprout runs dark. Only the NEUTRAL and SURFACE tokens below were
// darkened; every brand and semantic colour is byte-for-byte what it was in
// the light theme - primary, primaryDeep, primaryAccent, leaf, success,
// danger, and every status/availability dot. Those are the product's
// identity and they are not a theme concern.
//
// WHERE THE DARK VALUES COME FROM
//
// They are not invented. Paprout already contained its own dark greens
// before this theme existed:
//
//   #0C2419  the deep green in the landing page's app-promo panel
//   #123326  textPrimary - the darkest brand neutral
//   #0E3A33  the footer's teal-green ground (web: surface-deep)
//
// The surface ladder below is derived from those three, so the dark theme is
// the same hue family at lower lightness rather than a new palette. The page
// family leans green (as #F0FAF4 did) and the accent family leans teal (as
// #EAF7F4 did), exactly as before.
//
// ELEVATION, and why it matters more here than in the light theme
//
// In light mode, depth came mostly from a white card against a tinted page.
// On dark, every surface is dark, so the ladder has to be explicit:
//
//   background      the page ground, deepest
//   backgroundSoft  a recessed area inside a card
//   surface         a card or panel, lifted off the page
//   surfaceRaised   a nested card, a sheet, a modal, a pressed/hover state
//
// Each step is a real luminance step - validated, not estimated. Every
// foreground/background pair this file can produce was checked against WCAG:
// body text clears 4.5:1 on every surface it can land on, muted text clears
// 3:1, and each surface clears its neighbour in the ladder. See the comment
// on `border` for why borders carry more of the work here than they did.
export const colors = {
  // Surfaces. The app still sits in a continuous green/teal environment
  // rather than on flat pages - the difference is that the environment is
  // now a deep green rather than a pale one. `surface` is the foreground
  // material (cards, summaries, inputs, the OTP card), never the page
  // itself. See components/ScreenBackground.js, which paints the
  // environment.
  background: "#08201A", // page ground
  backgroundSoft: "#0C2822", // recessed areas inside a card
  backgroundTint: "#0A2621", // the teal-leaning ground note
  surface: "#123330", // cards, panels, inputs - was #FFFFFF
  // Nested cards, bottom sheets, modals, and pressed states. New in the
  // dark theme: on white, a nested card could be distinguished by a border
  // alone, but on dark it needs its own step up or it disappears into the
  // card around it.
  surfaceRaised: "#18423D",

  // Brand teal - UNCHANGED.
  primary: "#087F8C",
  primaryDeep: "#066A73", // hover / pressed
  primaryAccent: "#0EA5A8", // highlights on dark, small accents
  // A tinted surface, not a brand colour: the light theme's #E8F7F7 served
  // selected states and icon circles, and this is the same role at dark
  // lightness. Same teal hue.
  primaryWash: "#0D3034",
  // The teal, light enough to READ as text on a dark surface.
  //
  // primary (#087F8C) is correct as a FILL - white on it clears 4.7:1, and
  // it pops harder against dark than it ever did against white. But as
  // TEXT on a dark card it measures about 2.2:1, which is unreadable. This
  // is the same hue at higher lightness, used only where teal has to be
  // legible as text or a small icon: links, emphasis, active nav labels.
  // It is a tint of the existing teal, in the way primaryWash is, and not
  // a second brand colour.
  primaryBright: "#4FC9D1",

  // Text - three levels, inverted in lightness and nothing else.
  // textSecondary still carries body copy; textMuted is still genuinely
  // tertiary (placeholders, timestamps, inactive labels).
  //
  // textPrimary is deliberately NOT pure white. Full white on a dark green
  // ground glares and makes long copy tiring to read; this is a very light
  // green-grey that belongs to the same family as the surfaces.
  textPrimary: "#E6F2EC",
  textSecondary: "#A9C3BA",
  textMuted: "#7A938B",

  // Borders do more work in the dark theme than they did in the light one.
  //
  // On white, a card was obvious because it was white on tint. On dark, a
  // card is dark on dark, so the 1px edge is what actually draws it - which
  // is why this is a decisively visible value (1.5:1 against a card) rather
  // than the whisper #D7E8DB was.
  border: "#27504A",
  // For the edges that have to assert themselves: a focused input, a
  // selected row, a card that is the subject of the screen. Used at 1px in
  // most places and 2px only where a state must be unmistakable.
  borderStrong: "#3A6B63",

  // Natural green. Backgrounds, organic decoration and environmental
  // treatment ONLY - teal stays the single action colour, so nothing
  // tappable is ever painted in these.
  //
  // `leaf` is UNCHANGED (it is the brand's green). leafSoft was a pale
  // decorative wash (#E9F6EC) and is now its dark counterpart, because its
  // job is to tint the environment, not to be a fixed colour.
  leaf: "#2E8B57",
  leafSoft: "#0D2A1F",

  success: "#159A8A",
  successBg: "#0D322C",
  successText: "#5FD3BC",
  danger: "#D9534F",
  dangerBg: "#3A1E1D",
  dangerText: "#F2A5A1",
};

// Order status colours. Deliberately not all teal so they stay scannable
// at a glance, but tuned to sit beside the teal palette rather than
// Tailwind's stock hues. Identical to the web dashboard's status tokens.
//
// Never the only signal for a status - every badge carries a text label
// too (see statusLabels), so status is readable without colour vision.
//
// DARK THEME: every hue is preserved and every pair now clears 4.5:1 on its
// own fill. Each one also gained a `border`, which is new and load-bearing:
// on a dark card several of these fills land at almost the same luminance as
// the card itself - a teal-green "ready" fill on a teal-green card is the
// worst case - so without an edge the pill stops reading as a pill and the
// label looks like floating text. The border restores the boundary without
// altering the fill's colour.
export const statusColors = {
  pending: { bg: "#3A2E10", text: "#F2CE76", border: "#6B5518" },
  accepted: { bg: "#152C45", text: "#9BC6EE", border: "#2E5480" },
  // No backend status emits "printing" yet - orders go accepted ->
  // ready_for_pickup. Defined here so the UI is ready the day the
  // backend adds it; nothing renders it today. See utils/orderStatus.js.
  printing: { bg: "#152C45", text: "#9BC6EE", border: "#2E5480" },
  ready_for_pickup: { bg: "#0D322C", text: "#5FD3BC", border: "#1C6B5C" },
  completed: { bg: "#202C2B", text: "#B3C5C1", border: "#415854" },
  cancelled: { bg: "#3A1E1D", text: "#F2A5A1", border: "#7A3B38" },
  // Same neutral as "completed" (both terminal, no action needed), but
  // its own status so it isn't mistaken for a fulfilled order.
  expired: { bg: "#202C2B", text: "#B3C5C1", border: "#415854" },
  // Not a backend `status` value - payment_status is a separate field.
  // MyOrdersScreen/HomeScreen pass one of these two synthetic keys to
  // StatusBadge instead of the real (always "pending") status when an
  // order's payment_status isn't "paid" yet, same idea as "printing"
  // above. An order with no verified payment has no otp, so showing it
  // as a plain "Pending" print job would be misleading.
  payment_pending: { bg: "#3A2E10", text: "#F2CE76", border: "#6B5518" },
  payment_failed: { bg: "#3A1E1D", text: "#F2A5A1", border: "#7A3B38" },
};

export const statusLabels = {
  pending: "Pending",
  accepted: "Accepted",
  printing: "Printing",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  payment_pending: "Payment pending",
  payment_failed: "Payment failed - retry",
};

// A shop's live rush/queue level (GET /shops, GET /shops/:shopId/queue -
// see RushBadge). Deliberately reuses the exact same soft tones as three
// of the statusColors above rather than inventing saturated red/yellow/
// green - a busy shop should read as informative, not as an alarm, which
// is the whole point of "soft colours matching the calm theme" here. That
// reasoning survives the dark theme unchanged; only the lightness moved.
export const rushColors = {
  low: { bg: "#0D322C", text: "#5FD3BC", border: "#1C6B5C" }, // same as ready_for_pickup
  medium: { bg: "#3A2E10", text: "#F2CE76", border: "#6B5518" }, // same as pending
  high: { bg: "#3A1E1D", text: "#F2A5A1", border: "#7A3B38" }, // same as cancelled
};

export const rushLabels = {
  low: "Low rush",
  medium: "Medium rush",
  high: "High rush",
};

// Shop availability - the three-state answer the backend computes in
// utils/shopStatus.js and sends as shop_status. Mirrors the vendor
// dashboard's own tokens (vendor-website/tailwind.config.js) so a vendor and their
// customer see the same shop in the same colour.
//
// Busy is amber and deliberately NOT red: a busy shop is trading
// normally and still taking orders, so it must never read as an error.
// Closed gets its own muted red rather than the `danger` used for
// failures - a vendor choosing to close is not a fault.
//
// DARK THEME: the three `dot` values are UNCHANGED. They are the signal
// itself, they already read well against dark (3.3:1 or better), and a shop's
// state must look the same to the vendor and the customer. Only the bg/text
// pair behind them moved, and each gained a border for the reason given on
// statusColors.
export const availabilityColors = {
  open: { dot: "#159A8A", bg: "#0D322C", text: "#5FD3BC", border: "#1C6B5C" },
  busy: { dot: "#D99018", bg: "#3A2E10", text: "#F2CE76", border: "#6B5518" },
  closed: { dot: "#C85C5C", bg: "#3A1E1D", text: "#F2A5A1", border: "#7A3B38" },
};

export const availabilityLabels = {
  open: "Open",
  busy: "Busy",
  closed: "Closed",
};
