"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

import { devError, devErrorOnce } from "@/lib/dev";
import {
  DARK_QUERY,
  isThemedPath,
  isThemePref,
  THEME_COLORS,
  THEME_KEY,
  type Theme,
  type ThemePref,
} from "@/lib/theme";
import { saveThemePref } from "@/lib/theme-actions";

// The Appearance choice on the client. localStorage holds it (read by the
// inline script in the root layout for the first paint); the profile holds
// it across devices (ThemeSync). Where it applies: lib/theme.ts.

const CHANGE_EVENT = "moink-theme-change";
/** The value last known to be in the profile, to tell which side changed
 *  since: a newer choice elsewhere wins over this device's, and this
 *  device's choice that didn't reach the server yet is sent again. */
const SAVED_KEY = "moink-theme-saved";

/** Kept when localStorage can't be written, for this visit. */
let memoryPref: ThemePref | null = null;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    devErrorOnce(`read:${key}`, `Theme: couldn't read ${key} from localStorage.`, error);
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    devErrorOnce(`write:${key}`, `Theme: couldn't save ${key} to localStorage; kept for this visit only.`, error);
  }
}

function readPref(): ThemePref {
  if (memoryPref) return memoryPref;
  const stored = readStored(THEME_KEY);
  return isThemePref(stored) ? stored : "system";
}

function resolve(pref: ThemePref): Theme {
  if (pref !== "system") return pref;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    memoryPref = null; // another tab wrote it: storage works
    onChange();
  };
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function storePref(pref: ThemePref) {
  memoryPref = pref;
  writeStored(THEME_KEY, pref);
  if (readStored(THEME_KEY) === pref) memoryPref = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function sendPref(pref: ThemePref) {
  saveThemePref(pref)
    .then((result) => {
      if (result.ok) writeStored(SAVED_KEY, pref);
    })
    .catch((error) => devError("Theme: saveThemePref threw; the choice is kept on this device.", error));
}

/** Sets the choice: on this device at once, and in the profile when signed
 *  in (signed out, the server action does nothing). */
export function setThemePref(pref: ThemePref) {
  storePref(pref);
  sendPref(pref);
}

/** The choice. `initial` (the profile's) on the server and while hydrating,
 *  so a server-rendered control matches. */
export function useThemePref(initial: ThemePref = "system"): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => initial);
}

/** Light or dark as the choice comes out now (system: the device's
 *  setting, live); null on the server and while hydrating. */
export function useResolvedTheme(): Theme | null {
  return useSyncExternalStore(
    subscribe,
    () => resolve(readPref()),
    () => null,
  );
}

/** data-theme on <html> and the theme-color meta, as THEME_SCRIPT sets them. */
function applyTheme(pathname: string, theme: Theme) {
  const themed = isThemedPath(pathname);
  const shown: Theme = themed ? theme : "light";
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== shown) root.setAttribute("data-theme", shown);
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themed) {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[shown];
}

/**
 * In the root layout: keeps <html> on the right theme as the route, the
 * choice (here, in another tab, from the profile) or the device's setting
 * change. A layout effect, so a navigation between a themed page and a
 * light one commits and recolors in the same frame. It also puts the
 * attribute back after the development remount clears it.
 */
export function ThemeController() {
  const pathname = usePathname();
  const theme = useResolvedTheme();
  useLayoutEffect(() => {
    applyTheme(pathname, theme ?? resolve(readPref()));
  }, [pathname, theme]);
  return null;
}

let synced = false;

/**
 * In the signed-in layouts, with the profile's choice (null when it couldn't
 * be read): once per page load, a choice made on another device is taken
 * over, and one made here that never reached the server is sent again.
 */
export function ThemeSync({ theme }: { theme: ThemePref | null }) {
  useEffect(() => {
    if (synced || !theme) return;
    synced = true;
    const local = readPref();
    if (theme === local) {
      writeStored(SAVED_KEY, theme);
    } else if (theme !== readStored(SAVED_KEY)) {
      writeStored(SAVED_KEY, theme);
      storePref(theme);
    } else {
      sendPref(local);
    }
  }, [theme]);
  return null;
}

/**
 * The quick sun/moon switch (HSK Book reading bar, flashcard sessions):
 * sets the choice to the other of light and dark. The icon follows the
 * page's theme in CSS, so it's right from the first paint.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useResolvedTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-label="Dark theme"
      aria-pressed={theme === null ? undefined : dark}
      title={dark ? "Switch to light" : "Switch to dark"}
      onClick={() => setThemePref(dark ? "light" : "dark")}
      className={className}
    >
      <Moon size={18} aria-hidden="true" className="dark:hidden" />
      <Sun size={18} aria-hidden="true" className="hidden dark:block" />
    </button>
  );
}
