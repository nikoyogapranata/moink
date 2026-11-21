"use server";

import { createClient, signedInUserId } from "@/lib/supabase/server";

import type { Json } from "@/lib/supabase/database.types";

import type { BookPrefs } from "./types";

// Writes of the HSK Book reader. RLS checks every one (own rows, and
// book_access for the progress table). None calls refresh(): the reader
// already shows the change (optimistic), so nothing needs re-rendering.

const COLUMNS = { pinyin: "show_pinyin", english: "show_english", extras: "show_extras" } as const;

/** Saves one display switch to the profile. */
export async function saveBookPref(pref: keyof BookPrefs, shown: boolean): Promise<{ ok: boolean }> {
  if (!(pref in COLUMNS) || typeof shown !== "boolean") return { ok: false };
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const { data, error } = await supabase
    .from("profiles")
    .update(
      pref === "pinyin" ? { show_pinyin: shown } : pref === "english" ? { show_english: shown } : { show_extras: shown },
    )
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    console.error("saveBookPref failed", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Where the user is in a lesson: the block at the top of the screen. */
export async function saveBookPosition(lessonId: string, blockKey: string): Promise<{ ok: boolean }> {
  if (typeof lessonId !== "string" || typeof blockKey !== "string" || blockKey.length > 200) return { ok: false };
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const { error } = await supabase
    .from("user_book_progress")
    .upsert(
      { user_id: userId, lesson_id: lessonId, last_block_key: blockKey, updated_at: new Date().toISOString() },
      { onConflict: "user_id,lesson_id" },
    );
  if (error) {
    console.error("saveBookPosition failed", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Marks a lesson done, or not done again. */
export async function setBookLessonDone(lessonId: string, done: boolean): Promise<{ ok: boolean }> {
  if (typeof lessonId !== "string" || typeof done !== "boolean") return { ok: false };
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_book_progress")
    .upsert(
      { user_id: userId, lesson_id: lessonId, completed_at: done ? now : null, updated_at: now },
      { onConflict: "user_id,lesson_id" },
    );
  if (error) {
    console.error("setBookLessonDone failed", error);
    return { ok: false };
  }
  return { ok: true };
}

const MAX_KEY = 200;
const MAX_ANSWER_CHARS = 20_000;
const MAX_NOTE_CHARS = 20_000;

/** Saves one answer (upsert by user and key). */
export async function saveBookAnswer(
  itemKey: string,
  answer: Json,
  isCorrect: boolean | null,
): Promise<{ ok: boolean }> {
  if (typeof itemKey !== "string" || !itemKey || itemKey.length > MAX_KEY) return { ok: false };
  if (isCorrect !== null && typeof isCorrect !== "boolean") return { ok: false };
  if (JSON.stringify(answer ?? null).length > MAX_ANSWER_CHARS) return { ok: false };
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const { error } = await supabase
    .from("user_book_answers")
    .upsert(
      { user_id: userId, item_key: itemKey, answer, is_correct: isCorrect, updated_at: new Date().toISOString() },
      { onConflict: "user_id,item_key" },
    );
  if (error) {
    console.error("saveBookAnswer failed", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Deletes answers (a block's Reset). */
export async function clearBookAnswers(itemKeys: string[]): Promise<{ ok: boolean }> {
  if (!Array.isArray(itemKeys) || itemKeys.length > 100 || itemKeys.some((k) => typeof k !== "string" || k.length > MAX_KEY)) {
    return { ok: false };
  }
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const { error } = await supabase.from("user_book_answers").delete().eq("user_id", userId).in("item_key", itemKeys);
  if (error) {
    console.error("clearBookAnswers failed", error);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Saves a note: inserts it when `noteId` is null, updates it otherwise, and
 * deletes it when the body is empty. Returns the note's id (null once
 * deleted).
 */
export async function saveBookNote(
  lessonId: string,
  blockKey: string | null,
  noteId: string | null,
  body: string,
): Promise<{ ok: boolean; id: string | null }> {
  const fail = { ok: false, id: noteId };
  if (typeof lessonId !== "string" || typeof body !== "string" || body.length > MAX_NOTE_CHARS) return fail;
  if (blockKey !== null && (typeof blockKey !== "string" || blockKey.length > MAX_KEY)) return fail;
  if (noteId !== null && typeof noteId !== "string") return fail;
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return fail;

  if (!body.trim()) {
    if (noteId) {
      const { error } = await supabase.from("user_book_notes").delete().eq("id", noteId).eq("user_id", userId);
      if (error) {
        console.error("saveBookNote (delete) failed", error);
        return fail;
      }
    }
    return { ok: true, id: null };
  }

  const now = new Date().toISOString();
  if (noteId) {
    const { data, error } = await supabase
      .from("user_book_notes")
      .update({ body, updated_at: now })
      .eq("id", noteId)
      .eq("user_id", userId)
      .select("id");
    if (error) {
      console.error("saveBookNote (update) failed", error);
      return fail;
    }
    if (data.length) return { ok: true, id: noteId };
    // Deleted meanwhile (another tab): insert it again below.
  }
  const { data, error } = await supabase
    .from("user_book_notes")
    .insert({ user_id: userId, lesson_id: lessonId, block_key: blockKey, body, created_at: now, updated_at: now })
    .select("id")
    .single();
  if (error) {
    console.error("saveBookNote (insert) failed", error);
    return fail;
  }
  return { ok: true, id: data.id };
}
