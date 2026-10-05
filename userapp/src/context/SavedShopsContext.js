import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";
import { geoParams, useLocation } from "./LocationContext";

const SavedShopsContext = createContext(null);

// Fetches the customer's saved shops once (on login / app load) and keeps
// them in memory, so every screen's heart icon reads from the same cache
// instead of each screen calling GET /saved-shops on its own.
//
// Entries are SavedShop docs with shop_id populated to the full shop
// object - the same shape GET /saved-shops returns - so isSaved/toggleSaved
// both key off entry.shop_id._id.
export function SavedShopsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  // Re-fetches once a location fix arrives, so saved shops pick up
  // distance_km. Never prompts for permission itself - Home/Shops do that.
  const { coords } = useLocation();
  const [savedShops, setSavedShops] = useState([]);
  const [loading, setLoading] = useState(true);

  // `silent` skips the loading flag, which SavedShopsScreen renders as a
  // pull-to-refresh spinner - the once-a-minute open/closed refresh there
  // shouldn't look like the customer pulled the list down.
  const load = useCallback(async ({ silent } = {}) => {
    if (!isAuthenticated) {
      setSavedShops([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get("/saved-shops", { params: geoParams(coords) });
      setSavedShops(data);
    } catch {
      // Leave whatever was already cached - a failed refresh shouldn't
      // blank out hearts that were already known to be filled.
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAuthenticated, coords]);

  useEffect(() => {
    load();
  }, [load]);

  const isSaved = useCallback(
    (shopId) => savedShops.some((entry) => entry.shop_id?._id === shopId),
    [savedShops]
  );

  // Flips the heart immediately and calls the matching endpoint; reverts
  // to the previous list if the call fails. A 409 (already saved) or 404
  // (already removed) on the way just means another device beat us to the
  // same state, so those resync from the server instead of reverting.
  const toggleSaved = useCallback(
    async (shop) => {
      const previous = savedShops;
      const currentlySaved = previous.some((entry) => entry.shop_id?._id === shop._id);

      if (currentlySaved) {
        setSavedShops(previous.filter((entry) => entry.shop_id?._id !== shop._id));
        try {
          await api.delete(`/saved-shops/${shop._id}`);
        } catch (err) {
          if (err.response?.status === 404) return;
          setSavedShops(previous);
        }
      } else {
        const optimisticEntry = { _id: `optimistic-${shop._id}`, shop_id: shop };
        setSavedShops([optimisticEntry, ...previous]);
        try {
          const { data } = await api.post("/saved-shops", { shop_id: shop._id });
          setSavedShops((current) =>
            current.map((entry) =>
              entry._id === optimisticEntry._id ? { ...data, shop_id: shop } : entry
            )
          );
        } catch (err) {
          if (err.response?.status === 409) {
            load();
            return;
          }
          setSavedShops(previous);
        }
      }
    },
    [savedShops, load]
  );

  // Memoized so a heart tap doesn't re-render every screen reading this
  // context via a new object identity alone. isSaved/toggleSaved/load are
  // already useCallback'd above, so these dependencies are stable except
  // when the data they close over actually changes.
  const value = useMemo(
    () => ({ savedShops, loading, isSaved, toggleSaved, refresh: load }),
    [savedShops, loading, isSaved, toggleSaved, load]
  );

  return <SavedShopsContext.Provider value={value}>{children}</SavedShopsContext.Provider>;
}

export const useSavedShops = () => useContext(SavedShopsContext);
