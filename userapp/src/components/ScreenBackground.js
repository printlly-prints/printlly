import { View } from "react-native";
import { useTheme } from "../context/ThemeContext";
export default function ScreenBackground({ children }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>{children}</View>;
}
