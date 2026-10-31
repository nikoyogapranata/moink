// Seeds grammar_points from the 2025 syllabus list, and links the words of
// each word-list point to words.
//
//   pnpm exec tsx scripts/seed-grammar.ts           dry run: counts and reports
//   pnpm exec tsx scripts/seed-grammar.ts --write   insert and update
//
// --write needs supabase/migrations/20261228120000_grammar.sql applied.
//
// Source: scripts/data/grammar/krmanik-2025 (reference only, see
// scripts/lib/grammar.ts), with its known typos fixed. Every entry becomes
// a point, keyed by (standard, level, sort_order):
//   kind        'words' for 词类 / 语素 entries that list words; 'structure'
//               for the rest, including the 词类 entries that are really
//               patterns (AA、ABAB, 爱A不A) and the affixes (小—、—们)
//   name_zh     the most specific label (see nameOf in lib/grammar.ts)
//   pattern     only where the syllabus text already is a clean pattern,
//               and only while the row has none
//   level_2021, code_2021   the 2021 point (ivankra-2021) where the match
//               is confident, else null
// name_en, slug and the lessons come from scripts/import-grammar.ts.
//
// Words: each listed word is looked up by simplified form ("有（一）点儿"
// tries 有一点儿 and 有点儿, "都1" is 都), preferring the row whose 2025
// level is closest to the point's. An item that isn't a word of its own
// (这个, see SPLIT_ITEMS) is linked to its parts (这, 个).
//
// Running it twice changes nothing the second time. A point whose lesson
// is 'reviewed' is never touched, nor its word links.
//
// The dry run writes, to scripts/output/:
//   grammar-points.csv            every point as it would be seeded
//   grammar-2021-matches.csv      each point's 2021 match, or none
//   grammar-unmatched-words.csv   listed words not in words
import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";
import { writeCsv } from "./lib/csv";
import {
  LEVELS,
  POINT_COLUMNS,
  SPLIT_ITEMS,
  STANDARD,
  categoryPath,
  levelName,
  match2021,
  read2021,
  readSource,
  selectAll,
  type Match2021,
  type PointRow,
  type SourcePoint,
} from "./lib/grammar";
import { fetchWords, type WordRow } from "./lib/words";

const WRITE = hasFlag("--write");
const OUT = "scripts/output";
const BATCH_SIZE = 200;

/** The columns this script owns; the rest are the importer's. */
type Seeded = Pick<
  PointRow,
  "category" | "subcategory" | "detail" | "source_text" | "kind" | "name_zh" | "level_2021" | "code_2021"
> & { pattern?: string };

interface Link {
  word_id: number;
  sort_order: number;
}

interface Unmatched {
  point: SourcePoint;
  item: string;
  forms: string[];
}

const key = (p: { level: number; sort_order: number }) => `${p.level}|${p.sort_order}`;

function seededFields(p: SourcePoint, match: Match2021 | null): Seeded {
  return {
    category: p.category,
    subcategory: p.subcategory,
    detail: p.detail,
    source_text: p.source_text,
    kind: p.kind,
    name_zh: p.name_zh,
    level_2021: match?.point.level ?? null,
    code_2021: match?.point.code ?? null,
  };
}

/** The point's words, in list order: for each form, the row whose 2025
 *  level is closest to the point's (then the lowest id). An item none of
 *  whose forms is a word, but that's in SPLIT_ITEMS, links its parts;
 *  it's unmatched when any part is missing. */
function linkWords(p: SourcePoint, bySimplified: Map<string, WordRow[]>) {
  const links: Link[] = [];
  const unmatched: Unmatched[] = [];
  const seen = new Set<number>();
  const distance = (w: WordRow) => (w.hsk3_2025_level == null ? 99 : Math.abs(w.hsk3_2025_level - p.level));
  const closest = (form: string) =>
    [...(bySimplified.get(form) ?? [])].sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0];
  p.items.forEach(({ item, forms }, i) => {
    let words = forms.map(closest).filter((w): w is WordRow => !!w);
    const parts = SPLIT_ITEMS[item];
    if (!words.length && parts) {
      words = parts.map(closest).filter((w): w is WordRow => !!w);
      if (words.length < parts.length) words = [];
    }
    if (!words.length) {
      unmatched.push({ point: p, item, forms: parts ? [...forms, parts.join(" + ")] : forms });
      return;
    }
    for (const w of words) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      links.push({ word_id: w.id, sort_order: i + 1 });
    }
  });
  return { links, unmatched };
}

function printLevels(title: string, count: (level: number) => number | string) {
  console.log(`  ${title.padEnd(30)} ${LEVELS.map((l) => `${levelName(l)}: ${count(l)}`).join("  ")}`);
}

