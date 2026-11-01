// Loads a filled drafting file from scripts/export-grammar.ts back into
// grammar_points (name_en, slug, pattern), grammar_lessons and
// grammar_examples.
//
//   pnpm exec tsx scripts/import-grammar.ts scripts/output/grammar-level-1.json           dry run
//   pnpm exec tsx scripts/import-grammar.ts scripts/output/grammar-level-1.json --write   write
//
// --write needs supabase/migrations/20261228120000_grammar.sql applied and
// the points seeded (scripts/seed-grammar.ts --write).
//
// Points with nothing written (no name_en, summary or examples) are
// skipped. Every other point is checked, and written only when it passes:
//   - the content (lib/grammar-file.ts): pattern_parts roles, section
//     kinds, mistakes items, 6 to 8 examples, each highlight in its hanzi,
//     a unique slug, related points that exist
//   - each example (lib/grammar-check.ts): no word above the point's level
//     (names and numbers aside), which also gives max_word_level; pinyin
//     whose syllables don't fit the hanzi is flagged, and blocks a point
//     marked reviewed
// A point is written as 'reviewed' (lesson and examples) only when the
// file says "reviewed": true, else as 'draft'. A point that's reviewed in
// the database and not marked reviewed in the file is left alone, so a
// stale draft can't overwrite reviewed content.
import { existsSync, readFileSync } from "node:fs";

import { createAdminClient, hasFlag } from "./lib/admin";
import {
  POINT_COLUMNS,
  STANDARD,
  levelName,
  selectAll,
  type PointRow,
} from "./lib/grammar";
import { buildLexicon, checkExample, type CheckResult } from "./lib/grammar-check";
import { isDrafted, validatePoint, type FilePoint, type GrammarFile } from "./lib/grammar-file";
import { fetchWords } from "./lib/words";

const WRITE = hasFlag("--write");

interface Planned {
  fp: FilePoint;
  row: PointRow | undefined;
  errors: string[];
  notes: string[];
  checks: CheckResult[];
  relatedIds: number[];
}

const label = (p: { level: number; sort_order: number }) => `${levelName(p.level)}#${p.sort_order}`;

