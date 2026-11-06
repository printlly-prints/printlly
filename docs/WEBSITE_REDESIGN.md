# Printlly website redesign

The public website now uses the approved CMYK Print Studio direction: paper white, ink black, process cyan for actions, and small yellow/magenta illustration accents. The old teal printer, leaves, simulated shop ratings and testimonial blocks are no longer rendered on the landing page.

## Implementation

- `vendor-website/src/pages/LandingPage.jsx`: illustrated split hero, compact service rail, interactive three-step ordering preview, local-shop explanation, FAQ and partner link.
- `vendor-website/src/styles/paper.css`: shared public-page tokens, responsive layout and reduced-motion rules.
- The public header, footer, customer/partner chooser, app-download page, partner login and legal-page shell use the same palette.
- Search pages with Ctrl/Cmd+K. Native dialog focus, Escape dismissal and mobile menu focus return are supported. Route loading has a skeleton; the GSAP intro can be interrupted and respects reduced motion.
- Customer ordering continues in the mobile app. No customer web checkout or unauthenticated shop API was invented.

## Palette

| Role | Value |
| --- | --- |
| Paper | `#FAFAF7` |
| Ink | `#242426` |
| Secondary text | `#616164` |
| Action cyan | `#007C9C` |
| Pressed cyan | `#00637D` |
| Pale cyan | `#E2F0F2` |
| Yellow | `#F2D85B` |
| Muted magenta | `#D6A0B8` |

## Artwork and prompts

The approved character sources came from `Ixotic27/printlly-local-design-backup`, commit `aff6dbfb65f3a86b4caa01b88c71fd37eb4cb96b`, under `assets/raster/approved-*.png`. The existing approved characters, proportions, expressions and illustrative style were retained in the colour adaptations. The built-in image-generation tool produced the palette edits, and the selected outputs were converted to WebP for the website.

Final website assets:

- `vendor-website/public/art/themes/pickup-cmyk.webp`
- `vendor-website/public/art/themes/student-cmyk.webp`
- `vendor-website/public/art/themes/shopkeeper-cmyk.webp`
- `vendor-website/public/art/themes/paper-pal-cmyk.webp`

The Blue Ink and Risograph pickup variations are kept alongside these for the requested theme examples. `vendor-website/public/theme-examples.html` provides all three interactive previews.

Shared prompt: "Precise palette-only edit of the approved Printlly illustration. Keep the original character, pose, expression, silhouette, props, proportions, patterns and hand-drawn illustration style. Change only clothing and accessory colours. Dark aubergine outlines/hair become near-black charcoal #25252A. Keep human skin tones and their shading unchanged. Maintain the original artwork quality and all details. All characters fully inside frame. Fully transparent background, with no glow, shadow, halo, bloom or texture around the character. No redesign, new objects, text or logos."

Per-character palette instructions:

- Pickup: process cyan cap and bag; warm process yellow shirt; very pale blue trousers; small muted-magenta shoe accents.
- Student: warm process yellow shirt; process cyan trousers retaining the cream dash pattern; muted-magenta socks; deep-cyan phone.
- Shopkeeper: process cyan apron retaining cream/yellow dashes; yellow pocket; charcoal trousers; original off-white shirt.
- PaperPal: process cyan bag/strap, yellow hardware and muted-magenta shoes; original cream paper body, pages and shoe soles.

## Verification

- Production Vite build passed.
- A clean npm install and production build also passed in the isolated PR checkout.
- The hero headline and “Paperwork, with personality.” caption are retained. The caption sits in its own row below the illustration; desktop and mobile checks confirm a 12px gap without overflow. The partner-login headline also sits above its illustration in normal flow.
- Contrast checks passed: white/cyan 4.81:1, ink/paper 14.82:1, secondary text/paper 5.90:1 and ink/yellow 10.88:1.
- Browser geometry checks passed at 320, 390, 768, 1024 and 1440 CSS pixels without horizontal overflow or clipped primary content.
- Ordering preview switched through shop selection and pickup states using pointer and keyboard input.
- FAQ expansion, command search filtering, Ctrl+K, Escape dismissal and focus restoration passed.
- Mobile menu Escape/focus return, app-download navigation, customer/partner chooser links and the privacy page were checked.
- The mobile command dialog restores focus after its native close event; this avoids focusing a menu item that was removed when the dialog opened.
- All three theme-preview variants displayed their recoloured artwork and switched successfully.
- Screenshots and measured breakpoint results are under `design/website-validation/`.

The local checkout has no configured app-store/download URL or API URL. The download page therefore displays an honest unavailable state; partner sign-in is disabled with an explanation. Live sign-in, checkout, payments and authenticated dashboard flows were not exercised.

## Installed guidance

17 skills were installed under the user's Codex skills directory: Unslop, Taste Skill, Humanizer, six Ponytail skills and eight official GSAP skills. They are discoverable on the next turn. The project `AGENTS.md` records the user's preference to use Ponytail for coding work.

Design guidance sources: [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop) (CC BY 4.0), [Taste Skill](https://github.com/Leonxlnx/taste-skill), [Ponytail](https://github.com/DietrichGebert/ponytail), [Humanizer](https://github.com/blader/humanizer), [GSAP skills](https://github.com/greensock/gsap-skills), and the supplied [DESIGN.md collection](https://github.com/VoltAgent/awesome-design-md).
