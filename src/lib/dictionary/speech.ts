"use client";

import { useSyncExternalStore } from "react";

import { devError } from "@/lib/dev";

// Chinese text to speech with the browser's own voices. Audio buttons only
// show when a zh-CN (or other zh) voice exists; the voice list loads
// asynchronously, so availability is an external store that updates on
// "voiceschanged". The server snapshot is "checking": no button in the
// server render, so hydration matches.

/** Speaking rates: normal for every audio button, slow for listening's
 *  Slow button. */
export const NORMAL_RATE = 0.85;
export const SLOW_RATE = 0.55;

/** What to tell someone whose browser has no Chinese voice. */
export const NO_VOICE_HELP = "Try Chrome, Edge, or Safari, or add a Chinese voice in your system settings.";

/** How long to wait for the voice list before deciding there's no Chinese
 *  voice (some browsers fill it in a moment after load). */
const VOICE_TIMEOUT_MS = 1500;

function hasSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function chineseVoice(): SpeechSynthesisVoice | null {
  if (!hasSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === "zh-cn") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("zh")) ??
    null
  );
}

/** checking: the voice list hasn't settled yet; available: a Chinese voice
 *  exists; none: there isn't one (listening is off). */
export type VoiceStatus = "checking" | "available" | "none";

let status: VoiceStatus = "checking";
let detecting = false;
const listeners = new Set<() => void>();

function setStatus(next: VoiceStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

/** Starts watching the voice list, once. A Chinese voice showing up later
 *  (after a "none") still turns it on. */
function detect() {
  if (detecting) return;
  detecting = true;
  if (!hasSpeech()) {
    devError("speech: this browser has no speechSynthesis, so there's no Chinese voice.");
    setStatus("none");
    return;
  }
  // A loaded list without a Chinese voice settles it at once; an empty one
  // may still be loading, so that waits for the timeout.
  const check = () => {
    if (chineseVoice()) setStatus("available");
    else if (status === "checking" && window.speechSynthesis.getVoices().length > 0) noVoice();
  };
  const noVoice = () => {
    const voices = window.speechSynthesis.getVoices().map((v) => `${v.name} (${v.lang})`);
    devError("speech: no Chinese voice; listening is off. Voices:", voices);
    setStatus("none");
  };
  window.speechSynthesis.addEventListener("voiceschanged", check);
  check();
  window.setTimeout(() => {
    if (status === "checking") noVoice();
  }, VOICE_TIMEOUT_MS);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  detect();
  return () => listeners.delete(onChange);
}

export function useChineseVoiceStatus(): VoiceStatus {
  return useSyncExternalStore(subscribe, () => status, () => "checking");
}

export function useHasChineseVoice() {
  return useChineseVoiceStatus() === "available";
}

/** Speak hanzi, cancelling anything already playing. onEnd also runs when
 *  the speech is cut off (cancelled, or an error). */
export function speak(text: string, options: { rate?: number; onStart?: () => void; onEnd?: () => void } = {}) {
  const voice = chineseVoice();
  if (!voice) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = options.rate ?? NORMAL_RATE;
  if (options.onStart) utterance.onstart = options.onStart;
  if (options.onEnd) {
    utterance.onend = options.onEnd;
    utterance.onerror = options.onEnd;
  }
  window.speechSynthesis.speak(utterance);
}

/** Stops any speech (a session leaving its question). */
export function stopSpeaking() {
  if (hasSpeech()) window.speechSynthesis.cancel();
}
