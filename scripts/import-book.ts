// Loads one HSK Book lesson (docs/book-format.md) into books, book_lessons,
// book_sections and book_blocks, and its images into the private
// book-assets bucket.
//
//   pnpm import:book scripts/output/book/book-4a-lesson-01.json           dry run
//   pnpm import:book scripts/output/book/book-4a-lesson-01.json --write   write
//
// --write needs supabase/migrations/20270111120000_book.sql applied.
//
// The file is checked first, and nothing is written if anything fails:
//   - every Text ({zh, py}): one py syllable per Han character in zh
//     ({_} blanks and everything non-Han have none)
//   - section, block and item keys (and answer_keys) are unique
//   - pages never go down in array order
//   - choice, word_bank and image_match answers are among their labels,
//     passage_fill has one answer per {_}, each among the option labels
//   - every image src exists under scripts/output/book/assets/
//
// --write uploads the images (upsert, same path as src), then replaces the
// lesson in one call to import_book_lesson (one transaction: a failed
// import never leaves half a lesson). The lesson keeps its id; user
// answers, notes and progress reference keys and are untouched.
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";

const WRITE = hasFlag("--write");
const ASSETS_DIR = "scripts/output/book/assets";
const BUCKET = "book-assets";

const SECTION_KINDS = new Set(["objectives", "warmup", "text", "grammar", "exercises", "task", "summary"]);
const BLOCK_TYPES = new Set([
  "objectives", "instruction", "scene", "choice", "dialogue", "passage", "vocab", "prompts", "retell",
  "grammar", "dialogue_fill", "sentence_fill", "word_bank", "passage_fill", "image_match",
  "picture_write", "task", "self_check",
]);
const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
interface Block { key: string; type: string; page: number; source?: string; data: Obj }
interface Section { key: string; kind: string; label_zh: string; label_en: string; page: number; blocks: Block[] }
interface BookFile {
  book: { slug: string; title_zh: string; title_en: string; level: number; standard: string };
  lesson: { number: number; title: { zh: string; py: string }; title_en: string; page_start: number; page_end: number };
  sections: Section[];
}

const HAN = /\p{Script=Han}/gu;
const BLANK = /\{_\}/g;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const labels = (v: unknown) => new Set(arr(v).map((o) => o.label));
const blanks = (text: unknown) => (isObj(text) && typeof text.zh === "string" ? (text.zh.match(BLANK) ?? []).length : 0);

function check(file: BookFile) {
  const problems: string[] = [];
  const images = new Set<string>();

  // Texts and image srcs, anywhere in the file.
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (!isObj(v)) return;
    if (typeof v.zh === "string" && "py" in v) {
      const han = (v.zh.replace(BLANK, "").match(HAN) ?? []).length;
      const py = typeof v.py === "string" ? v.py.trim().split(/\s+/).filter(Boolean).length : -1;
      if (han !== py) problems.push(`${path}: ${han} Han characters, ${py} syllables: ${v.zh}`);
    }
    if (typeof v.src === "string") {
      images.add(v.src);
      if (!existsSync(join(ASSETS_DIR, v.src))) problems.push(`${path}: image ${v.src} not found under ${ASSETS_DIR}`);
    }
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(file, "file");

  // Keys and pages, in array order.
  const keys = new Map<string, string>();
  const addKey = (key: unknown, where: string) => {
    if (typeof key !== "string" || !key) return problems.push(`${where}: missing key`);
    const prev = keys.get(key);
    if (prev) problems.push(`${where}: key ${key} already used at ${prev}`);
    else keys.set(key, where);
  };
  let lastPage = -Infinity;
  const page = (p: unknown, where: string) => {
    if (typeof p !== "number") return problems.push(`${where}: page is not a number`);
    if (p < lastPage) problems.push(`${where}: page ${p} after page ${lastPage}`);
    lastPage = p;
  };

  if (!Array.isArray(file.sections) || !file.sections.length) problems.push("no sections");
  for (const s of file.sections ?? []) {
    addKey(s.key, `section ${s.key}`);
    page(s.page, `section ${s.key}`);
    if (!SECTION_KINDS.has(s.kind)) problems.push(`section ${s.key}: unknown kind ${s.kind}`);
    if (!Array.isArray(s.blocks)) {
      problems.push(`section ${s.key}: no blocks`);
      continue;
    }
    for (const b of s.blocks) {
      const at = `block ${b.key}`;
      addKey(b.key, at);
      page(b.page, at);
      if (!BLOCK_TYPES.has(b.type)) problems.push(`${at}: unknown type ${b.type}`);
      if (!isObj(b.data)) {
        problems.push(`${at}: no data`);
        continue;
      }
      const d = b.data;
      for (const list of ["items", "rows", "lines", "images"] as const) {
        arr(d[list]).forEach((item, i) => addKey(item.key, `${at} ${list}[${i}]`));
      }
      if (d.answer_key !== undefined) addKey(d.answer_key, `${at} answer_key`);

      if (b.type === "choice") {
        for (const it of arr(d.items)) {
          if (!labels(it.options).has(it.answer)) problems.push(`${at} ${it.key}: answer ${it.answer} not among the options`);
        }
      } else if (b.type === "word_bank") {
        const bank = labels(d.bank);
        for (const it of arr(d.items)) {
          if (!bank.has(it.answer)) problems.push(`${at} ${it.key}: answer ${it.answer} not in the bank`);
        }
      } else if (b.type === "image_match") {
        const opts = labels(d.options);
        for (const im of arr(d.images)) {
          if (!opts.has(im.answer)) problems.push(`${at} ${im.key}: answer ${im.answer} not among the options`);
        }
      } else if (b.type === "passage_fill") {
        const answers = Array.isArray(d.answers) ? d.answers : [];
        const n = blanks(d.text);
        if (n !== answers.length) problems.push(`${at}: ${n} blanks, ${answers.length} answers`);
        const opts = labels(d.options);
        for (const a of answers) if (!opts.has(a)) problems.push(`${at}: answer ${a} not among the options`);
      }
    }
  }

  return { problems, images: [...images] };
}

