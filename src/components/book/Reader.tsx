"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { DisplayToggles, ReadingBar, SectionChips } from "@/components/reading/ReadingBar";
import { useKeepReadingPosition } from "@/components/reading/useKeepReadingPosition";
import { Button } from "@/components/ui/Button";
import { saveBookPosition, saveBookPref, setBookLessonDone } from "@/lib/book/actions";
import type { AutoItem } from "@/lib/book/answers";
import type { BookNote, SavedAnswer } from "@/lib/book/load";
import type { BookPrefs } from "@/lib/book/types";

import { LessonNote, LessonNotes } from "./Notes";
import { BookStoreProvider, useSaveFailed } from "./store";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";
/** How long the reading position waits for scrolling to settle. */
const SAVE_DELAY_MS = 2000;

export interface ReaderSection {
  key: string;
  label_zh: string;
  label_en: string;
}

/** The section crossing the upper part of the viewport. */
function useActiveSection(keys: string[]) {
  const [active, setActive] = useState(keys[0]);
  const joined = keys.join("|");
  useEffect(() => {
    const list = joined.split("|");
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = list.find((k) => visible.has(k));
        if (first) setActive(first);
      },
      { rootMargin: "-90px 0px -60% 0px" },
    );
    for (const k of list) {
      const el = document.getElementById(k);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [joined]);
  return active;
}

/** Saves the block at the top of the screen as the reading position, once
 *  scrolling has settled. */
function useSavePosition(lessonId: string, root: React.RefObject<HTMLDivElement | null>, initial: string | null) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const blocks = [...el.querySelectorAll<HTMLElement>("[data-block-key]")];
    const visible = new Set<HTMLElement>();
    let saved = initial;
    let timer: number | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target as HTMLElement);
          else visible.delete(e.target as HTMLElement);
        }
        const top = blocks.find((b) => visible.has(b))?.dataset.blockKey;
        if (!top || top === saved) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          saved = top;
          saveBookPosition(lessonId, top).catch(() => {
            // Only a convenience: the next scroll tries again.
            saved = null;
          });
        }, SAVE_DELAY_MS);
      },
      { rootMargin: "-90px 0px -50% 0px" },
    );
    blocks.forEach((b) => observer.observe(b));
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [lessonId, root, initial]);
}

/**
 * Puts pinyin the same distance above its character in every browser.
 * Chrome sits the pinyin on the Chinese font's em box; Firefox and Safari
 * on its whole ascent, which for these fonts is about a quarter of the size
 * higher (more pinyin gap, and taller lines, worst with pinyin off). Measured
 * once, on the first ruby: where the browser puts the pinyin, and (canvas)
 * the font's ascent above its em box, as a fraction of the size. book.css
 * pulls the pinyin down by that much (--py-fix) where it's needed.
 */
function useRubyFix(root: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = root.current;
    const ruby = el?.querySelector(".zh ruby");
    const rt = ruby?.querySelector("rt");
    const base = ruby?.firstChild;
    if (!el || !rt || !base || base.nodeType !== Node.TEXT_NODE) return;
    const range = document.createRange();
    range.selectNodeContents(base);
    // Chrome: the pinyin's box overlaps the character's (font) box.
    if (range.getBoundingClientRect().top - rt.getBoundingClientRect().bottom < -1) return;
    const { fontSize, fontFamily } = getComputedStyle(ruby);
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.font = `${fontSize} ${fontFamily}`;
    const m = ctx.measureText(base.textContent ?? "");
    const size = parseFloat(fontSize);
    const ascent = m.fontBoundingBoxAscent;
    const height = ascent + m.fontBoundingBoxDescent;
    if (!(size > 0 && height > size)) return;
    // The em box shares the font box's proportions, so its top is this far
    // below the ascent.
    const above = ascent * (1 - size / height);
    el.style.setProperty("--py-fix", (above / size).toFixed(3));
  }, [root]);
}

