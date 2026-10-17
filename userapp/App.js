import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import OpeningArtwork, { OpeningProvider, useOpening } from "./src/components/OpeningArtwork";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { AvatarProvider } from "./src/context/AvatarContext";
import { OrderDraftProvider } from "./src/context/OrderDraftContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { OpeningPreferencesProvider, useOpeningPreferences } from "./src/context/OpeningPreferencesContext";
import { prepareOpeningAudio, startOpeningAudio, stopOpeningAudio } from "./src/utils/openingAudio";
import { EventSoundsProvider } from "./src/context/EventSoundsContext";
import { SavedShopsProvider } from "./src/context/SavedShopsContext";
import { LocationProvider } from "./src/context/LocationContext";
import { NotificationsProvider, useNotifications } from "./src/context/NotificationsContext";
import { SupportProvider } from "./src/context/SupportContext";
import { OrderEventsProvider } from "./src/context/OrderEventsContext";
import PhoneEntryScreen from "./src/screens/PhoneEntryScreen";
import OtpScreen from "./src/screens/OtpScreen";
import AccountSetupScreen from "./src/screens/AccountSetupScreen";
import AuthUnavailableScreen from "./src/screens/AuthUnavailableScreen";
import SessionExpiredScreen from "./src/screens/SessionExpiredScreen";
import NotFoundScreen from "./src/screens/NotFoundScreen";
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
import { typography } from "./src/theme";

// Started at module scope, before any component mounts, so an event
// emitted during the first render is not dropped. A no-op when
// EXPO_PUBLIC_POSTHOG_KEY is unset - see src/lib/analytics.js.
initAnalytics();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Hand the native splash to the first logo layout, before network or session work.
SplashScreen.preventAutoHideAsync();

// The 4-tab home for a logged-in customer. Upload is deliberately not a
// tab - it's reached as a full-screen flow (pushed on the root stack
// below), started from Home's hero button or the Shops tab.
function MainTabs() {
  const { colors } = useTheme();
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
      <Tab.Screen name="Shops" component={ShopsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Orders" component={MyOrdersScreen} options={{ headerShown: false }} />
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
const openingClouds = [
  require('./assets/opening/cloud-265-479.png'),
  require('./assets/opening/cloud-265-482.png'),
  require('./assets/opening/cloud-265-485.png'),
];
function OpeningSurface({ resourcesReady }) {
  const { loading, isAuthenticated } = useAuth();
  const { colors, mode, ready, reducedMotion, motionReady } = useTheme();
  const { dismiss, uploadAvailable } = useOpening();
  const { ready: openingReady, enabled: openingEnabled } = useOpeningPreferences();
  const [audioReady, setAudioReady] = useState(false);
  const [phase, setPhase] = useState('logo');
  const [revealed, setRevealed] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);
  const [logoElapsed, setLogoElapsed] = useState(false);
  const [loadedClouds, setLoadedClouds] = useState({});
  const [assetError, setAssetError] = useState(false);
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (phase !== 'logo' || !openingReady || !motionReady) return;
    if (!openingEnabled || reducedMotion) { setAudioReady(true); return; }
    let active = true;
    setAudioReady(false);
    const timeout = setTimeout(() => { if (active) setAudioReady(true); }, 2000);
    prepareOpeningAudio().finally(() => {
      clearTimeout(timeout);
      if (active) setAudioReady(true);
    });
    return () => { active = false; clearTimeout(timeout); };
  }, [phase, openingReady, openingEnabled, motionReady, reducedMotion]);
  useEffect(() => {
    if (phase === 'home' || !openingEnabled || reducedMotion || (phase === 'motion' && isAuthenticated && !uploadAvailable)) stopOpeningAudio();
  }, [phase, openingEnabled, reducedMotion, isAuthenticated, uploadAvailable]);
  useEffect(() => () => stopOpeningAudio(), []);
  useEffect(() => {
    if (!logoVisible) return;
    const timer = setTimeout(() => setLogoElapsed(true), 1000);
    return () => clearTimeout(timer);
  }, [logoVisible]);
  useEffect(() => {
    if (phase !== 'logo' || !logoElapsed || !resourcesReady || !ready || !motionReady || !openingReady || !audioReady || loading) return;
    if (openingEnabled && !reducedMotion && !assetError && Object.keys(loadedClouds).length !== openingClouds.length) return;
    setPhase(!openingEnabled || reducedMotion || assetError ? 'home' : 'motion');
  }, [phase, logoElapsed, resourcesReady, ready, motionReady, loading, reducedMotion, loadedClouds, assetError, openingReady, openingEnabled, audioReady]);
  useEffect(() => {
    if (phase === 'motion' && (reducedMotion || !openingEnabled)) { dismiss(); setPhase('home'); }
  }, [phase, reducedMotion, openingEnabled, dismiss]);
  const appReady = resourcesReady && ready && motionReady && !loading;
  const appVisible = phase === 'home' || revealed;
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <View style={{ flex: 1 }} pointerEvents={appVisible ? 'auto' : 'none'}
      onTouchStart={() => { if (revealed && phase !== 'home') { dismiss(); setPhase('home'); } }}
      accessibilityElementsHidden={!appVisible} importantForAccessibility={appVisible ? 'auto' : 'no-hide-descendants'}>
      {appReady ? <RootNavigator /> : null}
    </View>
    {phase !== 'home' ? <View pointerEvents={revealed ? 'none' : 'auto'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
      backgroundColor: phase === 'logo' ? '#311434' : revealed ? 'transparent' : colors.canvas }}
      onLayout={event => { setSize(event.nativeEvent.layout); SplashScreen.hideAsync().catch(() => {}); }}>
      <StatusBar style={phase === 'logo' || mode === 'dark' ? 'light' : 'dark'} />
      {phase === 'logo' ? <>
        <Image source={require('./assets/printlly-folded-emblem.png')} accessibilityLabel="Printlly" resizeMode="contain"
          onLoad={() => setLogoVisible(true)} onError={() => { setLogoVisible(true); setAssetError(true); }}
          style={{ width: 160, height: 160, position: 'absolute', alignSelf: 'center', top: '38%' }} />
        {openingClouds.map((source, index) => <Image key={index} source={source} fadeDuration={0}
          onLoad={() => setLoadedClouds(previous => ({ ...previous, [index]: true }))}
          onError={() => setAssetError(true)}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />)}
      </> : size ? <OpeningArtwork width={size.width} height={size.height} mode={mode} signedOut={!isAuthenticated}
        showPaper={!isAuthenticated || uploadAvailable}
        onStart={() => { if (openingEnabled && !reducedMotion && (!isAuthenticated || uploadAvailable)) startOpeningAudio(); }}
        onReveal={() => setRevealed(true)} onComplete={() => { dismiss(); setPhase('home'); }} /> : null}
    </View> : null}
  </View>;
}

