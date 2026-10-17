import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import tokens from "../../../shared/design-tokens.json";
import { nativeColorAliases, resolveAppearance, validAppearance } from "../theme/appearance";

const ThemeContext = createContext(null);
const STORAGE_KEY = "printlly:appearance";

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState("system");
  const [ready, setReady] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [error, setError] = useState("");
  // Static until the OS preference is known, avoiding a flash of motion.
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (active) setPreference(validAppearance(value));
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReducedMotion(value);
    }).catch(() => {}).finally(() => { if (active) setMotionReady(true); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const setAppearance = useCallback(async (value) => {
    const next = validAppearance(value);
    setPreference(next);
    setError("");
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
      return true;
    } catch {
      setError("Appearance could not be saved. Try again.");
      return false;
    }
  }, []);

  const mode = resolveAppearance(preference, systemScheme);
  const value = useMemo(() => ({
    mode, preference, ready, motionReady, error, reducedMotion, setAppearance,
    colors: nativeColorAliases(tokens.colors[mode], mode),
    tokens,
  }), [mode, preference, ready, motionReady, error, reducedMotion, setAppearance]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("Printlly components must be inside ThemeProvider.");
  return theme;
}

export function useThemedStyles(factory) {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [factory, theme]);
}
