import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { SavedShopsProvider } from "./src/context/SavedShopsContext";
import { LocationProvider } from "./src/context/LocationContext";
import { NotificationsProvider, useNotifications } from "./src/context/NotificationsContext";
import { SupportProvider } from "./src/context/SupportContext";
import { OrderEventsProvider } from "./src/context/OrderEventsContext";
import PhoneEntryScreen from "./src/screens/PhoneEntryScreen";
import OtpScreen from "./src/screens/OtpScreen";
import AccountSetupScreen from "./src/screens/AccountSetupScreen";
import AuthUnavailableScreen from "./src/screens/AuthUnavailableScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ShopsScreen from "./src/screens/ShopsScreen";
import ShopDetailsScreen from "./src/screens/ShopDetailsScreen";
import MyOrdersScreen from "./src/screens/MyOrdersScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import UploadDocumentsScreen from "./src/screens/UploadDocumentsScreen";
import PrintPreferencesScreen from "./src/screens/PrintPreferencesScreen";
import SelectShopScreen from "./src/screens/SelectShopScreen";
import ChooseShopOptionScreen from "./src/screens/ChooseShopOptionScreen";
import ReviewCheckoutScreen from "./src/screens/ReviewCheckoutScreen";
import CheckoutScreen from "./src/screens/CheckoutScreen";
import OrderPlacedScreen from "./src/screens/OrderPlacedScreen";
import PaymentScreen from "./src/screens/PaymentScreen";
import OrderTrackingScreen from "./src/screens/OrderTrackingScreen";
import PickupOtpScreen from "./src/screens/PickupOtpScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SavedShopsScreen from "./src/screens/SavedShopsScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import HelpSupportScreen from "./src/screens/HelpSupportScreen";
import ChatScreen from "./src/screens/ChatScreen";
import BrandSplash from "./src/screens/BrandSplash";
import BottomTabBar from "./src/components/BottomTabBar";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { initAnalytics, trackEvent, EVENTS } from "./src/lib/analytics";
import { colors, typography } from "./src/theme";

// Started at module scope, before any component mounts, so an event
// emitted during the first render is not dropped. A no-op when
// EXPO_PUBLIC_POSTHOG_KEY is unset - see src/lib/analytics.js.
initAnalytics();

// How long the branded splash stays up at minimum. Fonts and the stored
// session usually resolve in well under this, so without a floor the
// splash would flash past too fast to read.
const MIN_SPLASH_MS = 1800;

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Keeps the native splash screen up until useFonts (below) resolves.
SplashScreen.preventAutoHideAsync();

// The 4-tab home for a logged-in customer. Upload is deliberately not a
// tab - it's reached as a full-screen flow (pushed on the root stack
// below), started from Home's hero button or the Shops tab.
function MainTabs() {
  const { unreadCount } = useNotifications();

  return (
    <Tab.Navigator
      // The bar draws itself - icons, labels, the active pill and the
      // safe-area inset all live in BottomTabBar.js. The stock bar's
      // tabBarIcon/tabBarLabelStyle options are gone with it: the label
      // style was 12.5px text on an 18px line, which is what overflowed
      // the row it was given and clipped the labels.
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { ...typography.h3, color: colors.textPrimary },
        headerTintColor: colors.textPrimary,
      }}
    >
      {/* Home and Profile build their own in-content header (greeting /
          avatar block), so the native stack header is hidden for them. */}
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Shops" component={ShopsScreen} options={{ title: "Print Shops" }} />
      <Tab.Screen name="Orders" component={MyOrdersScreen} options={{ title: "My Orders" }} />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false, tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
    </Tab.Navigator>
  );
}

