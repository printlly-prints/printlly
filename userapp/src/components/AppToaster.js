import { Toaster } from "react-native-sonner";
import { useReducedMotion } from "react-native-reanimated";
import { colors, fonts, radius } from "../theme";
export default function AppToaster() {
  const reduced = useReducedMotion();
  return (
    <Toaster
      position="top-center"
      theme="light"
      visibleToasts={1}
      offset={{ top: 60, left: 16, right: 16 }}
      swipeToDismiss
      animation={
        reduced ? { duration: 1, exitDuration: 1, useSpring: false } : undefined
      }
      toastStyles={{
        container: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          shadowOpacity: 0,
          elevation: 0,
        },
        title: { fontFamily: fonts.headingBold, color: colors.ink },
        description: {
          fontFamily: fonts.bodyRegular,
          color: colors.textSecondary,
        },
        actionButton: { backgroundColor: colors.primaryWash },
        actionButtonText: { color: colors.primary },
      }}
    />
  );
}
