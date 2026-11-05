import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useAuth } from "./AuthContext";
const OrderDraftContext = createContext(null);
// Uploaded documents survive visits to tabs during this signed-in session.
// Payment proof has separate durable storage.
export function OrderDraftProvider({ children }) {
  const { user } = useAuth(), draft = useRef(null), account = String(user?.id || user?._id || "");
  useEffect(() => { draft.current = null; }, [account]);
  const getDraft = useCallback(() => draft.current, []);
  const setDraft = useCallback((next) => { draft.current = next; }, []);
  const clearDraft = useCallback(() => { draft.current = null; }, []);
  const value = useMemo(() => ({ getDraft, setDraft, clearDraft }), [getDraft, setDraft, clearDraft]);
  return <OrderDraftContext.Provider value={value}>{children}</OrderDraftContext.Provider>;
}
export const useOrderDraft = () => useContext(OrderDraftContext);
