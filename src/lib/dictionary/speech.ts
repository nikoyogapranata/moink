"use client";

import { useSyncExternalStore } from "react";

// Chinese text to speech with the browser's own voices. Audio buttons only
// show when a zh-CN (or other zh) voice exists; the voice list loads
// asynchronously, so availability is an external store that updates on
// "voiceschanged". The server snapshot is false: no button in the server
// render, so hydration matches.

function chineseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === "zh-cn") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("zh")) ??
    null
  );
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

export function useHasChineseVoice() {
  return useSyncExternalStore(subscribe, () => chineseVoice() !== null, () => false);
}

/** Speak hanzi, cancelling anything already playing. */
export function speak(text: string) {
  const voice = chineseVoice();
  if (!voice) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}
