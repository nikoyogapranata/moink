// Appearance: the user's choice (light, dark, or system) and where it
// applies. Shared by the inline script in the root layout (first paint), the
// client theme code (components/app/Theme.tsx) and the server.
//
// To give more pages the theme, add their path to THEMED_PATHS: the pages
// themselves only use the color tokens (globals.css), never fixed colors.

export const THEME_PREFS = ["light", "dark", "system"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export type Theme = "light" | "dark";

export const isThemePref = (value: unknown): value is ThemePref =>
  typeof value === "string" && (THEME_PREFS as readonly string[]).includes(value);

/** The choice in localStorage. */
export const THEME_KEY = "moink-theme";

/** The pages that follow the choice, with everything under them. */
export const THEMED_PATHS = ["/book", "/training"] as const;

export function isThemedPath(pathname: string) {
  return THEMED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** --color-background of each theme, for <meta name="theme-color">. */
export const THEME_COLORS: Record<Theme, string> = { light: "#fdfbf6", dark: "#1c1916" };

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> while the page is parsed, before the first paint: sets
 * data-theme on <html> from the path and localStorage (system: the device's
 * setting), and the theme-color meta on themed pages. The client code
 * (applyTheme) does the same on every later change.
 */
export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement,t="light",p=location.pathname,m;
if(${JSON.stringify(THEMED_PATHS)}.some(function(x){return p===x||p.indexOf(x+"/")===0})){
var s=null;try{s=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}
t=s==="light"||s==="dark"?s:matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";
m=document.createElement("meta");m.name="theme-color";m.content=${JSON.stringify(THEME_COLORS)}[t];document.head.appendChild(m)}
d.setAttribute("data-theme",t)}catch(e){}})()`;
