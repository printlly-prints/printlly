import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import MascotReaction from "./MascotReaction";
import Button from "./Button";
import { typography } from "../theme";
import { useThemedStyles } from "../context/ThemeContext";

// Figma status row: compact art attached to its heading, never a hero banner.
// Full-screen callers place actions in ScreenFrame.footer when appropriate.
export default function RecoveryState({ reaction, title, message, primaryLabel, onPrimary, secondaryLabel, onSecondary, loading = false, compact = false, children, style, retryAfterSeconds = 0, retryKey, actionsOnly = false }) {
  const styles = useThemedStyles(createStyles);
  const [remaining, setRemaining] = useState(retryAfterSeconds);
  useEffect(() => {
    const deadline = Date.now() + Math.max(0, retryAfterSeconds) * 1000;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    if (!retryAfterSeconds) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [retryAfterSeconds, retryKey]);
  return <View style={[styles.state, compact && styles.compact, style]}>
    {!actionsOnly ? <View style={styles.heading}><MascotReaction reaction={reaction} /><Text accessibilityRole="header" style={styles.title}>{title}</Text></View> : null}
    {!actionsOnly && message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
    {children}
    {primaryLabel && onPrimary ? <Button title={remaining > 0 ? `Try again in ${remaining}s` : primaryLabel} onPress={onPrimary} loading={loading} disabled={remaining > 0} /> : null}
    {secondaryLabel && onSecondary ? <Button title={secondaryLabel} onPress={onSecondary} variant="secondary" disabled={loading} /> : null}
  </View>;
}
const createStyles = ({ colors }) => ({
  state: { gap: 16, paddingTop: 20, marginBottom: 16 }, compact: { paddingTop: 0 },
  heading: { flexDirection: "row", alignItems: "center", gap: 16 },
  title: { ...typography.h3, fontSize: 22, lineHeight: 30, color: colors.textPrimary, flex: 1, flexShrink: 1 },
  message: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 23 },
});
