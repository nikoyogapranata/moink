// Per-word reading choice, for characters with more than one everyday
// reading where the automatic rule (first usable, lowercase preferred)
// picks the wrong one. Map hanzi to the pinyin to store, exactly as the
// dataset writes it, tone marks and spaces included, e.g.
//
//   着: "zhe",
//   行: "xíng",
//
// Candidates are listed in scripts/output/polyphones.csv
// (pnpm exec tsx scripts/export-polyphones.ts). An override that doesn't
// match any of the word's readings stops seed-words.ts and
// fix-readings.ts before they do anything.
//
// Some words list the same pinyin more than once with different meanings,
// told apart only by the traditional character (药 yào: 葯 "leaf of the
// iris" vs 藥 "medicine"). For those, give { pinyin, traditional }.
//
// 起来 is not listed: the wanted qǐlái matches neither dataset reading
// ("qǐ lai", "qi lai").
export type ReadingOverride = string | { pinyin: string; traditional: string };

export const READING_OVERRIDES: Record<string, ReadingOverride> = {
  // HSK 1
  大: "dà",
  的: "de",
  东西: "dōng xi",
  都: "dōu",
  读: "dú",
  多少: "duō shao",
  好: "hǎo",
  喝: "hē",
  和: "hé",
  会: "huì",
  几: "jǐ",
  看: "kàn",
  了: "le",
  吗: "ma",
  没: "méi",
  哪: "nǎ",
  那: "nà",
  呢: "ne",
  少: "shǎo",
  喂: "wèi",

  // HSK 2
  药: { pinyin: "yào", traditional: "藥" }, // not 葯 "leaf of the iris"
  吧: "ba",
  便宜: "pián yi",
  别: "bié",
  得: "de",
  告诉: "gào su",
  给: "gěi",
  还: "hái",
  好吃: "hǎo chī",
  号: "hào",
  累: "lèi",
  女人: "nǚ rén",
  妻子: "qī zi",
  为: "wèi",
  要: "yào",
  远: "yuǎn",
  长: "cháng",
  着: "zhe",

  // HSK 3
  啊: "a",
  把: "bǎ",
  差: "chà",
  地: "de",
  地方: "dì fang",
  分: "fēn",
  更: "gèng",
  故事: "gù shi",
  过去: "guò qù",
  角: "jiǎo",
  脚: "jiǎo",
  教: "jiāo",
  难: "nán",
  鸟: "niǎo",
  胖: "pàng",
  骑: "qí",
  刷: "shuā",
  只: "zhǐ",
  种: "zhǒng",

  // HSK 4
  场: "chǎng",
  大夫: "dài fu",
  弹: "tán",
  当: { pinyin: "dāng", traditional: "當" }, // not 噹 "(onom.) dong"
  咸: { pinyin: "xián", traditional: "鹹" }, // not 咸 "all; everyone"
  当时: "dāng shí",
  底: "dǐ",
  发: "fā",
  干: "gàn",
  过: "guò",
  汗: "hàn",
  好处: "hǎo chu",
  假: "jiǎ",
  结果: "jié guǒ",
  精神: "jīng shén",
  弄: "nòng",
  省: "shěng",
  汤: "tāng",
  趟: "tàng",
  行: "xíng",
  页: "yè",
  与: "yǔ",
  脏: "zāng",
  重点: "zhòng diǎn",
  赚: "zhuàn",
};
