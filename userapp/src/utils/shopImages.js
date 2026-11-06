// Resolving which photo to show for a shop.
//
// The rule, in order:
//   1. the shop's OWN uploaded photo (shop_photo_url) - this is the real
//      one, set by the vendor through the dashboard, and it wins always
//   2. a bundled demo photo, but ONLY when the shop's name matches one of
//      the four demo shops exactly
//   3. nothing - ShopPhoto draws its storefront placeholder
//
// Step 2 is deliberately an exact, normalized name match and nothing
// looser. The brief's instruction was "never mismatch a shop name and
// image", and a fuzzy match is exactly how that happens: a real vendor
// who happens to call their shop "Quick Print Solutions" would otherwise
// be given QuickPrint's storefront as though it were a photo of their
// own premises. A missing photo is a gap; a wrong photo is a lie about a
// real business.
import { DEMO_MODE } from "../config/runtime";
const DEMO_SHOP_PHOTOS = {
  copyhub: require("../../assets/shops/copyhub.jpg"),
  printpoint: require("../../assets/shops/printpoint.jpg"),
  crystalprint: require("../../assets/shops/crystal-print.jpg"),
  quickprint: require("../../assets/shops/quickprint.jpg"),
};

// "Crystal Print", "crystal print" and "CrystalPrint" are the same shop;
// "Crystal Printing House" is not.
function normalize(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Returns whatever <Image source> should be given, or null.
//
// A remote URL and a bundled asset are different shapes to React Native
// ({ uri } vs a module id), which is why this returns the source itself
// rather than a URL string - the caller shouldn't have to know which
// kind it got.
export function shopImageSource(shop) {
  if (!shop) return null;
  if (shop.shop_photo_url) return { uri: shop.shop_photo_url };
  const demo = DEMO_MODE ? DEMO_SHOP_PHOTOS[shop.demo_photo || normalize(shop.shop_name)] : null;
  return demo || null;
}

// True when the photo being shown is one of the bundled demo images
// rather than something this vendor actually uploaded. Screens use it to
// avoid presenting stock art as a photograph of the real premises.
export function isDemoShopPhoto(shop) {
  if (!shop || shop.shop_photo_url) return false;
  if (DEMO_MODE && shop.demo_photo) return true;
  return DEMO_MODE && Boolean(DEMO_SHOP_PHOTOS[normalize(shop.shop_name)]);
}