function RootNavigator() {
  const { colors } = useTheme();
  const { isAuthenticated, loading, sessionExpired } = useAuth();

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
      {sessionExpired ? (
        <Stack.Screen name="SessionExpired" component={SessionExpiredScreen} options={{ headerShown: false }} />
      ) : !isAuthenticated ? (
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
            <Stack.Screen name="Otp" component={OtpScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="AccountSetup"
              component={AccountSetupScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="SignInHelp" component={AuthUnavailableScreen} options={{ headerShown: false }} />
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
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PrintPreferences"
            component={PrintPreferencesScreen}
            options={{ headerShown: false }}
          />
          {/* Only reached from the "Print here" entry path - see
              PrintPreferencesScreen's handleContinue. The generic upload
              flow has no shop to offer and skips straight to SelectShop. */}
          <Stack.Screen
            name="ChooseShopOption"
            component={ChooseShopOptionScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="SelectShop" component={SelectShopScreen} options={{ headerShown: false }} />
          {/* Cart -> Checkout -> Payment -> Order placed, matching the
              reference flow. ReviewCheckout is the cart; Checkout is the
              new step that collects fulfilment, shop, contact and
              payment method before the order is created. */}
          <Stack.Screen
            name="ReviewCheckout"
            component={ReviewCheckoutScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: false }} />
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
              headerShown: false,
              title: "Order",
              // No back button only right after paying (navigation.replace
              // from Payment) - reached any other way, back works normally.
              headerBackVisible: !route.params?.justPlaced,
            })}
          />
          <Stack.Screen name="PickupOtp" component={PickupOtpScreen} options={{ headerShown: false }} />

          <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SavedShops" component={SavedShopsScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false }}
          />

          {/* Support: the FAQ/contact screen, and the live chat it leads
              to. Chat is also reached directly from an order's "Need help
              with this order?" button, which passes an orderContext param. */}
          <Stack.Screen
            name="HelpSupport"
            component={HelpSupportScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
        </>
      )}
      <Stack.Screen name="NotFound" component={NotFoundScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return <ThemeProvider><OpeningPreferencesProvider><AppContent /></OpeningPreferencesProvider></ThemeProvider>;
}

function AppContent() {
  const { colors, mode } = useTheme();
  // Keys here must match theme/typography.js's `fonts` constants exactly,
  // or React Native falls back to the system font without warning.
  const [fontsLoaded, fontError] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
  });


  return (
    // Keep safe-area context available to the recovery screen even when
    // an application provider fails during initialization.
    <SafeAreaProvider>
    <ErrorBoundary>
      <AuthProvider>
        <OrderDraftProvider>
        <EventSoundsProvider>
        <AvatarProvider>
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
                <NavigationContainer theme={{ dark: mode === "dark", colors: { primary: colors.action, background: colors.canvas, card: colors.surface, text: colors.textPrimary, border: colors.divider, notification: colors.error }, fonts: { regular: { fontFamily: "Inter_400Regular", fontWeight: "400" }, medium: { fontFamily: "Inter_500Medium", fontWeight: "500" }, bold: { fontFamily: "Manrope_700Bold", fontWeight: "700" }, heavy: { fontFamily: "Manrope_800ExtraBold", fontWeight: "800" } } }}>
                  <StatusBar style={mode === "dark" ? "light" : "dark"} />
                  <OpeningProvider>
                    <OpeningSurface resourcesReady={Boolean(fontsLoaded || fontError)} />
                  </OpeningProvider>
                </NavigationContainer>
              </SupportProvider>
              </OrderEventsProvider>
            </NotificationsProvider>
          </SavedShopsProvider>
        </LocationProvider>
        </AvatarProvider>
        </EventSoundsProvider>
        </OrderDraftProvider>
      </AuthProvider>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}
