// Shapes of book_blocks.data, one per block type (docs/book-format.md).
// The import script validates them; the reader trusts them.

import type { BookSectionKind, BookText } from "@/lib/supabase/database.types";

export type { BookSectionKind, BookText };

export type Label = string;
export interface Option { label: Label; text: BookText }
export interface Image { src: string; alt: string }
/** A line of a dialogue: one speaker, two ("白家月、陈天中"), or null for a
 *  stage note. */
export interface DialogueLine { key: string; speaker: string[] | null; text: BookText; en?: string; en_source?: string }
export interface FillLine { speaker: string | null; text: BookText }
export interface Translated { text: BookText; en?: string; en_source?: string }

export interface BlockData {
  objectives: { items: { key: string; text: BookText; en?: string }[] };
  instruction: { num: string | null; text: BookText; en?: string; audio: string | null };
  scene: { icon: "pin" | "reading"; text: BookText; en?: string; audio?: string | null };
  choice: {
    items: { key: string; num: string; text: BookText; options: Option[]; answer: Label; answer_source?: string }[];
  };
  dialogue: { image?: Image; lines: DialogueLine[] };
  /** indent: false = no first-line indent (a diary's date line, say). */
  passage: { image?: Image; paragraphs: (Translated & { indent?: boolean })[] };
  /** proper: a 专有名词 Proper Nouns table (no audio, empty pos, numbered
   *  from 1). */
  vocab: {
    proper?: boolean;
    /** Absent on a proper-noun table. */
    audio?: string | null;
    items: {
      key: string;
      num: string;
      hanzi: string;
      pinyin: string;
      pos: string;
      en: string;
      extra?: { source: string; text: BookText; en?: string };
    }[];
  };
  prompts: {
    answer_mode: "text" | "none";
    items: { key: string; num: string; text: BookText; sample?: BookText[]; sample_source?: string }[];
  };
  retell: { text: BookText; answer_key: string };
  grammar: {
    num: string;
    title: BookText;
    title_en: string;
    explain: BookText;
    explain_en?: string;
    examples: Translated[];
    extra?: { source: string; examples?: Translated[]; related?: string[] };
  };
  dialogue_fill: {
    items: { key: string; num: string; lines: FillLine[]; sample?: BookText[]; sample_source?: string }[];
  };
  sentence_fill: {
    items: { key: string; num: string; lines: FillLine[]; hint?: BookText; sample?: BookText[]; sample_source?: string }[];
  };
  word_bank: {
    bank: Option[];
    items: { key: string; num: string; lines: FillLine[]; answer: Label; answer_source?: string }[];
  };
  passage_fill: { options: Option[]; text: BookText; answers: Label[]; answer_source?: string; answer_key: string };
  image_match: { images: (Image & { key: string; answer: Label })[]; options: Option[]; answer_source?: string };
  picture_write: {
    items: { key: string; num: string; image: Image; word: BookText; sample?: BookText[]; sample_source?: string }[];
  };
  task: {
    title: BookText;
    title_en: string;
    text: BookText;
    en?: string;
    answer_mode: "text" | "notes";
    min_chars?: number;
    answer_key: string;
    /** Shown under the task text: 提示 Tips, then 正方 Pro side: ... */
    tips?: { label: BookText; label_en: string; items: { label: BookText; label_en: string; text: BookText }[] };
  };
  /** A 小语助力 Xiaoyu's Tip callout. */
  tip: { text: BookText; en?: string };
  self_check: {
    intro: BookText;
    intro_en?: string;
    scale: { zh: string; en: string }[];
    rows: { key: string; text: BookText; en?: string }[];
  };
}

export type BlockType = keyof BlockData;

/** A block as the reader gets it: type and data paired. */
export type Block = {
  [T in BlockType]: { key: string; type: T; page: number; source: string; data: BlockData[T] };
}[BlockType];

export interface Section {
  key: string;
  kind: BookSectionKind;
  label_zh: string;
  label_en: string;
  page: number;
  blocks: Block[];
}

/** The reader's display switches (profiles.show_*). */
export interface BookPrefs {
  pinyin: boolean;
  english: boolean;
  extras: boolean;
}
