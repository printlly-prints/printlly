import ScreenFrame from "../components/ScreenFrame";
import RecoveryState from "../components/RecoveryState";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
export default function NotFoundScreen({ navigation }) {
  const { isAuthenticated } = useAuth();
  return <ScreenFrame title="Page not found" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} footer={<Button title="Go home" onPress={() => navigation.navigate(isAuthenticated ? "MainTabs" : "PhoneEntry", isAuthenticated ? { screen: "Home" } : undefined)} />}>
    <RecoveryState reaction="not_found" title="This page has moved." message="We couldn’t find the page you’re looking for. Let’s get you back to your prints." />
  </ScreenFrame>;
}
