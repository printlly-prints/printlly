# Paprout brand and partner entry

Paprout replaces the displayed Printlly product name across the public website, partner dashboard, admin interface, customer app and transactional email copy. Existing service identifiers, Expo slug, API contracts, configured URLs and support destinations are retained; this change does not move infrastructure or invent new contact addresses.

The main headline, “Your next print, minus the wait.”, and the artwork caption, “Paperwork, with personality.”, are retained. The advertising tagline is **Paprout pe bhej de**. The mobile splash uses the marketing slogan **Print karna hai? Paprout kar le.** The website footer reads **Print karna hai?** followed by **Paprout pe bhej de**, as requested.

## Icon assets

The supplied Paprout identity sheet is the reference: folded-paper P, cyan, magenta and rich black. The built-in image tool extracted/adapted the standalone mark; Sharp handled transparent trimming, resizing and platform asset packaging. The mark retains its white interior and folded corner. The website keeps its darker cyan for legible action text while the logo retains the supplied bright colors.

- `vendor-website/public/brand/paprout-mark.png`: transparent mark for navigation and partner UI.
- `vendor-website/public/brand/paprout-icon.png`: opaque 1024 × 1024 app/touch icon.
- `userapp/assets/paprout-icon.png`: opaque 1024 × 1024 launcher icon.
- `userapp/assets/paprout-adaptive.png`: transparent Android foreground with safe padding.
- `userapp/assets/paprout-monochrome.png`: single-color transparent Android themed/notification silhouette.
- `userapp/assets/paprout-mark.png`: splash and in-app branding.
- Website/admin favicons and the customer web favicon use the same mark.

Image prompt: “Extract the EXACT standalone Paprout icon from the attached brand identity sheet (the ICON ONLY sample in middle bottom, and identical large mark at top left). Produce one high-resolution square transparent PNG containing ONLY that icon, centered with generous transparent padding (mark occupies 66% of canvas). Preserve its precise folded-page P silhouette, thick rich black outline, white interior, cyan top stroke and magenta lower curved P stroke, and realistic white/grey folded top-right paper corner. Match the supplied logo faithfully, do not redesign or invent anything. No lettering, no labels, no wordmark, no sheet, no tile background, no shadow outside the symbol. Exact colors cyan #00C2FF, magenta #FF2D8D, rich black #1A1A1A. White areas INSIDE the page remain white and opaque. Everything OUTSIDE the silhouette is fully transparent.”

App display name and icon configuration follow the [Expo SDK 57 app configuration reference](https://docs.expo.dev/versions/v57.0.0/config/app/). A rebuilt native binary is required to ship the launcher name/icon change.

## Shop-owner navigation

- The header always exposes **For print shops** on desktop and **For shops** on phones, without opening the mobile menu.
- A secondary hero link, mobile menu, command search and footer lead to `/print-partners`.
- The partner page explains orders, shop-defined prices, pickup verification and the actual setup/approval steps.
- Existing partners can sign in; new partners can create an email/password account or continue with the existing Google OAuth flow.
- Account creation uses the existing `POST /auth/register` contract with fixed `role: shop_owner`, then reuses the authenticated `/app` router to reach shop setup. Server validation and duplicate-account errors are preserved. The client uses native required/email/minimum-password validation.
- Without an API URL, account actions remain disabled with an honest unavailable notice.
- Partner help and support links target the actual FAQ/contact anchors. No fictional shop ratings, prices, testimonials or earnings claims were added.

## Verification

Production Vite builds passed for the website and admin panel. All 47 changed JS/JSX files passed parsing; mobile display-name configuration and referenced icon assets passed checks.

Browser checks cover desktop and 320/390px phone layouts, the always-visible partner entry, registration/sign-in navigation and retention of both original headlines. The local test API checks the registration payload, duplicate-account errors and the new-account handoff to shop registration. Typed short passwords are blocked by native browser validation. Screenshot evidence and measured results are in `design/website-validation/paprout-*`.

To repeat the isolated registration check, run `node vendor-website/scripts/partner-auth-smoke.cjs`, then start the website on port 5174 with `VITE_API_BASE_URL=http://127.0.0.1:5011`. Use name `Partner Test`, phone `9000000000`, password `test-passphrase-123`; `duplicate@example.test` produces a conflict, while `partner@example.test` produces a test-only session and routes to shop registration. The fixture binds only to localhost and never writes a database or creates real accounts.

Live Google OAuth, production email delivery, payments and native device builds were not exercised. Real API/download URLs and deployment contact details still need configuration.
