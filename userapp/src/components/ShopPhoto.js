import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { fonts, radius } from "../theme";
import { useTheme, useThemedStyles } from "../context/ThemeContext";

// A shop's photo (shop_photo_url - from GET /shops, GET /shops/:id, POST
// /shops/compare-pricing, GET /saved-shops, and everywhere else a shop is
// returned) wherever a shop is shown as a card. Vendor onboarding makes
// this optional (see models/Shop.js on the backend), so a shop with none
// yet falls back to a simple placeholder icon rather than a broken image
// or empty gap.
//
// `closed`: pass `!shop.is_currently_open` to lay a "Closed" scrim over
// the photo - the one place that overlay is drawn, so every card (Shops/
// Home/SavedShops/SelectShop) shows it identically. Callers additionally
// dim their own card's overall opacity when closed (see each screen) -
// this component only owns the photo itself.
//
// `style` overrides size/radius per call site (cards vary in width across
// ShopsScreen/HomeScreen/SelectShopScreen/SavedShopsScreen) - only the
// look of the box itself is opinionated here.
// memo()'d because this renders once per row in four different lists.
// `source` takes precedence over `uri` and accepts either shape React
// Native understands - a { uri } object or a bundled require(). It exists
// so callers can hand over whatever utils/shopImages.js resolved without
// first having to work out which kind of image they were given.

// How many times to re-attempt a remote photo that failed to load.
// Bounded on purpose: a genuinely dead URL should settle into the
// "unavailable" state quickly rather than retrying forever behind a
// customer's back.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function ShopPhoto({ uri, source, style, iconSize = 28, closed = false, shopName }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const compact = StyleSheet.flatten(style)?.height < 80;
  const imageSource = source || (uri ? { uri } : null);
  const remoteUri = imageSource && typeof imageSource === "object" ? imageSource.uri : null;

  // A remote photo can be present in the API response and still fail to
  // load on the device - no connectivity on the phone's network, a DNS
  // failure, a deleted Cloudinary asset. Without this the <Image> just
  // renders nothing and the card shows an unexplained empty box.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reason, setReason] = useState("");
  const retryTimer = useRef(null);

  const sourceKey = imageSource ? (remoteUri || String(imageSource)) : null;

  // Reset when this component is pointed at a DIFFERENT photo.
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
    setReason("");
  }, [sourceKey]);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  // The bug this replaced: `failed` was set once and only ever cleared by
  // the URI changing. A shop's URI never changes, and the once-a-minute
  // refetch (useOpenStatusRefresh) returns the identical string - so a
  // SINGLE transient failure, a momentary drop on the phone's wifi while
  // the list first painted, latched "Shop image unavailable" on that card
  // for as long as the screen stayed mounted, even after the network came
  // back. A bounded retry is what actually recovers from that.
  const handleError = useCallback(
    (event) => {
      const nativeError = event?.nativeEvent?.error;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("SHOP IMAGE FAILED", {
          shop: shopName || "(name not passed)",
          uri: remoteUri,
          attempt: attempt + 1,
          error: nativeError,
        });
      }
      if (attempt < MAX_RETRIES) {
        retryTimer.current = setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS);
        return;
      }
      setReason(String(nativeError || "unknown error"));
      setFailed(true);
    },
    [attempt, remoteUri, shopName]
  );

  // A retry has to change the source object for React Native to re-fetch
  // rather than serve the same failed entry from its image cache. The
  // suffix is added ONLY on a retry - the first, normal load always uses
  // the exact URL the database stored, so nothing about a working photo
  // is ever rewritten or cache-busted.
  const activeSource =
    attempt > 0 && remoteUri ? { uri: `${remoteUri}${remoteUri.includes("?") ? "&" : "?"}retry=${attempt}` } : imageSource;

  const showImage = imageSource && !failed;

  return (
    <View style={[styles.box, style]}>
      {showImage ? (
        <Image
          // Keyed by attempt so a retry actually remounts the Image
          // instead of React reusing the element that just failed.
          key={attempt}
          source={activeSource}
          style={styles.fill}
          resizeMode="cover"
          onError={handleError}
        />
      ) : (
        // Never another shop's photo in place of a missing one - a
        // neutral, labelled placeholder instead, so the gap is legible as
        // a gap rather than read as a picture of these premises.
        //
        // Two different situations, deliberately told apart:
        //   - no URL at all: this vendor never uploaded one. Just the
        //     icon; there is nothing to report.
        //   - a URL that would not load: say so, because the shop DOES
        //     have a photo and the customer is not seeing it.
        <View style={styles.placeholder}>
          <Ionicons name="storefront-outline" size={iconSize} color={colors.textMuted}
            style={[styles.placeholderIcon, { width: iconSize, height: iconSize, lineHeight: iconSize }]} />
          {failed && !compact ? <Text style={styles.placeholderText}>Shop image unavailable</Text> : null}
          {failed && !compact && __DEV__ ? (
            <Text style={styles.debugText} numberOfLines={2}>
              {reason}
            </Text>
          ) : null}
        </View>
      )}
      {closed ? (
        <View style={[styles.fill, styles.closedScrim]}>
          <Text style={styles.closedText}>Closed</Text>
        </View>
      ) : null}
    </View>
  );
}

export default memo(ShopPhoto);

const createStyles = ({ colors }) => ({
  box: {
    width: "100%",
    height: 110,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundSoft,
    overflow: "hidden", // clips the image/scrim to the box's own rounded corners
  },
  fill: { ...StyleSheet.absoluteFillObject },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  placeholderText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
  },
  // Icon fonts otherwise retain Android text baseline padding, which shifts
  // the storefront downward inside compact circular shop photos.
  placeholderIcon: { includeFontPadding: false, textAlign: "center", textAlignVertical: "center" },
  // Development only - the actual native error, so a failure on a real
  // device can be identified without attaching a debugger.
  debugText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 8,
    lineHeight: 10,
    color: colors.danger,
    textAlign: "center",
  },
  closedScrim: {
    backgroundColor: "rgba(16,42,46,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedText: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
});
