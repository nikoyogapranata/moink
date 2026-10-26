// Builds quiz and listening questions for every HSK 1 to 4 word in all
// five formats, the same way the app does (buildWordQuestions over
// levelPool and soundPool), and fails if any question can't be built or
// could have two right answers:
//
//   - quiz (meaning, hanzi, pinyin): two options share a simplified form,
//     gloss, plain pinyin or option text;
//   - listening (listen_hanzi, listen_meaning): an option has the target's
//     toned pinyin (a true homophone can't be told apart by ear), or two
//     options share a simplified form, gloss, toned pinyin or option text.
//
//   pnpm tsx scripts/check-quiz.ts [rounds]
//
// Distractors are random, so each word is built `rounds` times (default 5).
// Reads only.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { toPinyinPlain, tonedPinyin } from "../src/lib/pinyin";
import {
  buildWordQuestions,
  isListenFormat,
  levelPool,
  optionGloss,
  QUESTION_FORMATS,
  soundPool,
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

  // Every level: a small one borrows from its neighbors, and listening
  // reaches one level up.
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
  const toned = (w: QuizWord) => tonedPinyin(w.pinyin);
  const gloss = (w: QuizWord) => (w.gloss ?? "").trim().toLowerCase();

  const counts = { quiz: 0, listening: 0 };
  let tonePairs = 0;
  const problems: string[] = [];
  for (const level of CHECKED_LEVELS) {
    const pools = { level: levelPool(byLevel, level), sounds: soundPool(byLevel, level) };
    for (const target of byLevel.get(level)!) {
      for (let round = 0; round < rounds; round++) {
        const built = buildWordQuestions(target, pools, QUESTION_FORMATS);
        for (const format of QUESTION_FORMATS) {
          const listening = isListenFormat(format);
          const where = `${target.simplified} ${target.pinyin} (${target.id}) ${format}`;
          const options = built[format];
          if (!options) {
            problems.push(`${where}: no question built`);
            continue;
          }
          counts[listening ? "listening" : "quiz"]++;
          const words = options.map((o) => byId.get(o.id)!);
          if (options.length !== 4) problems.push(`${where}: ${options.length} options`);
          if (words.filter((w) => w.id === target.id).length !== 1) problems.push(`${where}: right answer missing`);
          const uniqueKeys: [string, (w: QuizWord) => string][] = [
            ["simplified", (w) => w.simplified],
            ["gloss", gloss],
            listening ? ["toned pinyin", toned] : ["pinyin_plain", plain],
          ];
          for (const [name, key] of uniqueKeys) {
            const values = words.map(key);
            if (new Set(values).size !== values.length) problems.push(`${where}: duplicate ${name} (${values.join(" | ")})`);
          }
          if (listening) {
            const homophones = words.filter((w) => w.id !== target.id && toned(w) === toned(target));
            if (homophones.length) problems.push(`${where}: homophone option ${homophones.map((w) => w.simplified).join(" ")}`);
            if (words.some((w) => w.id !== target.id && plain(w) === plain(target))) tonePairs++;
            if (options.some((o) => o.pinyin !== byId.get(o.id)!.pinyin)) problems.push(`${where}: option pinyin missing`);
          }
          const texts = options.map((o) => o.text.trim().toLowerCase());
          if (new Set(texts).size !== texts.length) problems.push(`${where}: duplicate option text (${texts.join(" | ")})`);
          const glossText = format === "meaning" || format === "listen_meaning";
          if (glossText && options.some((o) => o.text !== optionGloss(byId.get(o.id)!.gloss!))) {
            problems.push(`${where}: option text isn't the option gloss`);
          }
        }
      }
    }
  }

  const words = CHECKED_LEVELS.reduce((n, l) => n + byLevel.get(l)!.length, 0);
  console.log(`Checked ${counts.quiz} quiz and ${counts.listening} listening questions: ${words} words in HSK 1 to 4, ${rounds} rounds each.`);
  console.log(`Listening questions with a tone pair (same syllables, other tones): ${tonePairs} (${((100 * tonePairs) / Math.max(1, counts.listening)).toFixed(1)}%).`);
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
