import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme';
// Auth restoration fallback only. The launch scene overlays the resolved destination.
export default function BrandSplash() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', gap: 16 }}><ActivityIndicator color={colors.action} /><Text style={[typography.bodySmall, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">Opening Printlly…</Text></View>;
}
