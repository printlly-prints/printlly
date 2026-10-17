import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import tokens from "../../../shared/design-tokens.json";

const ThemeContext = createContext(null);
const STORAGE_KEY = "printlly.appearance";
const choices = ["system", "light", "dark"];

function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return choices.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    for (const [name, hex] of Object.entries(tokens.colors[theme])) {
      root.style.setProperty(`--color-${name}`, hex);
      const rgb = hex.replace("#", "").match(/.{2}/g)?.map((part) => parseInt(part, 16));
      if (rgb?.length === 3) root.style.setProperty(`--rgb-${name}`, rgb.join(" "));
    }
    try { localStorage.setItem(STORAGE_KEY, preference); } catch { /* Session appearance still works. */ }
  }, [theme, preference]);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function AppearanceControl({ className = "" }) {
  const { preference, setPreference } = useTheme();
  return (
    <label className={`appearance-control ${className}`}>
      <span className="sr-only">Appearance</span>
      <select aria-label="Appearance" value={preference} onChange={(event) => setPreference(event.target.value)}>
        <option value="system">System theme</option>
        <option value="light">Light theme</option>
        <option value="dark">Dark theme</option>
      </select>
    </label>
  );
}
