// What the user can answer in a lesson, shared by the server load and the
// reader. Answers are stored by key (user_book_answers.item_key): an item's
// own key, or data.answer_key for a whole-block answer.
//
// Answer shapes (the jsonb):
//   choice, word_bank, image_match item   the picked label, "C"
//   image_match item with groups          a label per group, {"name": "C"}
//   passage_fill (answer_key)             labels by blank, ["C", null, "B"]
//   dialogue_fill, sentence_fill item     text by blank, ["是啊", ...]
//   prompts, picture_write item           text
//   retell, task (answer_key)             text
//   self_check row                        the picked scale entry's zh
//   objectives item                       true when ticked

import type { Block } from "./types";

/** Every key a block's answers are stored under. */
export function answerKeys(block: Block): string[] {
  // Dialogue lines and vocab words have keys too, but nothing to answer.
  if (block.type === "dialogue" || block.type === "vocab") return [];
  if (block.type === "prompts" && block.data.answer_mode === "none") return [];
  const d = block.data as Record<string, unknown>;
  const keys: string[] = [];
  for (const list of ["items", "rows", "images"]) {
    const items = d[list];
    if (Array.isArray(items)) for (const it of items) if (it && typeof it.key === "string") keys.push(it.key);
  }
  if (typeof d.answer_key === "string") keys.push(d.answer_key);
  return keys;
}

/** An answer the reader checks itself (moink's answer key). */
export type AutoItem =
  | { kind: "single"; key: string; answer: string }
  /** One group's pick of a grouped image_match image. */
  | { kind: "group"; key: string; group: string; answer: string }
  | { kind: "passage"; key: string; answers: string[] };

/** The auto-checked items of a lesson, in book order: the score counts
 *  each single item once and each passage_fill blank once. */
export function autoItems(blocks: Block[]): AutoItem[] {
  return blocks.flatMap((b): AutoItem[] => {
    switch (b.type) {
      case "choice":
      case "word_bank":
        return b.data.items.map((it) => ({ kind: "single", key: it.key, answer: it.answer }));
      case "image_match":
        return b.data.images.flatMap((im): AutoItem[] =>
          typeof im.answer === "string"
            ? [{ kind: "single", key: im.key, answer: im.answer }]
            : (b.data.groups ?? []).map((g) => ({ kind: "group", key: im.key, group: g.key, answer: (im.answer as Record<string, string>)[g.key] })),
        );
      case "passage_fill":
        return [{ kind: "passage", key: b.data.answer_key, answers: b.data.answers }];
      default:
        return [];
    }
  });
}

const HAN = /\p{Script=Han}/gu;

/** Han characters in a text, for the task's live count. */
export const hanCount = (text: string) => (text.match(HAN) ?? []).length;
