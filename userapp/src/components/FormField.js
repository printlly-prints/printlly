import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { typography, radius } from "../theme";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
export default function FormField({ label, prefix, error, hint, disabled, inputStyle, ...props }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputRow, focused && styles.focused, error && styles.errorBorder, disabled && styles.unavailable]}>
      {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <TextInput {...props} editable={!disabled} accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} placeholderTextColor={colors.textMuted} selectionColor={colors.action} style={[styles.input, inputStyle]} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
    </View>
    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
}
const createStyles = ({ colors }) => ({
  field: { gap: 8 }, label: { ...typography.label, color: colors.textPrimary }, inputRow: { flexDirection: "row", alignItems: "center", minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface, borderRadius: radius.control, paddingHorizontal: 16 },
  prefix: { ...typography.body, color: colors.textPrimary, marginRight: 8 }, input: { ...typography.body, color: colors.textPrimary, flex: 1, minWidth: 0, minHeight: 50, paddingVertical: 12 }, focused: { borderColor: colors.focus, borderWidth: 2 }, errorBorder: { borderColor: colors.error }, unavailable: { backgroundColor: colors.subtle }, hint: { ...typography.caption, color: colors.textSecondary }, error: { ...typography.bodySmall, color: colors.error },
});
