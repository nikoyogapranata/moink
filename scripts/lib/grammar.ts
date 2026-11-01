// Grammar points of the HSK 3.0 2025 syllabus, as the grammar scripts
// (seed-grammar, export-grammar, import-grammar, check-grammar-examples)
// read and write them.
//
// The point list comes from scripts/data/grammar/krmanik-2025 (reference
// only: its grammar files have no license, so nothing users see is taken
// from it), cross-checked against the 2021 standard in ivankra-2021 (MIT).
// See scripts/data/grammar/SOURCES.md. Levels are 1 to 7, 7 for bands 7
// to 9, as in words.
import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  GrammarPatternPart,
  GrammarRole,
  GrammarSection,
  GrammarSectionKind,
} from "../../src/lib/supabase/database.types";
import type { createAdminClient } from "./admin";
import { readCsv } from "./csv";

export type { GrammarPatternPart as PatternPart, GrammarSection as Section };

export const STANDARD: Row<"grammar_points">["standard"] = "hsk3_2025";
export const LEVELS = [1, 2, 3, 4, 5, 6, 7];
export const levelName = (level: number) => (level === 7 ? "7-9" : String(level));

export const ROLES: readonly GrammarRole[] = ["subject", "object", "marker", "verb", "adjective", "number", "time", "place", "other"];
export const SECTION_KINDS: readonly GrammarSectionKind[] = [
  "build",
  "variations",
  "negative",
  "questions",
  "mistakes",
  "compare",
  "notes",
  "how",
  "when",
  "recap",
];
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DIR = "scripts/data/grammar";
const HAN = /\p{Script=Han}/u;

