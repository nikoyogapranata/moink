// The drafting file scripts/export-grammar.ts writes and
// scripts/import-grammar.ts reads back, and the importer's checks of it.
import { ROLES, SECTION_KINDS, SLUG_RE, type PatternPart, type Section } from "./grammar";

export interface FileExample {
  hanzi: string;
  pinyin: string;
  translation: string;
  /** The part of hanzi that shows the pattern. */
  highlight: string;
  /** 1 to 3. */
  difficulty: number;
}

export interface FilePoint {
  /** null in a file exported with --source: found by level and sort_order. */
  id: number | null;
  level: number;
  sort_order: number;
  category_path: string[];
  name_zh: string;
  source_text: string;
  code_2021: string | null;
  /** true: import as 'reviewed'; otherwise 'draft'. */
  reviewed: boolean;
  name_en: string;
  slug: string;
  pattern: string;
  pattern_parts: PatternPart[];
  summary: string;
  sections: Section[];
  /** Other points, by slug or id. */
  related: (string | number)[];
  examples: FileExample[];
}

export interface GrammarFile {
  standard: string;
  level: number;
  exported_at: string;
  source: "database" | "syllabus";
  how_to: string[];
  roles: string[];
  section_kinds: string[];
  example_template: FileExample;
  word_lists: { sort_order: number; name_zh: string; source_text: string }[];
  points: FilePoint[];
}

export const MIN_EXAMPLES = 6;
export const MAX_EXAMPLES = 8;

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Has anything been written for this point? Untouched points are skipped. */
export function isDrafted(p: FilePoint) {
  return isText(p.name_en) || isText(p.summary) || (Array.isArray(p.examples) && p.examples.length > 0);
}

/** What's wrong with a drafted point's content, as messages; empty when
 *  it's fine. Doesn't check related (needs the database) or the example
 *  words (grammar-check.ts). */
export function validatePoint(p: FilePoint): string[] {
  const errors: string[] = [];
  if (!isText(p.name_en)) errors.push("name_en is empty");
  if (typeof p.slug !== "string" || !SLUG_RE.test(p.slug)) errors.push(`slug "${p.slug ?? ""}" isn't lowercase-words-with-hyphens`);
  if (!isText(p.pattern)) errors.push("pattern is empty");
  if (!isText(p.summary)) errors.push("summary is empty");
  if (typeof p.reviewed !== "boolean") errors.push("reviewed must be true or false");

  if (!Array.isArray(p.pattern_parts) || !p.pattern_parts.length) {
    errors.push("pattern_parts is empty");
  } else {
    p.pattern_parts.forEach((part: unknown, i) => {
      const at = `pattern_parts[${i}]`;
      if (!isObject(part)) return errors.push(`${at} isn't an object`);
      if (!isText(part.text)) errors.push(`${at}.text is empty`);
      if (typeof part.label !== "string") errors.push(`${at}.label must be a string`);
      if (!ROLES.includes(part.role as PatternPart["role"])) {
        errors.push(`${at}.role "${String(part.role)}" isn't one of ${ROLES.join(", ")}`);
      }
    });
  }

  if (!Array.isArray(p.sections)) {
    errors.push("sections must be a list");
  } else {
    p.sections.forEach((section: unknown, i) => {
      const at = `sections[${i}]`;
      if (!isObject(section)) return errors.push(`${at} isn't an object`);
      const kind = section.kind as Section["kind"];
      if (!SECTION_KINDS.includes(kind)) errors.push(`${at}.kind "${String(section.kind)}" isn't one of ${SECTION_KINDS.join(", ")}`);
      if (!isText(section.title)) errors.push(`${at}.title is empty`);
      if (typeof section.body !== "string") errors.push(`${at}.body must be a string`);
      if (kind === "mistakes") {
        if (!Array.isArray(section.items) || !section.items.length) {
          errors.push(`${at} (mistakes) needs items: [{ wrong, right, reason }]`);
        } else {
          section.items.forEach((item: unknown, j) => {
            if (!isObject(item) || !isText(item.wrong) || !isText(item.right) || !isText(item.reason)) {
              errors.push(`${at}.items[${j}] needs wrong, right and reason`);
            }
          });
        }
      } else if (section.items !== undefined) {
        errors.push(`${at}: items only go in a mistakes section`);
      }
    });
  }

  if (!Array.isArray(p.related) || p.related.some((r) => typeof r !== "string" && typeof r !== "number")) {
    errors.push("related must be a list of slugs or ids");
  }

  if (!Array.isArray(p.examples)) {
    errors.push("examples must be a list");
  } else {
    if (p.examples.length < MIN_EXAMPLES || p.examples.length > MAX_EXAMPLES) {
      errors.push(`${p.examples.length} examples; needs ${MIN_EXAMPLES} to ${MAX_EXAMPLES}`);
    }
    const seen = new Set<string>();
    p.examples.forEach((e: unknown, i) => {
      const at = `examples[${i}]`;
      if (!isObject(e)) return errors.push(`${at} isn't an object`);
      for (const field of ["hanzi", "pinyin", "translation", "highlight"]) {
        if (!isText(e[field])) errors.push(`${at}.${field} is empty`);
      }
      if (isText(e.hanzi) && isText(e.highlight) && !e.hanzi.includes(e.highlight)) {
        errors.push(`${at}: highlight "${e.highlight}" isn't in "${e.hanzi}"`);
      }
      if (!Number.isInteger(e.difficulty) || (e.difficulty as number) < 1 || (e.difficulty as number) > 3) {
        errors.push(`${at}.difficulty must be 1, 2 or 3`);
      }
      if (isText(e.hanzi)) {
        if (seen.has(e.hanzi)) errors.push(`${at}: the same hanzi as an earlier example`);
        seen.add(e.hanzi);
      }
    });
  }
  return errors;
}