/** With pinyin off, a tap on a vocab row (or Enter / Space on the focused
 *  row) shows that row's pinyin until the next tap anywhere (another row
 *  moves it there). Rows are focusable only while pinyin is off. Buttons
 *  and links in the row keep their own job. Straight on the DOM, like the
 *  switches: no re-render. Turning pinyin on clears it. */
function useRevealVocabPinyin(root: React.RefObject<HTMLDivElement | null>, pinyin: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const rows = [...el.querySelectorAll<HTMLElement>("[data-vocab-row]")];
    const clear = () => rows.forEach((r) => r.removeAttribute("data-py-shown"));
    if (pinyin) {
      clear();
      rows.forEach((r) => {
        r.removeAttribute("tabindex");
        r.removeAttribute("aria-description");
      });
      return;
    }
    rows.forEach((r) => {
      r.tabIndex = 0;
      // Hidden pinyin is hidden from screen readers too; revealing it makes
      // it readable.
      r.setAttribute("aria-description", "Press Enter to show its pinyin");
    });

    function toggle(row: Element | null) {
      const wasShown = row?.hasAttribute("data-py-shown");
      clear();
      if (row && !wasShown) row.setAttribute("data-py-shown", "");
    }
    function onClick(event: MouseEvent) {
      const target = event.target as Element;
      if (target.closest("button, a, input, textarea, select")) return;
      toggle(target.closest("[data-vocab-row]"));
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (!target.hasAttribute("data-vocab-row") || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      toggle(target);
    }
    document.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKey);
    };
  }, [root, pinyin]);
}

/** What a switch hides (book.css), so it can't be the anchor for that switch
 *  (pinyin is never one: hidden with 拼音 off). */
const HIDDEN_BY: Record<keyof BookPrefs, string> = {
  pinyin: "rt, .book-vpy",
  english: "rt, .book-vpy, .book-en",
  extras: "rt, .book-vpy, .book-extra",
};

const TOGGLES: { pref: keyof BookPrefs; label: string; title: string; lang?: string }[] = [
  { pref: "pinyin", label: "拼音", title: "Pinyin", lang: "zh-CN" },
  { pref: "english", label: "EN", title: "English" },
  { pref: "extras", label: "moink", title: "moink extras" },
];

/**
 * The HSK Book reader around the server-rendered lesson (`children`). The
 * display switches live here as data attributes on the root, styled by
 * book.css: flipping one re-renders only this shell, never the blocks.
 * Each switch saves to the profile; optimistic, rolled back on failure.
 */
/** Shown in the sticky bar while some answer or note couldn't be saved. */
function SaveFailed() {
  const failed = useSaveFailed();
  if (!failed) return null;
  return (
    <p role="alert" className="pb-2 font-body text-body-sm text-danger">
      Some of your answers or notes didn&apos;t save. Check your connection; they&apos;ll save with your next change.
    </p>
  );
}

