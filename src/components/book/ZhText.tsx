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