async function main() {
  const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!path || !existsSync(path)) {
    console.error("Usage: tsx scripts/import-grammar.ts <path to filled JSON> [--write]");
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as GrammarFile;
  if (file.standard !== STANDARD || !Array.isArray(file.points)) {
    console.error(`${path} isn't a grammar file from export-grammar.ts (standard ${STANDARD}, a points list).`);
    process.exit(1);
  }

  const admin = createAdminClient();
  const dbPoints = await selectAll(admin, "grammar_points", POINT_COLUMNS, "id", { standard: STANDARD });
  const lessons = (await selectAll(admin, "grammar_lessons", ["point_id", "status"], "point_id")) ?? [];
  const reviewedInDb = new Set(lessons.filter((l) => l.status === "reviewed").map((l) => l.point_id));
  const byId = new Map((dbPoints ?? []).map((r) => [r.id, r]));
  const byKey = new Map((dbPoints ?? []).map((r) => [label(r), r]));
  const bySlug = new Map((dbPoints ?? []).filter((r) => r.slug).map((r) => [r.slug!, r]));

  const { words } = await fetchWords(admin, undefined, "hsk3_2025_level");
  const lex = buildLexicon(words);

  const drafted = file.points.filter(isDrafted);
  const skipped = file.points.length - drafted.length;

  // Slugs in this file, to resolve related and catch duplicates.
  const fileSlugs = new Map<string, FilePoint>();
  for (const fp of drafted) if (typeof fp.slug === "string" && fp.slug && !fileSlugs.has(fp.slug)) fileSlugs.set(fp.slug, fp);

  const planned: Planned[] = drafted.map((fp) => {
    const errors = validatePoint(fp);
    const notes: string[] = [];

    const row = fp.id != null ? byId.get(fp.id) : byKey.get(label(fp));
    if (dbPoints) {
      if (!row) errors.push(fp.id != null ? `no point with id ${fp.id}` : `no point ${label(fp)} in the database`);
      else if (row.level !== fp.level || row.sort_order !== fp.sort_order) {
        errors.push(`id ${row.id} is ${label(row)} in the database, the file says ${label(fp)}`);
      } else if (row.kind !== "structure") errors.push("a word-list point: lessons are for structure points");
      if (row && reviewedInDb.has(row.id) && fp.reviewed !== true) {
        errors.push('reviewed in the database: set "reviewed": true to change it');
      }
    }

    if (fileSlugs.get(fp.slug) !== fp && drafted.some((o) => o !== fp && o.slug === fp.slug)) {
      errors.push(`slug "${fp.slug}" is used by another point in the file`);
    }
    const owner = bySlug.get(fp.slug);
    if (owner && owner.id !== row?.id) errors.push(`slug "${fp.slug}" belongs to ${label(owner)} in the database`);

    // related: slugs in this file or the database, or ids in the database.
    const relatedIds: number[] = [];
    for (const r of Array.isArray(fp.related) ? fp.related : []) {
      if (typeof r === "number") {
        if (!dbPoints) notes.push(`related id ${r} not checked (no database table)`);
        else if (!byId.has(r)) errors.push(`related id ${r} doesn't exist`);
        else relatedIds.push(r);
        continue;
      }
      const target = fileSlugs.get(r);
      const targetRow = target ? (target.id != null ? byId.get(target.id) : byKey.get(label(target))) : bySlug.get(r);
      if (targetRow) relatedIds.push(targetRow.id);
      else if (target && !dbPoints) notes.push(`related "${r}" is in the file (id once seeded)`);
      else errors.push(`related "${r}" isn't a slug in this file or the database`);
    }
    if (row && relatedIds.includes(row.id)) errors.push("related lists the point itself");

    const checks = (Array.isArray(fp.examples) ? fp.examples : []).map((e) =>
      typeof e?.hanzi === "string" && typeof e?.pinyin === "string"
        ? checkExample(e, fp.level, lex)
        : { maxWordLevel: null, failures: [], warnings: [], pinyinFlags: [] },
    );
    checks.forEach((c, i) => {
      const hanzi = fp.examples[i].hanzi;
      if (c.failures.length) errors.push(`examples[${i}] ${hanzi}: above level ${levelName(fp.level)}: ${c.failures.join(", ")}`);
      if (c.pinyinFlags.length) {
        const msg = `examples[${i}] ${hanzi}: pinyin ${c.pinyinFlags.join("; ")}`;
        if (fp.reviewed === true) errors.push(`${msg} (blocks reviewed)`);
        else notes.push(msg);
      }
      if (c.warnings.length) notes.push(`examples[${i}] ${hanzi}: ${c.warnings.join(", ")}`);
    });

    return { fp, row, errors, notes, checks, relatedIds: [...new Set(relatedIds)] };
  });

  // ----- Report -----

  for (const p of planned) {
    const status = p.errors.length ? "ERROR" : p.fp.reviewed ? "reviewed" : "draft";
    console.log(`\n${label(p.fp)} ${p.fp.name_zh} -> ${status}`);
    for (const e of p.errors) console.log(`  x ${e}`);
    for (const n of p.notes) console.log(`  ! ${n}`);
  }
  const ready = planned.filter((p) => !p.errors.length);
  console.log(`\nPoints in file:   ${file.points.length}`);
  console.log(`Not drafted:      ${skipped} (skipped)`);
  console.log(`With errors:      ${planned.length - ready.length} (not written)`);
  console.log(`Ready:            ${ready.length} (${ready.filter((p) => p.fp.reviewed).length} reviewed, ${ready.filter((p) => !p.fp.reviewed).length} draft)`);
  if (!dbPoints) console.log("\nNote: 20261228120000_grammar.sql isn't applied yet: points, slugs and related ids weren't checked against the database.");

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to write the ready points.");
    return;
  }
  if (!dbPoints) {
    console.error("--write needs the grammar migration and seeded points. Run them first.");
    process.exit(1);
  }

  // ----- Write -----

  let written = 0;
  for (const { fp, row, checks, relatedIds } of ready) {
    const id = row!.id;
    const status = fp.reviewed ? "reviewed" : "draft";
    const now = new Date().toISOString();
    const fail = (step: string, error: unknown) => console.error(`${label(fp)} ${step} failed:`, error);

    const point = await admin
      .from("grammar_points")
      .update({ name_en: fp.name_en.trim(), slug: fp.slug, pattern: fp.pattern.trim(), updated_at: now })
      .eq("id", id);
    if (point.error) {
      fail("point", point.error);
      continue;
    }

    const lesson = await admin.from("grammar_lessons").upsert(
      {
        point_id: id,
        summary: fp.summary.trim(),
        pattern_parts: fp.pattern_parts,
        sections: fp.sections,
        related_point_ids: relatedIds,
        status,
        reviewed_at: fp.reviewed ? now : null,
        updated_at: now,
      },
      { onConflict: "point_id" },
    );
    if (lesson.error) {
      fail("lesson", lesson.error);
      continue;
    }

    // Upsert by position, then drop positions past the new last one, so
    // the point is never left without examples.
    const examples = await admin.from("grammar_examples").upsert(
      fp.examples.map((e, i) => ({
        point_id: id,
        sort_order: i + 1,
        hanzi: e.hanzi.trim(),
        pinyin: e.pinyin.trim(),
        translation: e.translation.trim(),
        literal: e.literal?.trim() || null,
        highlight: e.highlight,
        difficulty: e.difficulty,
        status,
        max_word_level: checks[i].maxWordLevel,
        updated_at: now,
      })),
      { onConflict: "point_id,sort_order" },
    );
    if (examples.error) {
      fail("examples", examples.error);
      continue;
    }
    const extra = await admin.from("grammar_examples").delete().eq("point_id", id).gt("sort_order", fp.examples.length);
    if (extra.error) {
      fail("old examples", extra.error);
      continue;
    }
    written++;
  }
  console.log(`\nWrote ${written} of ${ready.length} points.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
