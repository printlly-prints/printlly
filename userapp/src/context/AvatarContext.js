import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";
import { customerAvatarId, DEFAULT_AVATAR_ID } from "../constants/avatarIds";

const AvatarContext = createContext(null);

export function AvatarProvider({ children }) {
  const { user } = useAuth();
  const scope = user?.id;
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const pending = useRef(new Map());
  const currentScope = useRef(scope);
  currentScope.current = scope;

  useEffect(() => {
    let active = true;
    setAvatarId(DEFAULT_AVATAR_ID);
    if (!scope) return () => { active = false; };
    AsyncStorage.getItem(`printlly:avatar:${scope}`).then((value) => {
      if (active) setAvatarId(customerAvatarId(pending.current.get(scope) || value));
    }).catch(() => {});
    return () => { active = false; };
  }, [scope]);

  const saveAvatar = useCallback(async (id, accountId = currentScope.current) => {
    const next = customerAvatarId(id);
    if (!accountId) return false;
    pending.current.set(accountId, next);
    if (currentScope.current === accountId) setAvatarId(next);
    try {
      await AsyncStorage.setItem(`printlly:avatar:${accountId}`, next);
      return true;
    } catch {
      return false;
    }
  }, []);

  return <AvatarContext.Provider value={{ avatarId, saveAvatar }}>{children}</AvatarContext.Provider>;
}

export const useAvatar = () => useContext(AvatarContext);
