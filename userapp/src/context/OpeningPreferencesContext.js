import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OPENING_PREFERENCE_KEY, readOpeningPreference } from '../utils/openingPreference';

const OpeningPreferencesContext = createContext(null);

export function OpeningPreferencesProvider({ children }) {
  const [enabled, setEnabledState] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    const initialRevision = revision.current;
    AsyncStorage.getItem(OPENING_PREFERENCE_KEY).then(stored => {
      if (active && revision.current === initialRevision) setEnabledState(readOpeningPreference(stored));
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const setEnabled = useCallback(async value => {
    const next = Boolean(value);
    const updateRevision = ++revision.current;
    setEnabledState(next);
    setError('');
    const write = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(OPENING_PREFERENCE_KEY, String(next)));
    writes.current = write;
    try { await write; return true; }
    catch { if (revision.current === updateRevision) setError('Opening preference could not be saved. Try again.'); return false; }
  }, []);

  const value = useMemo(() => ({ ready, enabled, setEnabled, error }), [ready, enabled, setEnabled, error]);
  return <OpeningPreferencesContext.Provider value={value}>{children}</OpeningPreferencesContext.Provider>;
}

export function useOpeningPreferences() {
  const preferences = useContext(OpeningPreferencesContext);
  if (!preferences) throw new Error('Opening preferences must be read inside OpeningPreferencesProvider.');
  return preferences;
}
