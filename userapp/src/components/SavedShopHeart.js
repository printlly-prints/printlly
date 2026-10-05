import { Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSavedShops } from "../context/SavedShopsContext";
import { colors } from "../theme";

// Heart toggle used on every shop card (Shops tab, Home's nearby list,
// Saved Shops list). Reads/writes the shared SavedShopsContext so all of
// them stay in sync without each screen fetching its own saved list.
//
// `overlay`: true when this heart sits on top of a shop photo (ShopPhoto)
// rather than plain card background - an arbitrary photo can't guarantee
// contrast the way a flat surface colour can, so it gets a translucent
// white backing to stay legible regardless of what's underneath.
export default function SavedShopHeart({ shop, size = 20, style, overlay = false }) {
  const { isSaved, toggleSaved } = useSavedShops();
  const saved = isSaved(shop._id);

  return (
    <Pressable
      hitSlop={10}
      onPress={() => toggleSaved(shop)}
      style={[styles.button, overlay && styles.overlayButton, style]}
    >
      <Ionicons
        name={saved ? "heart" : "heart-outline"}
        size={size}
        color={saved ? colors.primaryBright : colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayButton: {
    // Dark rather than the light theme's translucent white: the icon on
    // top is now light, and a light icon on a white pill is invisible.
    // Same job - bringing its own ground so an arbitrary photo cannot
    // wash the control out - from the other side.
    backgroundColor: "rgba(6,22,18,0.72)",
    borderRadius: 16,
    // A hairline so the pill still has an edge over a dark photograph.
    borderWidth: 1,
    borderColor: "rgba(230,242,236,0.22)",
  },
});
