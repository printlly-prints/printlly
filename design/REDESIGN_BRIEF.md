# Printlly / Paper in Motion

## Scope

Redesign the public website, partner dashboard, and existing Expo customer app. Supply Flutter-ready specifications. Keep backend and API contracts unchanged. Build editable workflows, grayscale wireframes, a component library, final screens, and motion in Figma using the Figma plugin only.

## Visual direction

Current user direction (11 October 2026): the restrained Ink & Paper proposal was rejected. The user explicitly dropped Swiss style and requested an original, expressive identity that matches PDF printing, with richer color themes and illustrated avatars/mascots. Paper in Motion uses an original folded-paper courier, expressive upload/shop/pickup characters, rounded paper tabs and perforated ticket details. Reference illustrations guide line energy and character proportions only; do not copy their characters. Preserve repository Printlly naming.

| Role | Color |
| --- | --- |
| Ivory | `#FFF7E8` |
| Surface | `#FFFFFF` |
| Aubergine text/structure | `#2C1838` |
| Secondary text | `#65516C` |
| Plum action | `#6D35B1` |
| Pressed action | `#53258D` |
| Lavender selection | `#EDE4F5` |
| Lime accent | `#D8F36A` |
| Apricot illustration fill | `#FF9E79` |
| Error text | `#A12F4D` |

Use Manrope for display and headings, Inter for body and controls, tabular numerals for prices and pickup codes. Use a 4px spacing scale, 48px minimum touch targets, 20–24px container radii and 12–16px control radii. Keep readable, quiet data regions for comparison, payment and partner operations. Ink/ivory contrast is 15.23:1; white/plum 7.52:1. Pale lime/apricot/lavender fills need a dark outline when their boundary identifies a control. No small white text on apricot. Validate actual rendered pairs. No emojis or unverified testimonials.

## Customer workflow

Sign in → Home → Upload PDFs → Per-document print settings → Compare/select shop → Review itemized price → Existing payment flow → Confirmation → Order status → Pickup code → Collected.

Provide recovery branches for unsupported/failed uploads, denied location permission, no matching shops, changed shop availability, failed/pending payment, disconnected order updates, and cancelled/expired orders. Preserve entered settings on recoverable errors. Keep Home, Shops, Orders, and Profile as the main navigation.

## Partner workflow

Sign in → Verification/shop setup when required → Dashboard → Order details → Accept → Mark ready → Verify pickup code → Complete. Include pricing/services, availability, earnings, and shop profile. Do not introduce a separate printing action without backend support.

## Figma structure

1. Product workflows and recovery branches.
2. Foundations: variables, type, spacing, semantic states, grid and motion.
3. Components: buttons, inputs, shop rows, document settings, itemized receipt, order timeline, pickup ticket, navigation and states.
4. Website wireframes and responsive final designs.
5. Mobile wireframes and final designs for the complete customer journey and account/support surfaces.
6. Partner dashboard and order handling.
7. Interactive prototype and Flutter handoff.

## Motion

Press feedback: 120ms. Selection: 180ms. Drawer/screen transition: 240–300ms. Upload success and pickup ticket reveal: 300ms. Use motion to communicate state, not to conceal content. Respect reduced motion. GSAP applies to the website; native animation applies to Expo; Flutter handoff uses AnimatedSwitcher/AnimatedContainer and Curves.easeOutCubic. Figma prototypes should demonstrate these transitions with editable components.

## Access status

The requested account was verified in the browser. Direct Figma connector tools remain unavailable in this chat. On 11 October 2026 the user authorized browser editing as a fallback. A new editable Design file is being constructed at https://www.figma.com/design/GLk1d6IiNCnsEFIEIVogwm. See FIGMA_REDESIGN_STATE.json for observed progress and pending validation. A submitted design-agent prompt is not evidence of a completed redesign.
