// Level cards for onboarding step 2, per HSK standard, stored as
// profiles.hsk_standard and hsk_level_target (a level in that standard;
// see src/lib/hsk.ts).
//
// Each sample word is in the seeded words table at that level, with
// pinyin copied from the table. 你好 isn't an entry there (only 你 and 好
// are), so level 1 uses 谢谢. The HSK 3.0 words are at their 2025 level by
// the dataset's newest-* tags (scripts/seed-hsk3.ts fills
// hsk3_2025_level), and are old HSK words, so they're in the table before
// that seed runs too. Counts are the official cumulative vocabulary sizes
// (CUMULATIVE_WORDS).
import { CUMULATIVE_WORDS, type HskStandard } from "@/lib/hsk";

export interface LevelCard {
  level: number;
  word: string;
  pinyin: string;
  count: number;
}

const samples: Record<HskStandard, { word: string; pinyin: string }[]> = {
  hsk2: [
    { word: "谢谢", pinyin: "xiè xie" },
    { word: "旅游", pinyin: "lǚ yóu" },
    { word: "环境", pinyin: "huán jìng" },
    { word: "经济", pinyin: "jīng jì" },
    { word: "逻辑", pinyin: "luó ji" },
    { word: "谴责", pinyin: "qiǎn zé" },
  ],
  hsk3: [
    { word: "谢谢", pinyin: "xiè xie" },
    { word: "旅游", pinyin: "lǚ yóu" },
    { word: "环境", pinyin: "huán jìng" },
    { word: "经济", pinyin: "jīng jì" },
    { word: "逻辑", pinyin: "luó ji" },
    { word: "投资", pinyin: "tóu zī" },
    { word: "谴责", pinyin: "qiǎn zé" },
  ],
};

export const LEVEL_CARDS: Record<HskStandard, readonly LevelCard[]> = {
  hsk2: samples.hsk2.map((s, i) => ({ level: i + 1, ...s, count: CUMULATIVE_WORDS.hsk2[i] })),
  hsk3: samples.hsk3.map((s, i) => ({ level: i + 1, ...s, count: CUMULATIVE_WORDS.hsk3[i] })),
};
