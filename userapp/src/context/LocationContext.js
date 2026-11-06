import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { DEMO_MODE } from "../config/runtime";

const LocationContext = createContext(null);

// Set once the app has shown the OS permission prompt, so a customer who
// dismissed or denied it isn't asked again on every Home/Shops visit. If
// they later allow location in system settings, the permission CHECK below
// still picks that up - only the prompt itself is one-time.
const PROMPTED_KEY = "location_permission_prompted";

// A position this recent is good enough for "how far is each shop" and
// comes back instantly, without spinning up GPS.
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;
const FIX_TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("location timeout")), ms),
    ),
  ]);
}

// One shared, best-effort device location for every screen that sorts or
// labels shops by distance (Home, Shops, SelectShop, SavedShops).
//
// Screens call ensureLocation() on mount; it's safe to call from several
// at once (they share one in-flight request) and never throws. coords stays
// null whenever permission is denied or a fix can't be had - callers then
// just fetch without lat/lng, exactly as before this existed.
export function LocationProvider({ children }) {
  const [coords, setCoords] = useState(null); // { lat, lng } | null
  const [status, setStatus] = useState("unknown"); // "unknown" | "granted" | "denied" | "unavailable"
  const [areaLabel, setAreaLabel] = useState("");
  const inFlight = useRef(null);

  const ensureLocation = useCallback(({ userInitiated = false } = {}) => {
    if (DEMO_MODE && !userInitiated) return Promise.resolve(null);
    if (inFlight.current) return inFlight.current;

    inFlight.current = (async () => {
      try {
        setStatus("loading");
        let permission = await Location.getForegroundPermissionsAsync();

        if (permission.status !== "granted") {
          const alreadyPrompted =
            (await AsyncStorage.getItem(PROMPTED_KEY)) === "true";
          if ((alreadyPrompted && !userInitiated) || !permission.canAskAgain) {
            setStatus("denied");
            return null;
          }
          await AsyncStorage.setItem(PROMPTED_KEY, "true");
          permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== "granted") {
            setStatus("denied");
            return null;
          }
        }

        setStatus("granted");

        const position =
          (await Location.getLastKnownPositionAsync({
            maxAge: LAST_KNOWN_MAX_AGE_MS,
          })) ||
          (await withTimeout(
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            FIX_TIMEOUT_MS,
          ));

        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCoords(next);
        setStatus("granted");
        setAreaLabel("Your current location");
        try {
          const places = await withTimeout(
            Location.reverseGeocodeAsync({
              latitude: next.lat,
              longitude: next.lng,
            }),
            3000,
          );
          const place = places[0];
          if (place)
            setAreaLabel(
              [
                ...new Set(
                  [
                    place.district || place.subregion || place.name,
                    place.city || place.region,
                  ].filter(Boolean),
                ),
              ].join(", ") || "Your current location",
            );
        } catch {
          /* Distance still works if the device cannot resolve an area name. */
        }
        return next;
      } catch {
        // Location services off, timeout, etc. - fall back to no distance.
        setStatus("unavailable");
        return null;
      } finally {
        // Allow a later call (e.g. next visit) to try for a fresher fix.
        inFlight.current = null;
      }
    })();

    return inFlight.current;
  }, []);

  const value = useMemo(
    () => ({ coords, status, areaLabel, ensureLocation }),
    [coords, status, areaLabel, ensureLocation],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export const useLocation = () => useContext(LocationContext);

// Query params for the shop endpoints: lat/lng only when a fix exists.
export function geoParams(coords) {
  return coords ? { lat: coords.lat, lng: coords.lng } : {};
}
