import { Image, Text, View, useWindowDimensions } from "react-native";
import { fonts, typography } from "../theme";
import { useTheme } from "../context/ThemeContext";
export default function LoginComposition() {
  const { width, fontScale } = useWindowDimensions();
  const { colors } = useTheme();
  const narrow = width < 360;
  const artSize = narrow ? 144 : 176;
  const largeText = fontScale > 1.3;
  return <View style={{ minHeight: largeText ? undefined : 262, marginBottom: 16 }}>
    <Text accessibilityRole="header" style={{ fontFamily: fonts.headingBold, fontSize: narrow ? 40 : 48, lineHeight: narrow ? 48 : 56, color: colors.textPrimary }}>Print it.{"\n"}Pick it.</Text>
    <Image source={require("../../assets/artwork/login_customer_mascot.png")} resizeMode="contain" accessible={false}
      style={largeText ? { width: artSize, height: artSize, alignSelf: "flex-end", marginTop: 16 } : { position: "absolute", width: artSize, height: artSize, right: 0, top: 82 }} />
    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: largeText ? 16 : 62, lineHeight: 18 }]}>PDFs + images{"\n"}Printed nearby.</Text>
  </View>;
}
