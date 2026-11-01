// Names of people and places in grammar examples. segment() keeps each one
// whole (小王, not 小 + 王): the checker exempts them from levels, and the
// lesson pages show them as plain text, not tappable words. Add the names
// our examples use.

const LIST = [
  "小明",
  "小红",
  "小王",
  "小李",
  "小张",
  "李明",
  "王明",
  "张华",
  "大卫",
  "玛丽",
  "安娜",
  "北京",
  "上海",
  "广州",
  "西安",
  "香港",
];

/** Longest first, as segment() matches them. */
export const NAMES: readonly string[] = [...LIST].sort((a, b) => [...b].length - [...a].length);
