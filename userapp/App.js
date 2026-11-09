import AppHeader from "./src/components/AppHeader";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AppToaster from "./src/components/AppToaster";
import { useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DEMO_MODE } from "./src/config/runtime";
import DemoWelcomeScreen from "./src/screens/DemoWelcomeScreen";
import DemoPaymentScreen from "./src/screens/DemoPaymentScreen";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { SavedShopsProvider } from "./src/context/SavedShopsContext";
import { LocationProvider } from "./src/context/LocationContext";
import { NotificationsProvider } from "./src/context/NotificationsContext";
import { SupportProvider } from "./src/context/SupportContext";
import { OrderEventsProvider } from "./src/context/OrderEventsContext";
import AuthScreen from "./src/screens/AuthScreen";
import ShopsScreen from "./src/screens/ShopsScreen";
import ShopDetailsScreen from "./src/screens/ShopDetailsScreen";
import MyOrdersScreen from "./src/screens/MyOrdersScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import UploadDocumentsScreen from "./src/screens/UploadDocumentsScreen";
import PrintPreferencesScreen from "./src/screens/PrintPreferencesScreen";
import SelectShopScreen from "./src/screens/SelectShopScreen";
import ChooseShopOptionScreen from "./src/screens/ChooseShopOptionScreen";
import ReviewCheckoutScreen from "./src/screens/ReviewCheckoutScreen";
import CheckoutScreen from "./src/screens/CheckoutScreen";
import UpiSelectionScreen from "./src/screens/UpiSelectionScreen";
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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Branch = createNativeStackNavigator();
const nativeHeader = {
  headerStyle: { backgroundColor: colors.background },
  headerTitleStyle: { ...typography.h3, color: colors.ink },
  headerTintColor: colors.primary,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

// Keeps the native splash screen up until useFonts (below) resolves.
SplashScreen.preventAutoHideAsync();

// Each tab owns its history. Shared task screens push above the tabs and return to their origin.
function ShopsNavigation() {
  return (
    <Branch.Navigator screenOptions={nativeHeader}>
      <Branch.Screen
        name="ShopList"
        component={ShopsScreen}
        options={({ navigation }) => ({
          title: "Shops",
          header: (props) => (
            <AppHeader
              {...props}
              title="Shops"
              accessory={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Saved shops"
                  onPress={() => navigation.navigate("SavedShops")}
                  style={{
                    minWidth: 76,
                    height: 44,
                    flexDirection: "row",
                    gap: 6,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="bookmark-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text
                    style={{ ...typography.labelSmall, color: colors.primary }}
                  >
                    Saved
                  </Text>
                </Pressable>
              }
            />
          ),
        })}
      />
      <Branch.Screen
        name="SavedShops"
        component={SavedShopsScreen}
        options={{ title: "Saved shops" }}
      />
      <Branch.Screen
        name="ShopDetails"
        component={ShopDetailsScreen}
        options={{ headerShown: false }}
      />
    </Branch.Navigator>
  );
}
function OrdersNavigation() {
  return (
    <Branch.Navigator screenOptions={nativeHeader}>
      <Branch.Screen
        name="OrderList"
        component={MyOrdersScreen}
        options={{
          title: "Orders",
          header: (props) => <AppHeader {...props} title="Orders" />,
        }}
      />
      <Branch.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{ title: "Order" }}
      />
      <Branch.Screen
        name="PickupOtp"
        component={PickupOtpScreen}
        options={{ title: "Pickup code" }}
      />
      <Branch.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: "Order support" }}
      />
    </Branch.Navigator>
  );
}
function ProfileNavigation() {
  return (
    <Branch.Navigator screenOptions={nativeHeader}>
      <Branch.Screen
        name="Account"
        component={ProfileScreen}
        options={{
          title: "You",
          header: (props) => <AppHeader {...props} title="You" />,
        }}
      />
      <Branch.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: "Edit profile", presentation: "modal" }}
      />
      <Branch.Screen
        name="PrintDefaults"
        component={EditProfileScreen}
        options={{ title: "Print preferences", presentation: "modal" }}
      />

      <Branch.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings & privacy" }}
      />
      <Branch.Screen
        name="HelpSupport"
        component={HelpSupportScreen}
        options={{ title: "Help & support" }}
      />
      <Branch.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: "Support" }}
      />
    </Branch.Navigator>
  );
}
function PrintFlowNavigation() {
  return (
    <Branch.Navigator
      screenOptions={({ navigation }) => ({
        ...nativeHeader,
        ...(navigation.getState().index === 0
          ? {
              headerLeft: () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close print setup"
                  onPress={() => navigation.getParent()?.goBack()}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="close" size={24} color={colors.primary} />
                </Pressable>
              ),
            }
          : {}),
      })}
    >
      <Branch.Screen
        name="UploadDocuments"
        component={UploadDocumentsScreen}
        options={{ title: "Add documents" }}
      />
      <Branch.Screen
        name="PrintPreferences"
        component={PrintPreferencesScreen}
        options={{ title: "Print settings" }}
      />
      <Branch.Screen
        name="ChooseShopOption"
        component={ChooseShopOptionScreen}
        options={{ title: "Order options" }}
      />
      <Branch.Screen
        name="SelectShop"
        component={SelectShopScreen}
        options={{ title: "Select shop" }}
      />
      <Branch.Screen
        name="ReviewCheckout"
        component={ReviewCheckoutScreen}
        options={{ title: "Review print" }}
      />
      <Branch.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: "Checkout" }}
      />
      <Branch.Screen
        name="Payment"
        component={DEMO_MODE ? DemoPaymentScreen : PaymentScreen}
        options={{ title: "Payment" }}
      />
      <Branch.Screen
        name="UpiSelection"
        component={UpiSelectionScreen}
        options={{
          headerShown: false,
          presentation:
            Platform.OS === "web" ? "transparentModal" : "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </Branch.Navigator>
  );
}
function MainTabs({ route }) {
  return (
    <Tab.Navigator
      backBehavior="history"
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: "none" }}
    >
      <Tab.Screen
        name="Home"
        options={{
          title: "Print",
          headerShown: true,
          header: (props) => <AppHeader {...props} />,
        }}
      >
        {(props) => (
          <UploadDocumentsScreen
            {...props}
            completedOrderId={route.params?.completedOrderId}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Shops" component={ShopsNavigation} />
      <Tab.Screen name="Orders" component={OrdersNavigation} />
      <Tab.Screen name="Profile" component={ProfileNavigation} />
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
      trackEvent(EVENTS.APP_OPENED, {
        role: isAuthenticated ? "customer" : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Restoring the stored session - keep the same branded screen up
  // rather than swapping to a bare spinner for a frame.
  if (loading) {
    return <BrandSplash />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator id="Root" screenOptions={nativeHeader}>
        {!isAuthenticated ? (
          <Stack.Screen
            name="SignIn"
            component={DEMO_MODE ? DemoWelcomeScreen : AuthScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />

            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ title: "Notifications", presentation: "modal" }}
            />
            <Stack.Screen
              name="PrintFlow"
              component={PrintFlowNavigation}
              options={{ headerShown: false, presentation: "fullScreenModal" }}
            />
            <Stack.Screen
              name="OrderPlaced"
              component={OrderPlacedScreen}
              options={{ headerShown: false }}
            />
            {/* Contextual details opened from notifications or the completed print task. */}
            <Stack.Screen
              name="OrderTracking"
              component={OrderTrackingScreen}
              options={{ title: "Order", presentation: "modal" }}
            />
            <Stack.Screen
              name="PickupOtp"
              component={PickupOtpScreen}
              options={{ title: "Pickup code", presentation: "modal" }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ title: "Paprout support", presentation: "modal" }}
            />
          </>
        )}
      </Stack.Navigator>
    </View>
  );
}

export default function App() {
  // Keys here must match theme/typography.js's `fonts` constants exactly,
  // or React Native falls back to the system font without warning.
  const [fontsLoaded, fontError] = useFonts({
    Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
    Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    Inter_500Medium: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
  });

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

  return (
    // Outermost, outside every provider: a throw while AuthProvider,
    // LocationProvider or any other context initialises would otherwise
    // unmount the root view and leave a blank screen with no way out but
    // force-quitting the app. See src/components/ErrorBoundary.js.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider
          style={{
            flex: 1,
            width: "100%",
            alignSelf: "center",
            ...(Platform.OS === "web" ? { maxWidth: 430 } : {}),
          }}
        >
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
                      <NavigationContainer
                        theme={{
                          ...DefaultTheme,
                          colors: {
                            ...DefaultTheme.colors,
                            primary: colors.primary,
                            background: colors.background,
                            card: colors.surface,
                            text: colors.textPrimary,
                            border: colors.border,
                            notification: colors.magenta,
                          },
                        }}
                      >
                        <StatusBar style="dark" />
                        <RootNavigator />
                        <AppToaster />
                      </NavigationContainer>
                    </SupportProvider>
                  </OrderEventsProvider>
                </NotificationsProvider>
              </SavedShopsProvider>
            </LocationProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
