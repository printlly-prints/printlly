# Paprout motion templates

The visual reference is the [Paprout Lovable screen collection](https://paprout-print-and-pickup.lovable.app/), adapted to the user's Paprout branding and subsequent corrections. Captured references are in `design/mobile-concepts/lovable-reference/`. Motion is reused from native component templates and packages.

| Interaction | Upstream template | Local integration |
| --- | --- | --- |
| Moving compact downward scoop around the selected tab | [Reacticx Curved Bottom Tabs](https://github.com/rit3zh/reacticx/tree/main/src/components/base/curved-bottom-tabs) | Bezier geometry adapted in `userapp/src/components/vendor/reacticx/curved-bottom-tabs/`; spring and route state in `BottomTabBar.js` |
| Button, card, notification-row and bookmark press feedback | [Pressto](https://github.com/enzomanuelmangano/pressto), package `pressto@0.8.2` | Shared `Button.js`, `Card.js`, shop/notification rows, `SavedShopHeart.js` and the header bell |
| Upload/save/error notifications, swipe dismissal and Undo | [Sonner Native](https://github.com/idrissgarfa/react-native-sonner), package `react-native-sonner@0.2.0` | `AppToaster.js`, upload feedback, notification errors and saved-shop operations |
| Confirmation entry | Reanimated's built-in `FadeIn` preset | `OrderPlacedScreen.js` |

All three upstream projects are MIT licensed. Reacticx's copyright/license is preserved at `userapp/src/components/vendor/reacticx/LICENSE`. Package licenses remain in the installed packages and their distributions.

The Reacticx curve forms a compact downward scoop around a 40-pixel selected-tab circle. The original template's separate springs move the scoop horizontally and lift the selected circle; the previous circle settles back into its tab. Labels stay in place. Paprout adds responsive measured width, accessible tab selection, cyan styling and reduced-motion handling. The bar remains in layout and includes the bottom safe area; peer screens do not slide.

Pressto supplies the press animations. Paprout adds loading/disabled states and existing theme tokens. Reduced-motion settings remove press scaling. Sonner supplies notification entry/exit, stacking and swipe behavior; reduced motion uses a one-millisecond timing transition. Saved-shop removal exposes an eight-second Undo action. Failed changes restore only the affected shop, preserving concurrent changes to other entries.

The print workspace reuses the existing per-document controls. Inline settings travel to the existing quote/order endpoints unchanged. More print options retains finishing-service and notes controls. Notifications live in the header rather than the profile. Each tab keeps its independent history.

The open header retains Paprout's logo, adds a separate support-chat icon, and keeps notifications in the Print header. You offers the 17 approved human portraits exported from Figma node `68:1448`, excluding the mascot, plus display name and print defaults. These persist per account on the device. Seeded-mode labels and customer-visible simulation controls are absent; live payment verification is unchanged.

Orders use compact cyan/white cards with an Accepted → Printing → Ready journey and a small existing mascot. The backend groups preparation under `accepted`; no printer-start event or fabricated timestamps are introduced. The pickup code is hidden in the list and displayed in a yellow ticket with a copy action. Larger generated scene studies are archived outside the app assets and are not shipped.

## Validation

- Auth, contrast, assets, offline pricing/payment isolation and navigation checks pass.
- Android Metro/Hermes export passes with the templates.
- Browser checks cover animated tab navigation, toast display, saving/removing/restoring a shop with Undo, opening header notifications, and the full demo order flow: eight pages × two B&W copies at the sample PrintPoint rate yields ₹24 plus ₹3 fee = ₹27. Completing the simulated payment returns to Print and clears completed files.
- The integration has not been rechecked on physical Android/iOS hardware or a release build. Live API/payment verification remains outside this demo validation.