/** "--level 3" or "--level 7-9" -> 3 / 7; undefined without the flag. */
export function levelArg(): number | undefined {
  const args = process.argv.slice(2);
  const at = args.indexOf("--level");
  if (at === -1) return undefined;
  const value = args[at + 1];
  const level = value === "7-9" ? 7 : Number(value);
  if (!LEVELS.includes(level)) {
    console.error(`--level takes 1 to 6 or 7-9 (7), not "${value ?? ""}".`);
    process.exit(1);
  }
  return level;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** A pattern as moink writes it: no spaces, ellipses as "……", ASCII
 *  comma and brackets full-width. */
export function normalizePattern(s: string) {
  return s
    .replace(/[\s　]+/g, "")
    .replace(/(?:…|⋯|\.{3})+/g, "……")
    .replace(/,/g, "，")
    .replace(/\(/g, "（")
    .replace(/\)/g, "）");
}

/** Sub-item markers: （1）, ①. */
const ENUM = /（\d+）|[①②③④⑤⑥⑦⑧⑨]/g;

/** The entry's text without sub-item markers, normalized. */
const core = (text: string) => normalizePattern(text).replace(ENUM, "").replace(/^：|：$/g, "");

/** Has a slot or a gap: "A比B+形容词", "虽然……，但是……". */
const isPattern = (s: string) => /[+…A-Z]/.test(s);
/** Says what a form does rather than naming it: "表示领有". */
const isDescription = (s: string) => /^(表示|表|强调|用)/.test(s);

/** A sense number after a word: "都1" -> "都". */
const dropSense = (s: string) => s.replace(/([\p{Script=Han}）])\d+$/u, "$1");

/** "有（一）点儿" -> ["有一点儿", "有点儿"]. */
function expandOptional(s: string): string[] {
  const m = /^(.*?)（([^）]*)）(.*)$/.exec(s);
  if (!m) return [s];
  return [...expandOptional(m[1] + m[2] + m[3]), ...expandOptional(m[1] + m[3])];
}

/** List items that aren't words of their own, linked to their parts. */
export const SPLIT_ITEMS: Record<string, string[]> = {
  这个: ["这", "个"],
  那个: ["那", "个"],
};

/** The words a list item stands for: "二/两" -> 二, 两; "没（有）" -> 没有, 没. */
export function formsOf(item: string) {
  return [...new Set(dropSense(item).split("/").flatMap(expandOptional).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// The 2025 syllabus
// ---------------------------------------------------------------------------

interface RawEntry {
  类别: string;
  类别名称: string;
  细目: string;
  语法内容: string;
}

type Field = keyof RawEntry;

/** Known typos in the source, fixed as it's read. */
const FIXES: { field: Field; from: string; to: string }[] = [
  { field: "语法内容", from: "句公斤", to: "句、公斤" },
  { field: "细目", from: "其 他", to: "其他" },
  { field: "语法内容", from: "所处+是+名词", to: "处所+是+名词" },
];

/** Labels that group entries without naming them (其他, 四字格 ...). */
const GENERIC_LABELS = new Set([
  "其他",
  "其他（话语标记）",
  "四字格",
  "单句",
  "基本结构类型",
  "其他结构类型",
  "结构类型",
  "固定短语",
  "数的表达法",
  "数的表示法",
  "时间表示法",
]);

export interface ListItem {
  /** As the syllabus lists it: "都1", "有（一）点儿". */
  item: string;
  /** The words it stands for, to look up. */
  forms: string[];
}

export interface SourcePoint {
  level: number;
  /** Position in the level's list, from 1. */
  sort_order: number;
  category: string | null;
  subcategory: string | null;
  detail: string | null;
  /** 语法内容, with the typo fixes. */
  source_text: string;
  kind: "words" | "structure";
  /** Why a 词类 / 语素 entry is 'structure'; null otherwise. */
  kindNote: string | null;
  name_zh: string;
  /** Only where the syllabus text is already a clean pattern. */
  pattern: string | null;
  /** 'words' points: the listed items, in order. */
  items: ListItem[];
}

/** The items of a word list ("专用名量词：本、个、家" -> 本, 个, 家), or
 *  null when the entry isn't one. */
function listItems(content: string) {
  let s = core(content);
  const colon = s.lastIndexOf("：");
  if (colon !== -1) s = s.slice(colon + 1);
  const items = s.split("、").filter(Boolean);
  return items.length && items.every((i) => /^[\p{Script=Han}（）—/\d]+$/u.test(i)) ? items : null;
}

/** 'words' for a 词类 / 语素 entry that lists words; 'structure' for the
 *  rest, including (decided 2026-10-31) reduplications (AA、ABAB, 个个), the
 *  non-interrogative uses of question words, 爱A不A, and affixes (小—、
 *  —们: morphemes, taught as patterns, not linked to words). */
function classify(e: RawEntry): Pick<SourcePoint, "kind" | "kindNote" | "items"> {
  const structure = (kindNote: string | null) => ({ kind: "structure" as const, kindNote, items: [] });
  if (e.类别 === "语素") return structure("affixes: morphemes, not words");
  if (e.类别 !== "词类") return structure(null);
  if (e.细目.includes("重叠")) return structure(`a reduplication pattern (${e.细目})`);
  if (e.语法内容.includes("用法")) return structure("a usage pattern, not a word list");
  const items = listItems(e.语法内容);
  if (!items) return structure("a pattern, not a word list");
  return { kind: "words", kindNote: null, items: items.map((item) => ({ item, forms: formsOf(item) })) };
}

/** The most specific label: the entry's own name when its text is one
 *  ("联合短语", "越来越"), else the pattern or description with its label
 *  ("比较句1：A比B+形容词"), or the label alone when there's no text. */
function nameOf(e: RawEntry, kind: SourcePoint["kind"]) {
  const label = e.细目 || e.类别名称 || e.类别;
  const text = core(e.语法内容);
  if (kind === "words") {
    // "引出对象" says what a 介词 does, not that it is one.
    return e.细目 && e.类别名称 && !e.细目.endsWith(e.类别名称) ? `${e.类别名称}（${e.细目}）` : label;
  }
  if (!text) return label;
  // Affixes: "前缀：小—、第—".
  if (e.类别 === "语素") return `${label}：${text}`;
  const left = text.split("：")[0];
  if (text.includes("：") && !isPattern(left) && !isDescription(left)) return text;
  if (!isPattern(text) && !isDescription(text)) return text;
  return !label || GENERIC_LABELS.has(label) ? text : `${label}：${text}`;
}

/** The pattern, when the syllabus text already is one: "（1）A比B+形容词"
 *  -> "A比B+形容词", "序数表达法1：第+数词" -> "第+数词". */
function cleanPattern(e: RawEntry, kind: SourcePoint["kind"]) {
  if (kind === "words" || /[①-⑨]/.test(e.语法内容)) return null;
  const parts = core(e.语法内容).split("：");
  const last = parts[parts.length - 1];
  if (!last || !isPattern(last) || /表示|强调|用“|用法/.test(last)) return null;
  if (parts.slice(0, -1).some(isPattern)) return null;
  return last;
}

export interface SourceRead {
  points: SourcePoint[];
  /** Fixes that didn't apply: the source changed, check FIXES. */
  unusedFixes: string[];
}

/** Every entry of the 2025 syllabus, levels 1 to 7-9, in order. */
export function readSource(): SourceRead {
  const used = new Set<number>();
  const points: SourcePoint[] = [];
  for (const level of LEVELS) {
    const raw = JSON.parse(readFileSync(`${DIR}/krmanik-2025/HSK ${levelName(level)}.json`, "utf8")) as RawEntry[];
    raw.forEach((entry, i) => {
      const e = { ...entry };
      FIXES.forEach((fix, f) => {
        if (e[fix.field].includes(fix.from)) {
          e[fix.field] = e[fix.field].replace(fix.from, fix.to);
          used.add(f);
        }
      });
      for (const field of Object.keys(e) as Field[]) e[field] = e[field].trim();
      const kind = classify(e);
      points.push({
        level,
        sort_order: i + 1,
        category: e.类别 || null,
        subcategory: e.类别名称 || null,
        detail: e.细目 || null,
        source_text: e.语法内容,
        ...kind,
        name_zh: nameOf(e, kind.kind),
        pattern: cleanPattern(e, kind.kind),
      });
    });
  }

  // A shared name within a level (能愿动词 three times at level 1): add the
  // list or text to tell them apart.
  const key = (p: SourcePoint) => `${p.level}|${p.name_zh}`;
  const counts = new Map<string, number>();
  for (const p of points) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
  for (const p of points) {
    if (counts.get(key(p))! < 2) continue;
    const text = core(p.source_text);
    if (text && p.name_zh !== text && !p.name_zh.endsWith(`：${text}`)) p.name_zh = `${p.name_zh}：${text}`;
  }

  return { points, unusedFixes: FIXES.filter((_, f) => !used.has(f)).map((f) => `${f.from} -> ${f.to}`) };
}

export const categoryPath = (p: { category: string | null; subcategory: string | null; detail: string | null }) =>
  [p.category, p.subcategory, p.detail].filter((s): s is string => !!s);

// ---------------------------------------------------------------------------
// The 2021 standard (ivankra-2021) and matching
// ---------------------------------------------------------------------------

export interface Point2021 {
  level: number;
  /** 一01 ... 六67, 七—九001 ... 七—九148, from the row's place in its level. */
  code: string;
  group: string;
  category: string;
  details: string;
  content: string;
}

const CODE_PREFIX = ["一", "二", "三", "四", "五", "六", "七—九"];
/** Points per level in GF 0025-2021. */
const COUNTS_2021 = [48, 81, 81, 76, 71, 67, 148];

/** The 2021 points. The CSV has one row per point, in the standard's
 *  order, plus "※ see ..." cross-reference rows, which are skipped; a
 *  point's code is its place in the level. */
export function read2021(): Point2021[] {
  const rows = readCsv(`${DIR}/ivankra-2021/hsk30-grammar.csv`);
  const points: Point2021[] = [];
  const seen = new Map<number, number>();
  for (const r of rows) {
    const fields = [r.Group, r.Category, r.Details, r.Content].map((s) => (s ?? "").trim());
    if (fields.some((s) => s.startsWith("※"))) continue;
    const level = r.Level === "7-9" ? 7 : Number(r.Level);
    const n = (seen.get(level) ?? 0) + 1;
    seen.set(level, n);
    const code = `${CODE_PREFIX[level - 1]}${String(n).padStart(level === 7 ? 3 : 2, "0")}`;
    const [group, category, details, content] = fields;
    points.push({ level, code, group, category, details, content });
  }
  const counts = LEVELS.map((l) => seen.get(l) ?? 0);
  if (counts.some((c, i) => c !== COUNTS_2021[i])) {
    throw new Error(`ivankra-2021 points per level ${counts.join("/")}, expected ${COUNTS_2021.join("/")}: the file changed`);
  }
  return points;
}

/** For comparing text: no punctuation, gaps, markers or sense numbers. */
function norm(s: string) {
  return normalizePattern(s)
    .replace(ENUM, "")
    .replace(/([\p{Script=Han}）A-Z])\d+/gu, "$1")
    .replace(/[“”"'‘’：:，。；;、/…\-—（）()·？?！!※]/g, "");
}

/** Variant labels for the same kind of word between the two standards. */
const normLabel = (s: string) =>
  norm(s)
    .replace(/(协同|重复)/g, "")
    .replace(/^连接(词或短语|词语或短语|词或词组|词或者短语)$/, "连接词或短语")
    .replace(/^连接分句或者?句子$/, "连接分句或句子");

function bigrams(s: string) {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return a === b ? 1 : 0;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return (2 * shared) / (A.size + B.size);
}

/** Text that says nothing on its own: every 复句 has these sub-items. */
const GENERIC_KEYS = new Set(["不用关联词语", "用关联词语"]);

/** Comparable pieces of a text: the whole, each sub-item, and what follows
 *  a label ("比较句2：（1）A比B..." -> "A比B..."). */
function keysOf(texts: string[]) {
  const out = new Set<string>();
  const add = (s: string) => {
    const k = norm(s);
    if (k.length >= 2 && !GENERIC_KEYS.has(k)) out.add(k);
  };
  for (const t of texts.filter(Boolean)) {
    const c = normalizePattern(t);
    add(c);
    for (const unit of c.split(/（\d+）|[①-⑨；;]/)) {
      if (!unit) continue;
      add(unit);
      const parts = unit.split("：");
      add(parts[parts.length - 1]);
    }
  }
  return out;
}

function words2021(p: Point2021) {
  const text = core(p.content || p.details);
  const colon = text.lastIndexOf("：");
  const list = colon === -1 ? text : text.slice(colon + 1);
  return new Set(list.split(/[、；;]/).filter(Boolean).flatMap(formsOf));
}

export interface Match2021 {
  point: Point2021;
  /** How it matched, for the report. */
  how: string;
}

const STRONG_DICE = 0.85;
const MIN_KEY = 4;

/** The 2021 point that a 2025 point continues, when the match is
 *  confident; null otherwise. Word lists match on the words (more than
 *  half of the 2025 list, same part of speech); everything else on its text
 *  (equal, or near-equal for longer text). Ties go to the point with the
 *  same label; a tie that's left means no match. */
export function match2021(p: SourcePoint, all: Point2021[]): Match2021 | null {
  if (p.kind === "words") {
    const mine = new Set(p.items.flatMap((i) => i.forms));
    const scored = all
      .filter((q) => (q.group === "词类" || q.group === "语素") && q.category === p.subcategory)
      .map((q) => {
        const theirs = words2021(q);
        const shared = [...mine].filter((w) => theirs.has(w)).length;
        return { q, shared, score: shared / mine.size };
      })
      .filter((s) => s.score > 0.5);
    if (!scored.length) return null;
    const best = Math.max(...scored.map((s) => s.score));
    let top = scored.filter((s) => s.score === best);
    if (top.length > 1 && p.detail) {
      const sameLabel = top.filter((s) => normLabel(s.q.details) === normLabel(p.detail!));
      if (sameLabel.length) top = sameLabel;
    }
    if (top.length !== 1) return null;
    return { point: top[0].q, how: `words ${top[0].shared}/${mine.size}` };
  }

  const mine = keysOf([p.source_text || p.detail || p.subcategory || ""]);
  const candidates = new Map<Point2021, { score: number; key: string }>();
  for (const q of all) {
    if (q.group === "词类" || q.group === "语素") continue;
    for (const theirs of keysOf([q.details, q.content, `${q.details}${q.content}`, q.category])) {
      for (const k of mine) {
        const score = k === theirs ? 1 : k.length >= MIN_KEY && theirs.length >= MIN_KEY ? dice(k, theirs) : 0;
        if (score >= STRONG_DICE && score > (candidates.get(q)?.score ?? 0)) candidates.set(q, { score, key: k });
      }
    }
  }
  if (!candidates.size) return null;
  const best = Math.max(...[...candidates.values()].map((c) => c.score));
  let top = [...candidates].filter(([, c]) => c.score === best);
  if (top.length > 1) {
    const label = normLabel(p.detail ?? p.subcategory ?? "");
    const sameLabel = top.filter(([q]) => label && normLabel(q.details || q.category).startsWith(label));
    if (sameLabel.length) top = sameLabel;
  }
  if (top.length !== 1) return null;
  const [q, c] = top[0];
  return { point: q, how: c.score === 1 ? `text "${c.key}"` : `text ~${c.score.toFixed(2)} "${c.key}"` };
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export type Admin = ReturnType<typeof createAdminClient>;

type GrammarTable = "grammar_points" | "grammar_point_words" | "grammar_lessons" | "grammar_examples";
export type Row<T extends GrammarTable> = Database["public"]["Tables"][T]["Row"];

/** PGRST205: table not in the schema cache; 42P01: undefined table. */
export const isMissingTable = (error: { code?: string } | null) =>
  error?.code === "PGRST205" || error?.code === "42P01";

/** Every row of a select of `columns` (where the columns equal `match`),
 *  in `order`, 1,000 at a time; null when the table doesn't exist yet. */
export async function selectAll<T extends GrammarTable, C extends keyof Row<T> & string>(
  admin: Admin,
  table: T,
  columns: readonly C[],
  order: C,
  match: Partial<Row<T>> = {},
): Promise<Pick<Row<T>, C>[] | null> {
  // The builder's types don't resolve for a generic table name; the
  // signature above carries them instead.
  const query = () => (admin as unknown as SupabaseClient).from(table).select(columns.join(", "));
  const rows: Pick<Row<T>, C>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query()
      .match(match)
      .order(order)
      .range(from, from + 999);
    if (isMissingTable(error)) return null;
    if (error) throw error;
    const page = (data ?? []) as unknown as Pick<Row<T>, C>[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export const POINT_COLUMNS = [
  "id",
  "standard",
  "level",
  "sort_order",
  "category",
  "subcategory",
  "detail",
  "source_text",
  "kind",
  "name_zh",
  "name_en",
  "slug",
  "pattern",
  "level_2021",
  "code_2021",
] as const;
export type PointRow = Pick<Row<"grammar_points">, (typeof POINT_COLUMNS)[number]>;

export const LESSON_COLUMNS = ["point_id", "summary", "pattern_parts", "sections", "related_point_ids", "status"] as const;
export type LessonRow = Pick<Row<"grammar_lessons">, (typeof LESSON_COLUMNS)[number]>;

export const EXAMPLE_COLUMNS = [
  "id",
  "point_id",
  "sort_order",
  "hanzi",
  "pinyin",
  "translation",
  "literal",
  "highlight",
  "difficulty",
  "status",
  "max_word_level",
] as const;
export type ExampleRow = Pick<Row<"grammar_examples">, (typeof EXAMPLE_COLUMNS)[number]>;

export const hasHan = (s: string) => HAN.test(s);
