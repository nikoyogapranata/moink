"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";

import { AudioButton } from "@/components/dictionary/AudioButton";
import { levelLabel } from "@/lib/hsk";
import type { PopoverWord, SentencePart } from "@/lib/grammar/load";

import { hanziRuns } from "./HanziText";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";
const POPOVER_WIDTH = 256;
/** Gap between the word and the popover. */
const GAP = 6;
/** Room the popover keeps from the top of the viewport. */
const VIEWPORT_MARGIN = 8;

/** The open word popover: which sentence, which word, and where the word
 *  is in the sentence's box (left, top and bottom edges). */
export interface OpenWord {
  sentence: string;
  wordId: number;
  left: number;
  wordTop: number;
  wordBottom: number;
  trigger: HTMLElement;
}

/** The characters of `text` (starting at `offset` in the sentence), with
 *  the ones in [from, to) in the highlight style. */
function withHighlight(text: string, offset: number, from: number, to: number): ReactNode {
  const chars = [...text];
  const start = Math.max(0, Math.min(chars.length, from - offset));
  const end = Math.max(start, Math.min(chars.length, to - offset));
  if (start === end) return text;
  return (
    <>
      {chars.slice(0, start).join("")}
      <span className="rounded-[4px] bg-highlight text-rust-dark">{chars.slice(start, end).join("")}</span>
      {chars.slice(end).join("")}
    </>
  );
}

function WordPopover({ word, open, onClose }: { word: PopoverWord; open: OpenWord; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Above the word when it fits in the viewport, so the pinyin under the
  // sentence stays visible; below it otherwise. Measured before paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fitsAbove = open.trigger.getBoundingClientRect().top - GAP - el.offsetHeight >= VIEWPORT_MARGIN;
    el.style.top = `${fitsAbove ? open.wordTop - GAP - el.offsetHeight : open.wordBottom + GAP}px`;
    el.style.visibility = "visible";
  }, [open]);

  useEffect(() => {
    ref.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onClose();
      open.trigger.focus();
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !open.trigger.contains(target)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, open.trigger]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${word.simplified} ${word.pinyin}`}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      style={{ left: open.left, top: 0, width: POPOVER_WIDTH, visibility: "hidden" }}
      className="absolute z-20 flex max-w-full flex-col gap-2 rounded-lg border-[1.5px] border-line bg-surface-raised p-4 shadow-float focus:outline-none"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1">
            <span lang="zh-CN" className="font-hanzi text-[24px] leading-8 text-bark">
              {word.simplified}
            </span>
            <AudioButton text={word.simplified} size="sm" />
          </p>
          <p className="font-body text-body font-medium text-rust-dark">{word.pinyin}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            open.trigger.focus();
          }}
          aria-label="Close"
          className={`-mr-2 -mt-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-bark-muted transition-colors hover:bg-highlight/60 hover:text-bark ${FOCUS_RING}`}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {word.gloss && <p className="font-body text-body text-bark">{word.gloss}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {word.level !== null ? (
          <span className="rounded-pill border-[1.5px] border-line px-2 py-0.5 font-body text-[12px] leading-4 text-bark-muted">
            {levelLabel(word.level, "hsk3")}
          </span>
        ) : (
          <span />
        )}
        <Link
          href={`/dictionary/${word.id}`}
          className={`inline-flex min-h-9 items-center rounded-pill px-2 font-body text-body-sm font-medium text-rust-dark underline-offset-2 hover:underline ${FOCUS_RING}`}
        >
          Open in Dictionary
        </Link>
      </div>
    </div>
  );
}

/**
 * A Chinese sentence: each word of the table is a button that opens its
 * popover, the highlight in rust on a light rust background, then the
 * pinyin, the word-by-word line and the translation. With pinyin hidden, tapping the sentence (or
 * a word in it) shows its pinyin.
 */
export function Sentence({
  id,
  parts,
  hanzi,
  highlight,
  pinyin,
  translation,
  literal,
  showPinyin,
  showEnglish,
  revealed,
  onReveal,
  words,
  openWord,
  onOpenWord,
  onCloseWord,
}: {
  id: string;
  parts: SentencePart[];
  hanzi: string;
  highlight: string;
  pinyin: string;
  translation: string;
  /** Word by word; shown with the translation. */
  literal: string | null;
  showPinyin: boolean;
  showEnglish: boolean;
  revealed: boolean;
  onReveal: (id: string) => void;
  words: Record<number, PopoverWord>;
  openWord: OpenWord | null;
  onOpenWord: (open: OpenWord) => void;
  onCloseWord: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const from = highlight ? hanzi.indexOf(highlight) : -1;
  const to = from === -1 ? -1 : from + highlight.length;
  const pinyinShown = showPinyin || revealed;

  function onWord(event: MouseEvent<HTMLButtonElement>, wordId: number) {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(0, Math.min(rect.left - box.left, box.width - POPOVER_WIDTH));
    onOpenWord({
      sentence: id,
      wordId,
      left,
      wordTop: rect.top - box.top,
      wordBottom: rect.bottom - box.top,
      trigger: event.currentTarget,
    });
  }

  // Where each part starts in the sentence.
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((n, p) => n + p.text.length, 0));
  const rendered = parts.map((part, i) => {
    const content = withHighlight(part.text, starts[i], from, to);
    if (part.wordId === null || !words[part.wordId]) return <span key={i}>{content}</span>;
    const wordId = part.wordId;
    const isOpen = openWord?.sentence === id && openWord.wordId === wordId;
    return (
      <button
        key={i}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={(e) => onWord(e, wordId)}
        className={`rounded-[4px] decoration-bark-muted decoration-dotted underline-offset-[6px] hover:underline ${FOCUS_RING} ${isOpen ? "underline" : ""}`}
      >
        {content}
      </button>
    );
  });

  const popoverWord = openWord?.sentence === id ? words[openWord.wordId] : undefined;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <div
        onClick={() => !showPinyin && onReveal(id)}
        className={!showPinyin && !revealed ? "cursor-pointer" : undefined}
      >
        <p lang="zh-CN" className="font-hanzi text-[19px] leading-[30px] text-bark">
          {rendered}
        </p>
        {pinyinShown && <p className="font-body text-body text-rust-dark">{pinyin}</p>}
      </div>
      {showEnglish && literal && (
        <p className="font-body text-body italic text-bark-muted">
          Word by word: {hanziRuns(literal)}
        </p>
      )}
      {showEnglish && <p className="font-body text-body text-bark-muted">{translation}</p>}
      {popoverWord && openWord && <WordPopover word={popoverWord} open={openWord} onClose={onCloseWord} />}
    </div>
  );
}
