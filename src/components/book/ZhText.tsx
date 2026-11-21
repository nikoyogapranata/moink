import type { ReactNode } from "react";

import type { BookText } from "@/lib/book/types";

// The one way the HSK Book renders Chinese. Walks zh and gives every Han
// character the next pinyin syllable as ruby; everything else (punctuation,
// digits, Latin, ……) goes out as-is. {_} is a blank: the parent decides what
// fills it (an input later, an underline in read-only places). No hooks, so
// server components use it too. The 拼音 switch hides the <rt>s with CSS
// (book.css), keeping their room so lines don't jump.

const HAN = /\p{Script=Han}/u;
const BLANK = "{_}";

/** The default blank: an underline as wide as a few characters. */
export function BlankLine({ index, numbered = false }: { index: number; numbered?: boolean }) {
  return (
    <span className="book-blank" aria-label={`blank ${index + 1}`}>
      {numbered ? <span className="book-blank-num">{index + 1}</span> : null}
    </span>
  );
}

/** zh without blanks, for speech. */
export const speakable = (text: BookText) => text.zh.split(BLANK).join("");

/** A text split at each "\n" in zh (a new paragraph, as in passage_fill):
 *  each part gets its own Han characters' syllables, and `blankOffset`, the
 *  number of {_} before it, so blank numbers run on across paragraphs. */
export function paragraphs(text: BookText): { text: BookText; blankOffset: number }[] {
  const syllables = text.py.trim() ? text.py.trim().split(/\s+/) : [];
  let s = 0;
  let blanks = 0;
  return text.zh.split("\n").map((zh) => {
    const han = (zh.split(BLANK).join("").match(HAN_ALL) ?? []).length;
    const part = { text: { zh, py: syllables.slice(s, s + han).join(" ") }, blankOffset: blanks };
    s += han;
    blanks += zh.split(BLANK).length - 1;
    return part;
  });
}

const HAN_ALL = /\p{Script=Han}/gu;

export function ZhText({
  text,
  blank,
  className = "",
}: {
  text: BookText;
  /** What goes in blank number `index` (from 0, in order). */
  blank?: (index: number) => ReactNode;
  className?: string;
}) {
  const syllables = text.py.trim() ? text.py.trim().split(/\s+/) : [];
  const out: ReactNode[] = [];
  let s = 0;
  let b = 0;
  let plain = "";
  const flush = () => {
    if (plain) out.push(plain);
    plain = "";
  };

  text.zh.split(BLANK).forEach((part, i) => {
    if (i > 0) {
      flush();
      const index = b++;
      out.push(<span key={`b${index}`}>{blank ? blank(index) : <BlankLine index={index} />}</span>);
    }
    for (const ch of part) {
      // A line break is a paragraph break (paragraphs() splits there); one
      // left in a text takes no syllable and shows as nothing.
      if (ch === "\n") continue;
      if (!HAN.test(ch)) {
        plain += ch;
        continue;
      }
      flush();
      const py = syllables[s++];
      out.push(
        py ? (
          <ruby key={`r${s}`}>
            {ch}
            <rt>{py}</rt>
          </ruby>
        ) : (
          ch
        ),
      );
    }
  });
  flush();

  return (
    <span lang="zh-CN" className={`zh ${className}`}>
      {out}
    </span>
  );
}
