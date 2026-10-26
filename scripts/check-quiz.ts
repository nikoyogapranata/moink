// Builds quiz questions for every HSK 1 to 4 word in all three formats, the
// same way the app does (buildWordQuestions over levelPool), and fails if
// any question can't be built or has two options sharing a simplified
// form, gloss, plain pinyin or option text: that question would have two
// right answers, or two identical buttons.
//
//   pnpm tsx scripts/check-quiz.ts [rounds]
//
// Distractors are random, so each word is built `rounds` times (default 5).
// Reads only.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { toPinyinPlain } from "../src/lib/pinyin";
import {
  buildWordQuestions,
  levelPool,
  optionGloss,
  QUIZ_FORMATS,
  type QuizWord,
} from "../src/lib/training/quiz";

config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const PAGE_SIZE = 1000;
const CHECKED_LEVELS = [1, 2, 3, 4];

async function main() {
  const rounds = Number(process.argv[2] ?? 5);
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!);

  // Every level, since a small one borrows from its neighbors.
  const byLevel = new Map<number, QuizWord[]>();
  for (let level = 1; level <= 6; level++) {
    const words: QuizWord[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("words")
        .select("id, simplified, pinyin, pinyin_plain, gloss, hsk_level")
        .eq("hsk_level", level)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      words.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    byLevel.set(level, words);
  }
  const byId = new Map([...byLevel.values()].flat().map((w) => [w.id, w]));

  const plain = (w: QuizWord) => w.pinyin_plain || toPinyinPlain(w.pinyin) || w.pinyin;
  const gloss = (w: QuizWord) => (w.gloss ?? "").trim().toLowerCase();

  let questions = 0;
  const problems: string[] = [];
  for (const level of CHECKED_LEVELS) {
    const pool = levelPool(byLevel, level);
    for (const target of byLevel.get(level)!) {
      for (let round = 0; round < rounds; round++) {
        const built = buildWordQuestions(target, pool, QUIZ_FORMATS);
        for (const format of QUIZ_FORMATS) {
          const options = built[format];
          if (!options) {
            problems.push(`${target.simplified} (${target.id}) ${format}: no question built`);
            continue;
          }
          questions++;
          const words = options.map((o) => byId.get(o.id)!);
          const where = `${target.simplified} (${target.id}) ${format}`;
          if (options.length !== 4) problems.push(`${where}: ${options.length} options`);
          if (words.filter((w) => w.id === target.id).length !== 1) problems.push(`${where}: right answer missing`);
          for (const [name, key] of [
            ["simplified", (w: QuizWord) => w.simplified],
            ["gloss", gloss],
            ["pinyin_plain", plain],
          ] as const) {
            const values = words.map(key);
            if (new Set(values).size !== values.length) problems.push(`${where}: duplicate ${name} (${values.join(" | ")})`);
          }
          const texts = options.map((o) => o.text.trim().toLowerCase());
          if (new Set(texts).size !== texts.length) problems.push(`${where}: duplicate option text (${texts.join(" | ")})`);
          if (format === "meaning" && options.some((o) => o.text !== optionGloss(byId.get(o.id)!.gloss!))) {
            problems.push(`${where}: option text isn't the option gloss`);
          }
        }
      }
    }
  }

  const words = CHECKED_LEVELS.reduce((n, l) => n + byLevel.get(l)!.length, 0);
  console.log(`Checked ${questions} questions: ${words} words in HSK 1 to 4, 3 formats, ${rounds} rounds each.`);
  if (problems.length > 0) {
    console.error(`FAIL: ${problems.length} problems`);
    for (const p of problems.slice(0, 50)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log("PASS: every question has 4 options and exactly one right answer.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
