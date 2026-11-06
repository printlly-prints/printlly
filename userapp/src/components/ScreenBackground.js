import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";
function ScreenBackground({ children }) {
  return <View style={styles.root}>{children}</View>;
}
export default memo(ScreenBackground);
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