async function main() {
  const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!path || !existsSync(path)) {
    console.error("Usage: pnpm tsx scripts/import-book.ts <path to lesson JSON> [--write]");
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as BookFile;
  if (!isObj(file.book) || !isObj(file.lesson) || !Array.isArray(file.sections)) {
    console.error(`${path} isn't a book lesson file (book, lesson, sections): see docs/book-format.md.`);
    process.exit(1);
  }

  const { problems, images } = check(file);

  // ----- Summary -----

  const blocks = file.sections.flatMap((s) => s.blocks ?? []);
  const byType = new Map<string, number>();
  for (const b of blocks) byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
  const vocab = blocks.filter((b) => b.type === "vocab").reduce((n, b) => n + arr(b.data?.items).length, 0);

  console.log(`${file.book.title_zh} lesson ${file.lesson.number}: ${file.lesson.title?.zh} (pages ${file.lesson.page_start}-${file.lesson.page_end})`);
  console.log(`Sections:  ${file.sections.length}`);
  console.log(`Blocks:    ${blocks.length}`);
  for (const [type, n] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`  ${type.padEnd(14)} ${n}`);
  console.log(`Vocab:     ${vocab}`);
  console.log(`Images:    ${images.length}`);
  console.log(`Problems:  ${problems.length}`);
  for (const p of problems) console.log(`  x ${p}`);

  if (problems.length) {
    console.error("\nNothing was written. Fix the problems and run again.");
    process.exit(1);
  }
  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to import the lesson.");
    return;
  }

  // ----- Write -----

  const admin = createAdminClient();

  // Images first, so the lesson never points at a missing one.
  const failed = (
    await mapLimit(images, 4, async (src) => {
      const contentType = CONTENT_TYPES[extname(src).toLowerCase()] ?? "application/octet-stream";
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(src, readFileSync(join(ASSETS_DIR, src)), { upsert: true, contentType });
      if (error) console.error(`Upload ${src} failed:`, error.message);
      return error ? src : null;
    })
  ).filter(Boolean);
  if (failed.length) {
    console.error(`\n${failed.length} image upload(s) failed. The lesson wasn't written.`);
    process.exit(1);
  }
  console.log(`\nUploaded ${images.length} images to ${BUCKET}.`);

  const { data: lessonId, error } = await admin.rpc("import_book_lesson", {
    p_book: file.book,
    p_lesson: file.lesson,
    p_sections: file.sections as unknown as Json,
  });
  if (error) {
    console.error("import_book_lesson failed (nothing was changed):", error);
    process.exit(1);
  }
  console.log(`Imported lesson ${file.lesson.number}: ${file.sections.length} sections, ${blocks.length} blocks (lesson id ${lessonId}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
