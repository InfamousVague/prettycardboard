import { useEffect, useState } from 'react';
import { loadPreferences, type Preferences } from '../preferences.ts';

/**
 * Reactively read a single app preference from anywhere in the tree, without
 * prop-drilling. Seeds from the persisted value and updates whenever the app
 * broadcasts a change (App fires `pc:preferences` from applyPreferences on
 * every save), so toggling a setting is reflected live.
 */
export function usePreference<K extends keyof Preferences>(key: K): Preferences[K] {
  const [value, setValue] = useState<Preferences[K]>(() => loadPreferences()[key]);
  useEffect(() => {
    const onChange = (event: Event) => {
      const prefs = (event as CustomEvent<Preferences>).detail;
      if (prefs) setValue(prefs[key]);
    };
    window.addEventListener('pc:preferences', onChange);
    return () => window.removeEventListener('pc:preferences', onChange);
  }, [key]);
  return value;
}
