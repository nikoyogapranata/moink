"use client";

import { Volume2 } from "lucide-react";

import { speak, useHasChineseVoice } from "@/lib/dictionary/speech";

/** Plays the hanzi with a Chinese system voice; renders nothing when the
 *  browser has none. */
export function AudioButton({
  text,
  size = "md",
}: {
  text: string;
  size?: "sm" | "md";
}) {
  const hasVoice = useHasChineseVoice();
  if (!hasVoice) return null;

  return (
    <button
      type="button"
      onClick={() => speak(text)}
      aria-label={`Play pronunciation of ${text}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-rust-dark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust ${
        size === "sm" ? "h-8 w-8" : "h-10 w-10"
      }`}
    >
      <Volume2 size={size === "sm" ? 18 : 22} aria-hidden="true" />
    </button>
  );
}
