import Constants from "expo-constants";
import { Platform } from "react-native";
export const GOOGLE_SIGN_IN_AVAILABLE =
  Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) &&
  Constants.executionEnvironment !== "storeClient" &&
  Platform.OS !== "web";

export async function googleIdToken() {
  if (!GOOGLE_SIGN_IN_AVAILABLE)
    throw new Error(
      "Google sign-in is not available in this build. Please sign in with email.",
    );
  // Expo Go has no Google native module; load it only in a configured native build.
  const {
    GoogleSignin,
    isSuccessResponse,
  } = require("@react-native-google-signin/google-signin");
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  if (!response.data.idToken)
    throw new Error("Google could not complete sign-in. Please try again.");
  return response.data.idToken;
}
