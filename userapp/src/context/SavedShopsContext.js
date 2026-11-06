import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";
import { geoParams, useLocation } from "./LocationContext";
const SavedShopsContext = createContext(null);
export function SavedShopsProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const { coords } = useLocation();
  const [savedShops, setSavedShops] = useState([]),
    [loading, setLoading] = useState(true);
  const pending = useRef(new Set()),
    session = useRef(0),
    requestId = useRef(0);
  useEffect(() => {
    session.current++;
    pending.current.clear();
  }, [isAuthenticated, user?._id]);
  const load = useCallback(
    async ({ silent } = {}) => {
      if (pending.current.size > 0) return;
      const request = ++requestId.current,
        epoch = session.current;
      if (!isAuthenticated) {
        setSavedShops([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const { data } = await api.get("/saved-shops", {
          params: geoParams(coords),
        });
        if (request === requestId.current && epoch === session.current)
          setSavedShops(data);
      } catch {
        /* Keep known saved shops when a refresh fails. */
      } finally {
        if (request === requestId.current && epoch === session.current)
          setLoading(false);
      }
    },
    [isAuthenticated, coords],
  );
  useEffect(() => {
    load();
  }, [load]);
  const isSaved = useCallback(
    (id) => savedShops.some((entry) => entry.shop_id?._id === id),
    [savedShops],
  );
  const setSaved = useCallback(
    async (shop, save) => {
      const id = shop._id;
      if (!isAuthenticated || pending.current.has(id))
        return { ok: false, busy: true };
      const previous = savedShops.find((entry) => entry.shop_id?._id === id);
      if (Boolean(previous) === save) return { ok: true, saved: save };
      pending.current.add(id);
      const epoch = session.current;
      // Stop a pre-mutation refresh from replacing the optimistic state.
      requestId.current++;
      setLoading(false);
      const optimistic = { _id: "optimistic-" + id, shop_id: shop };
      setSavedShops((current) =>
        save
          ? [
              optimistic,
              ...current.filter((entry) => entry.shop_id?._id !== id),
            ]
          : current.filter((entry) => entry.shop_id?._id !== id),
      );
      try {
        if (save) {
          const { data } = await api.post("/saved-shops", { shop_id: id });
          if (epoch === session.current)
            setSavedShops((current) =>
              current.map((entry) =>
                entry._id === optimistic._id
                  ? { ...data, shop_id: shop }
                  : entry,
              ),
            );
        } else await api.delete("/saved-shops/" + id);
        return { ok: epoch === session.current, saved: save };
      } catch (error) {
        const status = error.response?.status;
        if ((save && status === 409) || (!save && status === 404)) {
          if (epoch === session.current) await load({ silent: true });
          return { ok: epoch === session.current, saved: save };
        }
        if (epoch === session.current)
          setSavedShops((current) => {
            const others = current.filter((entry) => entry.shop_id?._id !== id);
            return previous ? [previous, ...others] : others;
          });
        return {
          ok: false,
          message:
            error.response?.data?.message ||
            "Couldn’t update saved shops. Please try again.",
        };
      } finally {
        if (epoch === session.current) pending.current.delete(id);
      }
    },
    [isAuthenticated, savedShops, load],
  );
  const toggleSaved = useCallback(
    (shop) => setSaved(shop, !isSaved(shop._id)),
    [setSaved, isSaved],
  );
  const value = useMemo(
    () => ({
      savedShops,
      loading,
      isSaved,
      toggleSaved,
      setSaved,
      refresh: load,
    }),
    [savedShops, loading, isSaved, toggleSaved, setSaved, load],
  );
  return (
    <SavedShopsContext.Provider value={value}>
      {children}
    </SavedShopsContext.Provider>
  );
}
export const useSavedShops = () => useContext(SavedShopsContext);
