import { ActivityIndicator, StyleSheet } from "react-native";
import { PressableScale } from "pressto";
import { useReducedMotion } from "react-native-reanimated";
import { toast } from "react-native-sonner";
import { useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSavedShops } from "../context/SavedShopsContext";
import { colors } from "../theme";

export default function SavedShopHeart({
  shop,
  size = 20,
  style,
  overlay = false,
}) {
  const { isSaved, setSaved } = useSavedShops();
  const saved = isSaved(shop._id),
    reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const setter = useRef(setSaved);
  setter.current = setSaved;
  const change = async () => {
    if (busy) return;
    setBusy(true);
    const result = await setSaved(shop, !saved);
    setBusy(false);
    if (!result.ok) {
      if (!result.busy)
        toast.error("Couldn’t save your change", {
          description: result.message,
        });
      return;
    }
    if (result.saved)
      toast.success("Shop saved", { description: shop.shop_name });
    else
      toast("Shop removed", {
        duration: 8000,
        description: shop.shop_name,
        action: {
          label: "Undo",
          onClick: async () => {
            const restored = await setter.current(shop, true);
            if (restored.ok) toast.success("Shop restored");
            else if (!restored.busy)
              toast.error("Couldn’t restore shop", {
                description: restored.message,
              });
          },
        },
      });
  };
  const tint = saved
    ? colors.magenta
    : overlay
      ? colors.ink
      : colors.textSecondary;
  return (
    <PressableScale
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={(saved ? "Unsave " : "Save ") + shop.shop_name}
      accessibilityState={{ selected: saved, disabled: busy, busy }}
      onPress={change}
      config={{ minScale: reduced ? 1 : 0.88 }}
      animationConfig={{ duration: reduced ? 1 : 120 }}
      style={[styles.button, overlay && styles.overlay, style]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Ionicons
          name={saved ? "bookmark" : "bookmark-outline"}
          size={size}
          color={tint}
        />
      )}
    </PressableScale>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: { backgroundColor: colors.surface, borderRadius: 22 },
});
