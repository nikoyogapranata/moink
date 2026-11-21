"use client";

import { Volume2 } from "lucide-react";

import { speak, useHasChineseVoice } from "@/lib/dictionary/speech";

/** Reads Chinese aloud with the browser's Chinese voice, a little slower
 *  than normal. Renders nothing when there's no such voice. */
export function SpeakButton({ text, label }: { text: string; label?: string }) {
  const hasVoice = useHasChineseVoice();
  if (!hasVoice || !text.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text, { rate: 0.9 })}
      aria-label={label ?? `Listen: ${text}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full align-middle text-rust-dark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
    >
      <Volume2 size={17} aria-hidden="true" />
    </button>
  );
}
