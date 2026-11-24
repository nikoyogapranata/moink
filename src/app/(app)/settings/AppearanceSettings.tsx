"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useId } from "react";

import { setThemePref, useThemePref } from "@/components/app/Theme";
import { CARD } from "@/components/dictionary/SideCards";
import type { ThemePref } from "@/lib/theme";

const FOCUS_RING = "has-focus-visible:ring-2 has-focus-visible:ring-rust/40 has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background";

const OPTIONS: { id: ThemePref; label: string; icon: LucideIcon }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

/**
 * Appearance: light, dark, or the device's setting. Applies at once (no
 * Save): on this device right away, and to the profile so other devices
 * follow. For now only the HSK Book and Flashcards use it.
 */
export function AppearanceSettings({ saved }: { saved: ThemePref }) {
  const pref = useThemePref(saved);
  const titleId = useId();
  const hintId = useId();

  return (
    <section aria-labelledby={titleId} className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 id={titleId} className="font-heading text-h2 font-bold text-bark">
          Appearance
        </h2>
        <p id={hintId} className="font-body text-body text-bark-muted">
          For the HSK Book and Flashcards for now. Other pages stay light.
        </p>
      </div>
      <fieldset aria-labelledby={titleId} aria-describedby={hintId} className="flex flex-wrap gap-2">
        {OPTIONS.map(({ id, label, icon: Icon }) => {
          const checked = pref === id;
          return (
            <label
              key={id}
              className={`relative flex h-12 min-w-28 cursor-pointer items-center justify-center gap-2 rounded-md border-2 px-4 font-heading text-h3 font-bold transition-colors ${FOCUS_RING} ${
                checked ? "border-rust bg-rust/10 text-bark" : "border-bark/15 text-bark-muted hover:border-bark/30 hover:text-bark"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={id}
                checked={checked}
                onChange={() => setThemePref(id)}
                className="sr-only"
              />
              <Icon size={18} aria-hidden="true" />
              {label}
            </label>
          );
        })}
      </fieldset>
      {pref === "system" && <p className="font-body text-body-sm text-bark-muted">Follows your device&apos;s light or dark setting.</p>}
    </section>
  );
}
