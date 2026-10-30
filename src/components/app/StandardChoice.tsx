"use client";

import { Check } from "lucide-react";

import { HSK_STANDARDS, STANDARD_INFO, type HskStandard } from "@/lib/hsk";

/**
 * HSK 3.0 (2025) or HSK 2.0, as two large option cards: native radios
 * (arrow keys move between them), styled from the checked state. For
 * onboarding and Settings.
 */
export function StandardChoice({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: HskStandard;
  onChange: (next: HskStandard) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2" disabled={disabled}>
      <legend className="sr-only">HSK standard</legend>
      {HSK_STANDARDS.map((standard) => {
        const { name: title, line } = STANDARD_INFO[standard];
        const checked = value === standard;
        return (
          <label
            key={standard}
            className={`relative flex cursor-pointer flex-col gap-1 rounded-lg border-2 px-4 py-3 transition-[border-color,background-color] has-focus-visible:ring-2 has-focus-visible:ring-rust/40 has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background has-disabled:cursor-default has-disabled:opacity-60 ${
              checked ? "border-rust bg-rust/10" : "border-bark/15 bg-background hover:border-bark/30"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={standard}
              checked={checked}
              onChange={() => onChange(standard)}
              className="sr-only"
            />
            {checked && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-rust text-background"
              >
                <Check size={14} strokeWidth={3} />
              </span>
            )}
            <span className="pr-7 font-heading text-h3 font-bold text-bark">{title}</span>
            <span className="font-body text-body-sm text-bark-muted">{line}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
