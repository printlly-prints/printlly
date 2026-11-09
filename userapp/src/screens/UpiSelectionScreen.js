import { useState } from "react";
import {
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import UpiOptions from "../components/UpiOptions";
import { formatRupees } from "../components/PriceBreakdown";
import { upiOption } from "../utils/upiPayments";
import { colors, typography, spacing, radius } from "../theme";

export default function UpiSelectionScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState(
    upiOption(route.params?.selected).key,
  );
  const overlay = Platform.OS !== "ios";
  const close = () => navigation.goBack();
  // With an amount, confirming here is the payment step, not just a choice.
  const amount = route.params?.amount;
  const apply = () =>
    navigation.popTo(
      route.params.returnTo === "Payment" ? "Payment" : "Checkout",
      {
        upiApp: selected,
        ...(amount !== undefined ? { payRequest: Date.now() } : {}),
      },
      { merge: true },
    );
  const optionName =
    selected === "qr"
      ? "UPI QR"
      : selected === "other"
        ? "another UPI app"
        : upiOption(selected).title;
  const content = (
    <View style={[styles.screen, overlay && styles.overlayScreen]}>
      {overlay ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Dismiss UPI options"
        />
      ) : null}
      <View
        style={overlay ? styles.overlayPanel : styles.panel}
        accessibilityViewIsModal
        accessibilityLabel="Choose UPI app"
      >
        <View style={styles.header}>
          <Ionicons name="wallet-outline" size={22} color={colors.primary} />
          <Text accessibilityRole="header" style={styles.title}>
            UPI
          </Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close UPI options"
            style={styles.close}
          >
            <Ionicons name="close" size={23} color={colors.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <UpiOptions
            value={selected}
            onChange={setSelected}
            showHeading={false}
          />
        </ScrollView>
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          <Button
            title={
              amount !== undefined
                ? `Pay ${formatRupees(amount)} with ${optionName}`
                : `Use ${optionName}`
            }
            onPress={apply}
          />
        </View>
      </View>
    </View>
  );
  // Android's transparentModal route is already the overlay, and Button's
  // gestures don't receive touches inside a React Native Modal there.
  return Platform.OS === "web" ? (
    <Modal
      visible
      transparent
      onRequestClose={close}
      animationType={reduced ? "none" : "fade"}
    >
      {content}
    </Modal>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  overlayScreen: {
    backgroundColor: "rgba(26,26,26,0.28)",
    justifyContent: "flex-end",
  },
  panel: { flex: 1, backgroundColor: colors.background },
  overlayPanel: {
    flexShrink: 0,
    backgroundColor: colors.background,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    height: "75%",
    maxHeight: "90%",
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.sm,
  },
  title: { ...typography.h3, flex: 1, color: colors.ink },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: spacing.lg, paddingTop: spacing.sm },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
