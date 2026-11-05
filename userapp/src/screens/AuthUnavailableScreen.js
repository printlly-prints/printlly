import { Text } from "react-native";
import ScreenFrame from "../components/ScreenFrame";
import Button from "../components/Button";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme";
export default function AuthUnavailableScreen({ navigation }) {
  const { colors } = useTheme(), canGoBack = navigation?.canGoBack();
  return <ScreenFrame title="Sign-in help" onBack={canGoBack ? () => navigation.goBack() : undefined}
    footer={canGoBack ? <Button title="Back to sign-in" onPress={() => navigation.goBack()} /> : undefined}>
    <Text style={[typography.h1, { color: colors.textPrimary, marginBottom: 16 }]}>Sign-in unavailable</Text>
    <Text style={[typography.body, { color: colors.textSecondary }]}>Phone sign-in has not been enabled for this build.</Text>
    {__DEV__ ? <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 16 }]}>The development preview uses code 123. It does not send a text message or verify your phone number.</Text> : null}
  </ScreenFrame>;
}
