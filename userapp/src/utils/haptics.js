import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// Android's own confirm effect; the Vibrator-based notificationAsync is the
// fallback Expo recommends against there.
export function successHaptic() {
  if (Platform.OS === "web") return;
  const feedback =
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  feedback.catch(() => {});
}
