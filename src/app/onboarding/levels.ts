// Level cards for onboarding step 2, stored as profiles.hsk_level_target
// (old HSK, 1 to 6). When HSK 3.0 lands as its own column, swap this array.
//
// Each sample word is checked against the seeded words table at that
// level, with pinyin copied from the table. 你好 isn't an entry there
// (only 你 and 好 are), so HSK 1 uses 谢谢. Counts are the official
// cumulative vocabulary sizes; the seeded table has slightly fewer
// (150 / 297 / 595 / 1,193 / 2,491 / 4,991).
export const LEVEL_CARDS = [
  { level: 1, word: "谢谢", pinyin: "xiè xie", count: 150 },
  { level: 2, word: "旅游", pinyin: "lǚ yóu", count: 300 },
  { level: 3, word: "环境", pinyin: "huán jìng", count: 600 },
  { level: 4, word: "经济", pinyin: "jīng jì", count: 1200 },
  { level: 5, word: "逻辑", pinyin: "luó ji", count: 2500 },
  { level: 6, word: "谴责", pinyin: "qiǎn zé", count: 5000 },
] as const;

export type HskLevel = (typeof LEVEL_CARDS)[number]["level"];

export function isHskLevel(value: unknown): value is HskLevel {
  return LEVEL_CARDS.some((card) => card.level === value);
}
