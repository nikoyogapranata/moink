// Exports one level's grammar points as JSON, to draft their lessons.
//
//   pnpm exec tsx scripts/export-grammar.ts --level 1            from the database
//   pnpm exec tsx scripts/export-grammar.ts --level 1 --source   from the syllabus (no ids yet)
//   ... --force                                                  overwrite an existing file
//
// Writes scripts/output/grammar-level-<N>.json (N = 1 to 6, or 7 for
// bands 7 to 9): every 'structure' point of the level, with the slots to
// fill (name_en, slug, pattern, pattern_parts, summary, sections, related,
// examples), and the level's word-list points for context. Slots hold what
// the database already has, so re-exporting doesn't lose a draft; the seed
// fills pattern where the syllabus text was already clean.
//
// --source builds the file from scripts/data/grammar without the
// database, for drafting before the migration and seed: points then have
// id null, and the importer finds them by level and sort_order.
//
// Load the filled file with scripts/import-grammar.ts. An existing file is
// never overwritten without --force: it may hold a draft.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { createAdminClient, hasFlag } from "./lib/admin";
import {
  EXAMPLE_COLUMNS,
  LESSON_COLUMNS,
  POINT_COLUMNS,
  ROLES,
  SECTION_KINDS,
  STANDARD,
  categoryPath,
  levelArg,
  match2021,
  read2021,
  readSource,
  selectAll,
} from "./lib/grammar";
import type { FileExample, FilePoint, GrammarFile } from "./lib/grammar-file";

const OUT = "scripts/output";

function emptySlots(): Pick<
  FilePoint,
  "reviewed" | "name_en" | "slug" | "pattern" | "pattern_parts" | "summary" | "sections" | "related" | "examples"
> {
  return { reviewed: false, name_en: "", slug: "", pattern: "", pattern_parts: [], summary: "", sections: [], related: [], examples: [] };
}

async function fromDatabase(level: number) {
  const admin = createAdminClient();
  const points = await selectAll(admin, "grammar_points", POINT_COLUMNS, "sort_order", { standard: STANDARD, level });
  if (points === null) {
    console.error("No grammar_points table yet: run 20261228120000_grammar.sql (or use --source).");
    process.exit(1);
  }
  if (!points.length) {
    console.error(`No points at level ${level}: run scripts/seed-grammar.ts --write first (or use --source).`);
    process.exit(1);
  }
  const lessons = (await selectAll(admin, "grammar_lessons", LESSON_COLUMNS, "point_id")) ?? [];
  const examples = (await selectAll(admin, "grammar_examples", EXAMPLE_COLUMNS, "sort_order")) ?? [];
  const slugs = (await selectAll(admin, "grammar_points", ["id", "slug"], "id")) ?? [];
  const slugOf = new Map(slugs.map((p) => [p.id, p.slug]));
  const lessonOf = new Map(lessons.map((l) => [l.point_id, l]));

  const structure: FilePoint[] = points
    .filter((p) => p.kind === "structure")
    .map((p) => {
      const lesson = lessonOf.get(p.id);
      return {
        id: p.id,
        level: p.level,
        sort_order: p.sort_order,
        category_path: categoryPath(p),
        name_zh: p.name_zh,
        source_text: p.source_text,
        code_2021: p.code_2021,
        ...emptySlots(),
        reviewed: lesson?.status === "reviewed",
        name_en: p.name_en ?? "",
        slug: p.slug ?? "",
        pattern: p.pattern ?? "",
        pattern_parts: lesson?.pattern_parts ?? [],
        summary: lesson?.summary ?? "",
        sections: lesson?.sections ?? [],
        // Slugs where the related point has one, else its id.
        related: (lesson?.related_point_ids ?? []).map((id) => slugOf.get(id) ?? id),
        examples: examples
          .filter((e) => e.point_id === p.id)
          .map(({ hanzi, pinyin, translation, literal, highlight, difficulty }): FileExample => ({
            hanzi,
            pinyin,
            translation,
            ...(literal ? { literal } : {}),
            highlight,
            difficulty,
          })),
      };
    });
  const wordLists = points.filter((p) => p.kind === "words").map((p) => ({ sort_order: p.sort_order, name_zh: p.name_zh, source_text: p.source_text }));
  return { structure, wordLists, source: "database" as const };
}

function fromSource(level: number) {
  const all2021 = read2021();
  const points = readSource().points.filter((p) => p.level === level);
  const structure: FilePoint[] = points
    .filter((p) => p.kind === "structure")
    .map((p) => ({
      id: null,
      level: p.level,
      sort_order: p.sort_order,
      category_path: categoryPath(p),
      name_zh: p.name_zh,
      source_text: p.source_text,
      code_2021: match2021(p, all2021)?.point.code ?? null,
      ...emptySlots(),
      pattern: p.pattern ?? "",
    }));
  const wordLists = points.filter((p) => p.kind === "words").map((p) => ({ sort_order: p.sort_order, name_zh: p.name_zh, source_text: p.source_text }));
  return { structure, wordLists, source: "syllabus" as const };
}

async function main() {
  const level = levelArg();
  if (level === undefined) {
    console.error("Usage: tsx scripts/export-grammar.ts --level <1-6 | 7-9> [--source] [--force]");
    process.exit(1);
  }
  const path = `${OUT}/grammar-level-${level}.json`;
  if (existsSync(path) && !hasFlag("--force")) {
    console.error(`${path} exists and may hold a draft. Import it first, or re-run with --force to overwrite it.`);
    process.exit(1);
  }

  const { structure, wordLists, source } = hasFlag("--source") ? fromSource(level) : await fromDatabase(level);
  const file: GrammarFile = {
    standard: STANDARD,
    level,
    exported_at: new Date().toISOString(),
    source,
    how_to: [
      "Fill name_en, slug, pattern, pattern_parts, summary, sections, related and 6 to 8 examples for each point.",
      "Points with no name_en, summary or examples are skipped on import.",
      'Set "reviewed": true only on points you have checked; the rest import as draft.',
      "related: slugs (or ids) of other points. Every example's highlight must appear in its hanzi.",
      "pattern_parts: [{ text, label, role }]. sections: [{ kind, title, body }]; a mistakes section also has items: [{ wrong, right, reason }]. A recap section (in short) shows as a card after the other sections.",
      "Each example may have literal: a word-by-word translation (optional).",
    ],
    roles: [...ROLES],
    section_kinds: [...SECTION_KINDS],
    example_template: { hanzi: "", pinyin: "", translation: "", literal: "", highlight: "", difficulty: 1 },
    word_lists: wordLists,
    points: structure,
  };

  mkdirSync(OUT, { recursive: true });
  const json = JSON.stringify(file, null, 2) + "\n";
  writeFileSync(path, json, "utf8");
  console.log(
    `Level ${level === 7 ? "7-9" : level} (${source}): ${structure.length} structure points, ` +
      `${wordLists.length} word lists -> ${path} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`,
  );
  if (source === "syllabus") console.log("  ids are null: the importer finds each point by level and sort_order.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
