// The flashcard deck builder's deck: groups of words added together (a
// level's or set's picks, a book lesson, words added by search), and their
// union, which is the deck. A word in two groups counts once. Safe on
// server and client.

import { parseAnyDeckSet, type DeckSet } from "./deck";

/** A card in a deck: "w:<id>" for a word in the words table, "b:<hanzi>"
 *  for an HSK Book word that has no words row (the card is built from the
 *  book's pinyin, part of speech and English). */
export type DeckKey = `w:${number}` | `b:${string}`;

export const wordKey = (id: number): DeckKey => `w:${id}`;
export const bookKey = (hanzi: string): DeckKey => `b:${hanzi}`;

export function parseDeckKey(value: unknown): DeckKey | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("w:")) {
    const id = Number(value.slice(2));
    return Number.isSafeInteger(id) && id > 0 ? wordKey(id) : null;
  }
  if (value.startsWith("b:")) {
    const hanzi = value.slice(2);
    return hanzi.length > 0 && hanzi.length <= 20 ? bookKey(hanzi) : null;
  }
  return null;
}

/** A word added by search, with what its chip shows. */
export interface SearchPick {
  key: DeckKey;
  hanzi: string;
}

export type DeckGroup =
  /** Words picked in a set's grid (My words, Due soon, an HSK level). */
  | { kind: "set"; set: DeckSet; keys: DeckKey[] }
  /** Every word of a book lesson but its proper nouns. */
  | { kind: "lesson"; book: string; label: string; lesson: number; keys: DeckKey[] }
  | { kind: "search"; picks: SearchPick[] };

export const groupKeys = (g: DeckGroup): DeckKey[] => (g.kind === "search" ? g.picks.map((p) => p.key) : g.keys);

export function groupId(g: DeckGroup) {
  return g.kind === "set" ? `set:${g.set}` : g.kind === "lesson" ? `lesson:${g.book}:${g.lesson}` : "search";
}

/** Every card in the deck, once, in the order first added. */
export function deckKeys(groups: readonly DeckGroup[]): DeckKey[] {
  return [...new Set(groups.flatMap(groupKeys))];
}

/** The deck as stored: word ids and book-only hanzi. */
export function splitKeys(keys: readonly DeckKey[]) {
  const ids: number[] = [];
  const book: string[] = [];
  for (const key of keys) {
    if (key.startsWith("w:")) ids.push(Number(key.slice(2)));
    else book.push(key.slice(2));
  }
  return { ids, book };
}

/** `groups` with `keys` added to the set group of `set` (made, last, if
 *  there's none). */
export function addToSet(groups: readonly DeckGroup[], set: DeckSet, keys: readonly DeckKey[]): DeckGroup[] {
  const at = groups.findIndex((g) => g.kind === "set" && g.set === set);
  if (at === -1) return [...groups, { kind: "set", set, keys: [...new Set(keys)] }];
  const group = groups[at] as Extract<DeckGroup, { kind: "set" }>;
  const next = [...groups];
  next[at] = { ...group, keys: [...new Set([...group.keys, ...keys])] };
  return next;
}

/** `groups` with a search pick added (made, last, if there's none). */
export function addPick(groups: readonly DeckGroup[], pick: SearchPick): DeckGroup[] {
  const at = groups.findIndex((g) => g.kind === "search");
  if (at === -1) return [...groups, { kind: "search", picks: [pick] }];
  const group = groups[at] as Extract<DeckGroup, { kind: "search" }>;
  if (group.picks.some((p) => p.key === pick.key)) return [...groups];
  const next = [...groups];
  next[at] = { ...group, picks: [...group.picks, pick] };
  return next;
}

/** `groups` without `keys` anywhere; groups left empty are dropped. Taking
 *  a word out takes it out of the deck, whichever groups brought it in. */
export function removeKeys(groups: readonly DeckGroup[], keys: readonly DeckKey[]): DeckGroup[] {
  const gone = new Set(keys);
  return groups.flatMap((g): DeckGroup[] => {
    const next: DeckGroup =
      g.kind === "search" ? { ...g, picks: g.picks.filter((p) => !gone.has(p.key)) } : { ...g, keys: g.keys.filter((k) => !gone.has(k)) };
    return groupKeys(next).length ? [next] : [];
  });
}

/** `groups` without one search pick; the word stays in the deck if another
 *  group has it. */
export function removePick(groups: readonly DeckGroup[], key: DeckKey): DeckGroup[] {
  return groups.flatMap((g): DeckGroup[] => {
    if (g.kind !== "search") return [g];
    const picks = g.picks.filter((p) => p.key !== key);
    return picks.length ? [{ ...g, picks }] : [];
  });
}

/** `groups` with the lesson group added, or taken out when it's there. */
export function toggleLesson(groups: readonly DeckGroup[], lesson: Extract<DeckGroup, { kind: "lesson" }>): DeckGroup[] {
  const id = groupId(lesson);
  return groups.some((g) => groupId(g) === id) ? groups.filter((g) => groupId(g) !== id) : [...groups, lesson];
}

/* Parsing a saved deck's groups */

const MAX_GROUPS = 200;
const MAX_KEYS = 6000;

function parseKeys(value: unknown): DeckKey[] | null {
  if (!Array.isArray(value) || value.length > MAX_KEYS) return null;
  const keys = value.map(parseDeckKey);
  return keys.every((k) => k !== null) ? (keys as DeckKey[]) : null;
}

function parseGroup(value: unknown): DeckGroup | null {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  if (g.kind === "set") {
    const set = parseAnyDeckSet(g.set);
    const keys = parseKeys(g.keys);
    return set && keys?.length ? { kind: "set", set, keys } : null;
  }
  if (g.kind === "lesson") {
    const keys = parseKeys(g.keys);
    const ok =
      typeof g.book === "string" && typeof g.label === "string" && Number.isSafeInteger(g.lesson) && keys?.length;
    return ok ? { kind: "lesson", book: g.book as string, label: g.label as string, lesson: g.lesson as number, keys: keys! } : null;
  }
  if (g.kind === "search" && Array.isArray(g.picks) && g.picks.length <= MAX_KEYS) {
    const picks = g.picks.flatMap((p): SearchPick[] => {
      const key = parseDeckKey(p?.key);
      return key && typeof p?.hanzi === "string" ? [{ key, hanzi: p.hanzi }] : [];
    });
    return picks.length ? { kind: "search", picks } : null;
  }
  return null;
}

/** A saved deck's groups, or null when they're missing or malformed. */
export function parseGroups(value: unknown): DeckGroup[] | null {
  if (!Array.isArray(value) || value.length > MAX_GROUPS) return null;
  const groups = value.map(parseGroup);
  return groups.every((g) => g !== null) ? (groups as DeckGroup[]) : null;
}

/** Normal: one pass, Still learning comes back (the current behaviour).
 *  Endless: rounds that repeat forever, Got it only marks the card. */
export type SessionKind = "normal" | "endless";

export function parseSessionKind(value: unknown): SessionKind {
  return value === "endless" ? "endless" : "normal";
}