async function main() {
  const { points, unusedFixes } = readSource();
  const all2021 = read2021();
  const matches = new Map(points.map((p) => [p, match2021(p, all2021)]));

  const admin = createAdminClient();
  const { words } = await fetchWords(admin, undefined, "hsk3_2025_level");
  const bySimplified = new Map<string, WordRow[]>();
  for (const w of words) bySimplified.set(w.simplified, [...(bySimplified.get(w.simplified) ?? []), w]);

  const linksOf = new Map<SourcePoint, Link[]>();
  const unmatched: Unmatched[] = [];
  for (const p of points.filter((p) => p.kind === "words")) {
    const r = linkWords(p, bySimplified);
    linksOf.set(p, r.links);
    unmatched.push(...r.unmatched);
  }

  // ----- What's in the table -----

  const existing = await selectAll(admin, "grammar_points", POINT_COLUMNS, "id", { standard: STANDARD });
  const migrated = existing !== null;
  const lessons = (await selectAll(admin, "grammar_lessons", ["point_id", "status"], "point_id")) ?? [];
  const existingLinks = (await selectAll(admin, "grammar_point_words", ["point_id", "word_id", "sort_order"], "point_id")) ?? [];
  const reviewed = new Set(lessons.filter((l) => l.status === "reviewed").map((l) => l.point_id));
  const rowByKey = new Map((existing ?? []).map((r) => [key(r), r]));

  const inserts: SourcePoint[] = [];
  const updates: { row: PointRow; changes: Partial<Seeded> }[] = [];
  const locked: PointRow[] = [];
  let unchanged = 0;
  for (const p of points) {
    const row = rowByKey.get(key(p));
    if (!row) {
      inserts.push(p);
      continue;
    }
    if (reviewed.has(row.id)) {
      locked.push(row);
      continue;
    }
    const want: Seeded = seededFields(p, matches.get(p)!);
    if (row.pattern == null && p.pattern) want.pattern = p.pattern;
    const changes = Object.fromEntries(
      Object.entries(want).filter(([k, v]) => row[k as keyof PointRow] !== v),
    ) as Partial<Seeded>;
    if (Object.keys(changes).length) updates.push({ row, changes });
    else unchanged++;
  }
  const sourceKeys = new Set(points.map(key));
  const orphans = (existing ?? []).filter((r) => !sourceKeys.has(key(r)));

  // ----- Reports -----

  writeCsv(
    `${OUT}/grammar-points.csv`,
    ["level", "sort_order", "kind", "category_path", "name_zh", "pattern", "source_text", "code_2021", "words_linked", "note"],
    points.map((p) => [
      levelName(p.level),
      p.sort_order,
      p.kind,
      categoryPath(p).join(" / "),
      p.name_zh,
      p.pattern ?? "",
      p.source_text,
      matches.get(p)?.point.code ?? "",
      p.kind === "words" ? (linksOf.get(p)?.length ?? 0) : "",
      p.kindNote ?? "",
    ]),
  );
  writeCsv(
    `${OUT}/grammar-2021-matches.csv`,
    ["level", "sort_order", "kind", "name_zh", "source_text", "code_2021", "level_2021", "text_2021", "how"],
    points.map((p) => {
      const m = matches.get(p);
      return [
        levelName(p.level),
        p.sort_order,
        p.kind,
        p.name_zh,
        p.source_text,
        m?.point.code ?? "",
        m ? levelName(m.point.level) : "",
        m ? [m.point.category, m.point.details, m.point.content].filter(Boolean).join(" / ") : "",
        m?.how ?? "",
      ];
    }),
  );
  writeCsv(
    `${OUT}/grammar-unmatched-words.csv`,
    ["level", "sort_order", "name_zh", "item", "forms_tried"],
    unmatched.map((u) => [levelName(u.point.level), u.point.sort_order, u.point.name_zh, u.item, u.forms.join(" / ")]),
  );

  const at = (level: number) => points.filter((p) => p.level === level);
  console.log(`\nGrammar points (2025 syllabus): ${points.length}`);
  printLevels("structure", (l) => at(l).filter((p) => p.kind === "structure").length);
  printLevels("words", (l) => at(l).filter((p) => p.kind === "words").length);
  printLevels("pattern already clean", (l) => at(l).filter((p) => p.pattern).length);
  printLevels(
    "2021 match (of all)",
    (l) => `${at(l).filter((p) => matches.get(p)).length}/${at(l).length}`,
  );
  printLevels(
    "  of which moved level",
    (l) => at(l).filter((p) => matches.get(p) && matches.get(p)!.point.level !== l).length,
  );
  if (unusedFixes.length) console.log(`\nTypo fixes that no longer apply (the source changed?): ${unusedFixes.join("; ")}`);

  const moved = points.filter((p) => p.kindNote);
  console.log(`\n词类 / 语素 entries seeded as structure (${moved.length}):`);
  for (const p of moved) {
    console.log(`  ${levelName(p.level)}#${p.sort_order} ${categoryPath(p).join(" / ")} | ${p.source_text}  — ${p.kindNote}`);
  }

  const listed = points.filter((p) => p.kind === "words").reduce((n, p) => n + p.items.length, 0);
  const linked = [...linksOf.values()].reduce((n, l) => n + l.length, 0);
  console.log(`\nWord lists: ${listed} listed words, ${linked} links, ${unmatched.length} not in words:`);
  for (const level of LEVELS) {
    const here = unmatched.filter((u) => u.point.level === level);
    if (here.length) console.log(`  ${levelName(level)}: ${here.map((u) => u.item).join(" ")}`);
  }

  const names = new Map<string, number>();
  for (const p of points) names.set(`${levelName(p.level)} ${p.name_zh}`, (names.get(`${levelName(p.level)} ${p.name_zh}`) ?? 0) + 1);
  const shared = [...names].filter(([, n]) => n > 1).map(([name]) => name);
  if (shared.length) console.log(`\nname_zh shared within a level: ${shared.join("; ")}`);

  console.log(`\nReports: ${OUT}/grammar-points.csv, grammar-2021-matches.csv, grammar-unmatched-words.csv`);

  if (!migrated) {
    console.log("\nNote: 20261228120000_grammar.sql isn't applied yet, so everything reads as new.");
  }
  console.log(
    `\nPlan: insert ${inserts.length}, update ${updates.length}, unchanged ${unchanged}, ` +
      `reviewed (left alone) ${locked.length}.`,
  );
  if (orphans.length) {
    console.log(`In the table but not in the source (left alone): ${orphans.map((r) => `${levelName(r.level)}#${r.sort_order}`).join(", ")}`);
  }

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to insert and update.");
    return;
  }
  if (!migrated) {
    console.error("--write needs the grammar migration. Run it first.");
    process.exit(1);
  }

  // ----- Write -----

  const idByKey = new Map((existing ?? []).map((r) => [key(r), r.id]));
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE).map((p) => ({
      standard: STANDARD,
      level: p.level,
      sort_order: p.sort_order,
      ...seededFields(p, matches.get(p)!),
      pattern: p.pattern,
    }));
    const { data, error } = await admin.from("grammar_points").insert(batch).select("id, level, sort_order");
    if (error) {
      console.error(`Insert batch ${i / BATCH_SIZE + 1} failed:`, error);
      continue;
    }
    for (const r of data as { id: number; level: number; sort_order: number }[]) idByKey.set(key(r), r.id);
    inserted += data.length;
  }
  console.log(`\nInserted ${inserted} of ${inserts.length} points.`);

  let updated = 0;
  await mapLimit(updates, 10, async ({ row, changes }) => {
    const { error } = await admin
      .from("grammar_points")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) console.error(`Update of point ${row.id} failed:`, error);
    else updated++;
  });
  console.log(`Updated ${updated} of ${updates.length} points.`);

  // Word links: add what's missing, fix the order, drop what's no longer
  // listed. Points with a reviewed lesson keep theirs.
  const have = new Map<number, Map<number, number>>();
  for (const l of existingLinks) {
    if (!have.has(l.point_id)) have.set(l.point_id, new Map());
    have.get(l.point_id)!.set(l.word_id, l.sort_order);
  }
  const add: (Link & { point_id: number })[] = [];
  const reorder: (Link & { point_id: number })[] = [];
  const drop: { point_id: number; word_id: number }[] = [];
  for (const p of points) {
    const id = idByKey.get(key(p));
    if (id === undefined || reviewed.has(id)) continue;
    const want = linksOf.get(p) ?? [];
    const current = have.get(id) ?? new Map<number, number>();
    for (const l of want) {
      if (!current.has(l.word_id)) add.push({ point_id: id, ...l });
      else if (current.get(l.word_id) !== l.sort_order) reorder.push({ point_id: id, ...l });
    }
    const wanted = new Set(want.map((l) => l.word_id));
    for (const word_id of current.keys()) if (!wanted.has(word_id)) drop.push({ point_id: id, word_id });
  }
  for (let i = 0; i < add.length; i += 500) {
    const { error } = await admin.from("grammar_point_words").insert(add.slice(i, i + 500));
    if (error) console.error("Link insert failed:", error);
  }
  await mapLimit(reorder, 10, async (l) => {
    const { error } = await admin
      .from("grammar_point_words")
      .update({ sort_order: l.sort_order })
      .match({ point_id: l.point_id, word_id: l.word_id });
    if (error) console.error(`Link reorder ${l.point_id}/${l.word_id} failed:`, error);
  });
  await mapLimit(drop, 10, async (l) => {
    const { error } = await admin.from("grammar_point_words").delete().match(l);
    if (error) console.error(`Link delete ${l.point_id}/${l.word_id} failed:`, error);
  });
  console.log(`Word links: ${add.length} added, ${reorder.length} reordered, ${drop.length} removed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
