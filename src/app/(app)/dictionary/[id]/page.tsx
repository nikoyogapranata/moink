import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { RetryButton } from "@/components/app/RetryButton";
import { WORD_DETAIL_COLUMNS, listQuery, parseLevel } from "@/lib/dictionary/words";
import { createClient } from "@/lib/supabase/server";

import { WordStandalone } from "./WordStandalone";

/** The word, null when there's no such word, or "error" when the load
 *  failed (logged here). */
const getWord = cache(async (rawId: string) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("words")
    .select(WORD_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`WordPage: couldn't load word ${id}.`, error);
    return "error" as const;
  }
  return data;
});

export async function generateMetadata({ params }: PageProps<"/dictionary/[id]">): Promise<Metadata> {
  const word = await getWord((await params).id);
  if (word === "error") return { title: "Dictionary - moink" };
  return { title: word ? `${word.simplified} ${word.pinyin} - moink` : "Word not found - moink" };
}

/** One word on its own page: where the list goes on mobile, and a link
 *  to share. ?q= and ?level= are the list state "back" returns to. */
export default async function WordPage({ params, searchParams }: PageProps<"/dictionary/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const word = await getWord(id);
  if (word === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="font-body text-body text-bark">
          Couldn&apos;t load this word.
        </p>
        <RetryButton />
      </div>
    );
  }
  if (!word) notFound();

  const q = typeof query.q === "string" ? query.q : "";
  const level = parseLevel(typeof query.level === "string" ? query.level : null);

  return (
    <Suspense>
      <WordStandalone word={word} backHref={`/dictionary${listQuery(q, level)}`} />
    </Suspense>
  );
}
