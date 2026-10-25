"use client";

import type HanziWriterType from "hanzi-writer";

// Stroke data and the hanzi-writer module, loaded once in the browser and
// shared by the big writing box, the step frames and the practice quiz.
// Stroke data comes from hanzi-writer's default source (the
// hanzi-writer-data package on the jsDelivr CDN).

export type HanziWriterClass = typeof HanziWriterType;

export interface CharacterStrokes {
  strokes: string[];
  medians: number[][][];
  radStrokes?: number[];
}

let modulePromise: Promise<HanziWriterClass> | null = null;

export function loadHanziWriter() {
  modulePromise ??= import("hanzi-writer").then((m) => m.default);
  return modulePromise;
}

const strokeCache = new Map<string, Promise<CharacterStrokes | null>>();

/** A character's stroke data, or null when there is none for it. */
export function loadStrokes(char: string) {
  let pending = strokeCache.get(char);
  if (!pending) {
    pending = loadHanziWriter()
      .then((HanziWriter) => HanziWriter.loadCharacterData(char))
      .then((data) => (data && data.strokes?.length ? (data as CharacterStrokes) : null))
      .catch(() => null);
    strokeCache.set(char, pending);
  }
  return pending;
}

/** A design token's current value (hanzi-writer needs real colors, not
 *  var()), optionally with an alpha. */
export function tokenColor(name: string, alpha?: number) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (alpha === undefined) return value;
  const hex = value.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return value;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