export function Reader({
  lessonId,
  sections,
  blocks,
  answers,
  notes,
  autoItems,
  prefs: initialPrefs,
  done: initialDone,
  lastBlockKey,
  header,
  shelf,
  next,
  children,
}: {
  lessonId: string;
  sections: ReaderSection[];
  /** Every block in book order, labelled for the Lesson notes panel. */
  blocks: { key: string; label: string }[];
  answers: Record<string, SavedAnswer>;
  notes: BookNote[];
  autoItems: AutoItem[];
  prefs: BookPrefs;
  done: boolean;
  lastBlockKey: string | null;
  header: ReactNode;
  /** The shelf with this lesson's book open. */
  shelf: string;
  /** The next lesson's link, or null for the last one. */
  next: string | null;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [done, setDone] = useState(initialDone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = useActiveSection(sections.map((s) => s.key));
  const chips = sections.map((s) => ({ id: s.key, label: s.label_zh, title: s.label_en }));
  useSavePosition(lessonId, root, lastBlockKey);
  useRevealVocabPinyin(root, prefs.pinyin);
  useRubyFix(root);

  // Switching changes line heights all over the page: keep the line being
  // read where it is.
  const bar = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { capture, spacer } = useKeepReadingPosition({ root, content, bar, blocks: "[data-block-key]", display: prefs });
  function setPref(pref: keyof BookPrefs, shown: boolean) {
    capture(HIDDEN_BY[pref]);
    setPrefs((p) => ({ ...p, [pref]: shown }));
  }

  function toggle(pref: keyof BookPrefs) {
    const shown = !prefs[pref];
    setPref(pref, shown);
    setError(null);
    saveBookPref(pref, shown)
      .then((r) => {
        if (!r.ok) throw new Error("not saved");
      })
      .catch(() => {
        setPref(pref, !shown);
        setError("Couldn't save that setting. Please try again.");
      });
  }

  function markDone() {
    const next = !done;
    setDone(next);
    setError(null);
    startTransition(async () => {
      const r = await setBookLessonDone(lessonId, next).catch(() => ({ ok: false }));
      if (!r.ok) {
        setDone(!next);
        setError("Couldn't save that. Please try again.");
      }
    });
  }

  return (
    <BookStoreProvider lessonId={lessonId} answers={answers} notes={notes} autoItems={autoItems}>
      <div
        ref={root}
        className="book-reader"
        data-pinyin={prefs.pinyin ? "on" : "off"}
        data-en={prefs.english ? "on" : "off"}
        data-extras={prefs.extras ? "on" : "off"}
      >
        {/* header and children come from the server page and can arrive
            lazily (streamed). Each gets its own keyed slot, so React never
            sees one as an unkeyed child among these siblings. */}
        <Fragment key="header">{header}</Fragment>
        <LessonNote />

        <ReadingBar
          ref={bar}
          className="mt-4"
          below={
            <>
              {error && (
                <p role="alert" className="pb-2 font-body text-body-sm text-danger">
                  {error}
                </p>
              )}
              <SaveFailed />
            </>
          }
        >
          <SectionChips items={chips} active={active} hanzi />
          <LessonNotes blocks={blocks} />
          <DisplayToggles
            toggles={TOGGLES.map((t) => ({ ...t, key: t.pref, shown: prefs[t.pref], onToggle: () => toggle(t.pref) }))}
          />
        </ReadingBar>

        <div ref={content}>
          <Fragment key="lesson">{children}</Fragment>

          <div className="mt-12 flex flex-col items-center gap-4 border-t-[1.5px] border-line pt-8">
            <Button
              variant={done ? "secondary" : "primary"}
              onClick={markDone}
              disabled={pending}
              aria-pressed={done}
              className="w-full max-w-xs gap-2"
            >
              {done && <Check size={18} aria-hidden="true" />}
              {done ? "Lesson done" : "Mark lesson as done"}
              <span className="sr-only">{done ? " (select to mark it not done)" : ""}</span>
            </Button>
            <div className="flex w-full flex-wrap justify-center gap-3">
              <Link
                href={shelf}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border-[1.5px] border-line bg-surface-raised px-4 font-body text-body font-medium text-bark transition-colors hover:bg-highlight/40 ${FOCUS_RING}`}
              >
                <ArrowLeft size={18} aria-hidden="true" className="text-rust-dark" />
                All lessons
              </Link>
              {next && (
                <Link
                  href={next}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border-[1.5px] border-line bg-surface-raised px-4 font-body text-body font-medium text-bark transition-colors hover:bg-highlight/40 ${FOCUS_RING}`}
                >
                  Next lesson
                  <ArrowRight size={18} aria-hidden="true" className="text-rust-dark" />
                </Link>
              )}
            </div>
          </div>
        </div>
        <div ref={spacer} aria-hidden="true" />
      </div>
    </BookStoreProvider>
  );
}
