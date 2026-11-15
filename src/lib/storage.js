import { useEffect, useState } from "react";
import { clearScanPhoto } from "./scanSettings.js";

// Drops the bill form's draft from storage (before the form remounts on Reset / a new split)
export const clearBillDraft = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAll(), billDraft: null })); } catch { /* unavailable */ }
  clearScanPhoto();
};

// Small per-device preferences; storage can be unavailable (private mode), so failures are ignored
export const TAX_SPLIT_PREF = "spliteasy:taxSplit";

export const ROUND_OFF_PREF = "spliteasy:roundOff";

export const readPref = (key) => { try { return localStorage.getItem(key); } catch { return null; } };

export const writePref = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

export const STORAGE_KEY = "spliteasy:v1";

export const loadAll = () => {
  try {
    // savedRestaurants / savedDishes came from an earlier version; drop them
    const { savedRestaurants: _oldPlaces, savedDishes: _oldDishes, ...rest } = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return rest;
  } catch { return {}; }
};

export function usePersisted(key, initial) {
  const [val, setVal] = useState(() => loadAll()[key] ?? initial);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAll(), [key]: val })); } catch { /* storage unavailable */ }
  }, [key, val]);
  return [val, setVal];
}

export const HISTORY_KEY = "spliteasy:history";

export function useStoredState(storageKey, initial) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(val)); } catch { /* storage unavailable */ }
  }, [storageKey, val]);
  // Another tab (e.g. the pay page saving a request) changed it: take that value
  useEffect(() => {
    const onStorage = (e) => { if (e.key === storageKey) { try { setVal(JSON.parse(e.newValue) ?? initial); } catch { /* ignore */ } } };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  return [val, setVal];
}
