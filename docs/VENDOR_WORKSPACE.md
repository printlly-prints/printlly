# Paprout vendor workspace update

## Scope and parity audit

The requested scope is the shop-owner website first. The customer app's upload, checkout, UPI, saved shops and customer chat belong to the customer journey.

| Vendor capability | Website coverage |
| --- | --- |
| Account registration/sign-in | Existing APIs; fixed new-session shop-loading race |
| Shop setup | Updated layout, named contact, Google Maps share-link preview and confirmed address |
| Shop location | Shared Google-link UI in setup and profile; stores exact pin only when supplied by the link |
| Shop/owner photos and KYC | Existing profile/upload flow retained |
| Open/busy/closed and business hours | Existing status menu, schedule and API retained |
| Print rates, sizes, sides and services | Existing pricing and finishing-services UI retained |
| Order queue and fulfillment | Existing accept/ready/pickup-code workflow retained |
| Earnings and payout information | Existing ledger/profile payout details retained |
| Notifications | Added own-account inbox and mark-read/read-all controls using existing API |
| Account settings | Replaced placeholder with account information and existing password-change API; refreshes the current session token |

## Free Google Maps flow

Vendors only see Share → Copy link. The server accepts long Google Maps links and expands supported Google short links through at most four validated redirects. Every redirect is restricted to known HTTPS Google Maps hosts; credentials, nonstandard ports and external redirect targets are rejected. Incoming iframe HTML is never rendered: only an allowlisted Google URL is retained. The generated preview uses Google's consumer map embed, including Google's own attribution. There is no paid API, API key or address scraping.

For the full business card, a CID or place identifier is used when available. A Google-generated embed URL is also accepted for compatibility, but vendors are not instructed to copy code. The reference at https://sixbytes.in/contact uses a Google Maps share/embed iframe. Google's sharing instructions: https://support.google.com/maps/answer/7101463 . Maps URLs: https://developers.google.com/maps/documentation/urls/get-started .

Free links don't always contain a street address or an exact marker. The form uses any address text supplied in the link, and asks the owner to confirm the address shown in Google's card. It never labels a camera viewport as an exact shop pin or invents a street address. Exact coordinates are saved as GeoJSON [longitude, latitude] when present. An opaque new link clears any stale old pin. Customers cannot receive a misleading computed distance from a guessed point.

POST /shops accepts optional Google map fields and coordinates in the same atomic create. Legacy clients that send name/address/contact still work. PATCH /shops/me/location updates the link, address and pin together. Full customer-app UI migration to these new link fields is outside this vendor-first update.

## Artwork

Three generated, context-specific illustrations are saved as alpha-preserving WebP assets: setup-location-male-v2.webp, print-desk-v1.webp and notifications-v1.webp. The setup scene uses the original male shopkeeper as its identity reference. Prompts requested hand-drawn charcoal outlines, ivory paper, cyan, yellow and small magenta accents; no text or logos. The shopkeeper checks a phone and map, the mascot waits at the print desk, and the inbox mascot opens a notice. Original generated PNGs remain in Codex's generated-images directory.

Design refinement followed Unslop by [Damir Sokolovsky](https://heydamir.design/unslop), CC BY 4.0.

## Validation

For local shop-photo testing, set LOCAL_SHOP_PHOTOS=true in backend/.env. Outside production, the owner/shop JPG/PNG upload route then stores images in ignored backend/.local-media/shop-photos and serves public image URLs through /media/shops. File signatures are checked, filenames are random, replacements are cleaned up, and failed multi-image saves discard new files. This switch is ignored in production; KYC and customer documents still require their existing protected cloud storage. Check with backend/scripts/checkLocalShopPhotos.js.

- Vendor production build and token/coordinate checks.
- Isolated MongoDB integration check: backend/scripts/checkShopRegistration.js. It creates and drops its own paprout_shop_check_* database; it never writes fixtures to paprout_local.
- Checks cover auth/role restrictions, Google host validation, redirect safety, embed URL parsing, exact-pin precedence, missing address/coordinate behavior, atomic persistence and legacy registration compatibility.
- Browser review uses a separate localhost API and isolated fixture database. No fake ratings, testimonials or vendor earnings are introduced into the application database.
- A real maps.app.goo.gl Share link was expanded and rendered as Google's full place card, then submitted through registration. The saved address, Google URLs and exact marker were checked in the isolated database; registration continued to photos and verification.
- Live GPS, paid Google APIs, email, OAuth and physical printer integration are not exercised. Free Google iframe/share-link availability remains owned by Google.