// Chooses between the auth stack and the main app stack based on whether
// a JWT is present. Switching happens automatically when AuthContext
// updates, so screens never navigate to login by hand.
function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();

  // One app_opened per launch, emitted once the stored session has resolved
  // so the event can say whether this was a signed-in customer returning or
  // a first look. Deliberately not in a screen: every screen mounts and
  // unmounts as the customer navigates, and this must fire exactly once.
  useEffect(() => {
    if (!loading) {
      trackEvent(EVENTS.APP_OPENED, { role: isAuthenticated ? "customer" : undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Restoring the stored session - keep the same branded screen up
  // rather than swapping to a bare spinner for a frame.
  if (loading) {
    return <BrandSplash />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { ...typography.h3, color: colors.textPrimary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {!isAuthenticated ? (
        // The demo phone-login flow (PhoneEntry -> Otp -> AccountSetup,
        // see constants/demoAuth.js) only exists in development - __DEV__
        // is false in every built binary, dev/preview/production EAS
        // profile alike (this project has no eas.json build-profile env
        // vars yet to distinguish them more finely; see demoAuth.js's own
        // comment on upgrading this check if one is added). Any such
        // build gets AuthUnavailableScreen instead - registered under the
        // same "PhoneEntry" route name since nothing else navigates to it
        // by name, so there's only ever one branch's worth of route names
        // to keep in sync. Otp/AccountSetup aren't registered at all in
        // that case, so there's no route left for anything to reach even
        // by name.
        __DEV__ ? (
          <>
            <Stack.Screen
              name="PhoneEntry"
              component={PhoneEntryScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="Otp" component={OtpScreen} options={{ title: "Verify" }} />
            <Stack.Screen
              name="AccountSetup"
              component={AccountSetupScreen}
              options={{ title: "Set up account", headerBackVisible: false }}
            />
          </>
        ) : (
          <Stack.Screen
            name="PhoneEntry"
            component={AuthUnavailableScreen}
            options={{ headerShown: false }}
          />
        )
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />

          {/* Order flow: Upload -> Preferences -> Select shop -> Review & pay -> Payment */}
          {/* The step between a shop card and the upload flow: a customer
              can read a shop's rates, address and hours before choosing
              it. "Print here" there continues into UploadDocuments with
              the same preselectedShop param the cards used to pass. */}
          <Stack.Screen
            name="ShopDetails"
            component={ShopDetailsScreen}
            // No native header: the shop's photograph runs to the very top
            // of the screen, and the back button and heart float over it
            // (see ShopDetailsScreen, which handles the top safe-area
            // inset itself).
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="UploadDocuments"
            component={UploadDocumentsScreen}
            options={{ title: "Add documents" }}
          />
          <Stack.Screen
            name="PrintPreferences"
            component={PrintPreferencesScreen}
            options={{ title: "Preferences" }}
          />
          {/* Only reached from the "Print here" entry path - see
              PrintPreferencesScreen's handleContinue. The generic upload
              flow has no shop to offer and skips straight to SelectShop. */}
          <Stack.Screen
            name="ChooseShopOption"
            component={ChooseShopOptionScreen}
            options={{ title: "Order options" }}
          />
          <Stack.Screen name="SelectShop" component={SelectShopScreen} options={{ title: "Select shop" }} />
          {/* Cart -> Checkout -> Payment -> Order placed, matching the
              reference flow. ReviewCheckout is the cart; Checkout is the
              new step that collects fulfilment, shop, contact and
              payment method before the order is created. */}
          <Stack.Screen
            name="ReviewCheckout"
            component={ReviewCheckoutScreen}
            options={{ title: "Your cart" }}
          />
          <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
          <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: "Payment" }} />
          {/* No back button: the whole checkout stack is cleared by the
              reset in PaymentScreen once payment is verified, so there is
              nothing behind this but Home. */}
          <Stack.Screen
            name="OrderPlaced"
            component={OrderPlacedScreen}
            options={{ headerShown: false }}
          />

          {/* Post-purchase: tracking, and the dedicated pickup-OTP screen */}
          <Stack.Screen
            name="OrderTracking"
            component={OrderTrackingScreen}
            options={({ route }) => ({
              title: "Order",
              // No back button only right after paying (navigation.replace
              // from Payment) - reached any other way, back works normally.
              headerBackVisible: !route.params?.justPlaced,
            })}
          />
          <Stack.Screen name="PickupOtp" component={PickupOtpScreen} options={{ title: "Pickup" }} />

          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
          <Stack.Screen name="SavedShops" component={SavedShopsScreen} options={{ title: "Saved Shops" }} />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ title: "Notifications" }}
          />

          {/* Support: the FAQ/contact screen, and the live chat it leads
              to. Chat is also reached directly from an order's "Need help
              with this order?" button, which passes an orderContext param. */}
          <Stack.Screen
            name="HelpSupport"
            component={HelpSupportScreen}
            options={{ title: "Help & Support" }}
          />
          <Stack.Screen name="Chat" component={ChatScreen} options={{ title: "Support chat" }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  // Keys here must match theme/typography.js's `fonts` constants exactly,
  // or React Native falls back to the system font without warning.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
  });

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // Hand off from the native splash to BrandSplash as soon as the fonts
  // are ready - BrandSplash uses them, so showing it earlier would render
  // the system font for a frame and then reflow.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (!minTimeElapsed) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <BrandSplash />
      </SafeAreaProvider>
    );
  }

  return (
    // Outermost, outside every provider: a throw while AuthProvider,
    // LocationProvider or any other context initialises would otherwise
    // unmount the root view and leave a blank screen with no way out but
    // force-quitting the app. See src/components/ErrorBoundary.js.
    <ErrorBoundary>
    <SafeAreaProvider>
      <AuthProvider>
        {/* Above SavedShopsProvider, which reads coords to fetch distances. */}
        <LocationProvider>
          <SavedShopsProvider>
            <NotificationsProvider>
              {/* Owns the one support socket for the whole app, so an
                  admin reply lights Profile's unread dot wherever the
                  customer happens to be. Inside AuthProvider because it
                  connects with the stored JWT and tears down on logout. */}
              <OrderEventsProvider>
              <SupportProvider>
                <NavigationContainer>
                  <StatusBar style="light" />
                  <RootNavigator />
                </NavigationContainer>
              </SupportProvider>
              </OrderEventsProvider>
            </NotificationsProvider>
          </SavedShopsProvider>
        </LocationProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}
