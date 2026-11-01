// How the Grammar pages name and color things. Grammar always follows the
// HSK 3.0 (2025) levels: 1 to 6, and 7 for bands 7 to 9.

import { closestLevel, STANDARD_LEVELS, type HskStandard } from "@/lib/hsk";
import type { GrammarRole } from "@/lib/supabase/database.types";

export const GRAMMAR_LEVELS = STANDARD_LEVELS.hsk3;

export function parseGrammarLevel(value: string | string[] | undefined): number | null {
  const level = Number(value);
  return GRAMMAR_LEVELS.includes(level) ? level : null;
}

/** The user's target level as an HSK 3.0 level (the closest one for an
 *  HSK 2.0 learner). */
export function grammarLevelFor(target: number | null, standard: HskStandard) {
  return closestLevel(target, standard, "hsk3");
}

/** The syllabus categories (类别) of structure points, in English. */
const CATEGORY_NAMES: Record<string, string> = {
  语素: "Prefixes and suffixes",
  词类: "Word patterns",
  短语: "Phrases",
  固定格式: "Fixed patterns",
  句子成分: "Sentence parts",
  句子的类型: "Sentence types",
  动作的态: "Aspect",
  特殊表达法: "Special expressions",
  "语段（句群）": "Linking sentences",
};

export function categoryName(category: string | null) {
  return category ? (CATEGORY_NAMES[category] ?? category) : "Other";
}

/** Word lists by their 细目 (or 类别名称 when there's none). */
const WORD_LIST_NAMES: Record<string, string> = {
  方位名词: "Location words",
  能愿动词: "Modal verbs",
  离合词: "Separable verbs",
  动词: "Verbs",
  疑问代词: "Question words",
  人称代词: "Personal pronouns",
  指示代词: "Demonstratives",
  数量代词: "Quantity pronouns",
  数词: "Numbers",
  名量词: "Measure words for things",
  时量词: "Measure words for time",
  动量词: "Measure words for actions",
  复合量词: "Compound measure words",
  程度副词: "Adverbs of degree",
  范围副词: "Adverbs of scope",
  时间副词: "Adverbs of time",
  频率副词: "Adverbs of frequency",
  关联副词: "Linking adverbs",
  否定副词: "Negative adverbs",
  语气副词: "Mood adverbs",
  情态副词: "Manner adverbs",
  方式副词: "Adverbs of manner",
  判断副词: "Adverbs of judgment",
  结构助词: "Structural particles",
  动态助词: "Aspect particles",
  语气助词: "Sentence-final particles",
  其他助词: "Other particles",
  叹词: "Interjections",
  "引出时间、处所": "Prepositions of time and place",
  引出对象: "Prepositions for who or what",
  "引出方向、路径": "Prepositions of direction",
  引出原因: "Prepositions of cause",
  "引出目的、原因": "Prepositions of purpose and cause",
  "引出施事、受事": "Prepositions for doer and receiver",
  "引出凭借、依据": "Prepositions of means and basis",
  表示排除: "Prepositions of exclusion",
};

/** A word list's English name: "Adverbs of degree", "Conjunctions for
 *  clauses". */
export function wordListName(p: { subcategory: string | null; detail: string | null; name_zh: string }) {
  const named = (p.detail && WORD_LIST_NAMES[p.detail]) ?? (p.subcategory && WORD_LIST_NAMES[p.subcategory]);
  if (named) return named;
  if (p.subcategory === "连词" && p.detail) {
    const clauses = p.detail.includes("分句");
    const words = /连接词(语|或|组)/.test(p.detail);
    return `Conjunctions for ${clauses && words ? "words and clauses" : clauses ? "clauses" : "words and phrases"}`;
  }
  return p.name_zh;
}

/** Pattern block colors by role: tint and ink of one ramp, ink on tint at
 *  least 4.6:1 in both themes (globals.css). */
export const ROLE_CLASSES: Record<GrammarRole, string> = {
  subject: "bg-role-blue-tint text-role-blue-ink ring-role-blue-ink/25",
  object: "bg-role-blue-tint text-role-blue-ink ring-role-blue-ink/25",
  marker: "bg-highlight text-rust-dark ring-rust-dark/25",
  verb: "bg-good-tint text-good-ink ring-good-ink/25",
  adjective: "bg-good-tint text-good-ink ring-good-ink/25",
  number: "bg-learning-tint text-learning-ink ring-learning-ink/25",
  time: "bg-role-purple-tint text-role-purple-ink ring-role-purple-ink/25",
  place: "bg-role-purple-tint text-role-purple-ink ring-role-purple-ink/25",
  other: "bg-role-gray-tint text-role-gray-ink ring-role-gray-ink/25",
};
