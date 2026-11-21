"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { saveBookPosition, saveBookPref, setBookLessonDone } from "@/lib/book/actions";
import type { AutoItem } from "@/lib/book/answers";
import type { BookNote, SavedAnswer } from "@/lib/book/load";
import type { BookPrefs } from "@/lib/book/types";

import { LessonNotes } from "./Notes";
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

const TOGGLES: { pref: keyof BookPrefs; label: string; title: string; lang?: string }[] = [
  { pref: "pinyin", label: "拼音", title: "Pinyin", lang: "zh-CN" },
  { pref: "english", label: "EN", title: "English" },
  { pref: "extras", label: "moink", title: "moink extras" },
];

function Chips({ sections, active }: { sections: ReaderSection[]; active: string }) {
  const ref = useRef<HTMLUListElement>(null);

  // Keep the active chip in view in the bar (without scrolling the page).
  useEffect(() => {
    const list = ref.current;
    const chip = list?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + chip.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - 16, behavior: "smooth" });
    }
  }, [active]);

  return (
    <nav aria-label="Sections" className="min-w-0 flex-1">
      <ul ref={ref} className="flex gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
        {sections.map((s) => (
          <li key={s.key} className="shrink-0">
            <a
              href={`#${s.key}`}
              data-chip={s.key}
              title={s.label_en}
              aria-current={s.key === active ? "location" : undefined}
              className={`inline-flex h-8 items-center whitespace-nowrap rounded-pill border-[1.5px] px-3 font-hanzi text-[14px] transition-colors ${FOCUS_RING} ${
                s.key === active
                  ? "border-transparent bg-highlight font-medium text-bark"
                  : "border-line text-bark-muted hover:bg-highlight/50 hover:text-bark"
              }`}
            >
              {s.label_zh}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

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
    <p role="alert" className="mx-auto max-w-[760px] pb-2 font-body text-body-sm text-danger">
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
  useSavePosition(lessonId, root, lastBlockKey);
  useRevealVocabPinyin(root, prefs.pinyin);

  function toggle(pref: keyof BookPrefs) {
    const shown = !prefs[pref];
    setPrefs((p) => ({ ...p, [pref]: shown }));
    setError(null);
    saveBookPref(pref, shown)
      .then((r) => {
        if (!r.ok) throw new Error("not saved");
      })
      .catch(() => {
        setPrefs((p) => ({ ...p, [pref]: !shown }));
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
        <div className="mx-auto max-w-[760px]">{header}</div>

        {/* Full width of the page area, so content scrolls under it cleanly. */}
        <div className="sticky top-0 z-20 -mx-4 mt-4 border-b-[1.5px] border-line bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-[760px] items-center gap-2 py-2">
            <Chips sections={sections} active={active} />
            <LessonNotes blocks={blocks} />
            <div role="group" aria-label="Show" className="flex h-9 shrink-0 items-center rounded-pill border-[1.5px] border-line bg-surface-raised p-0.5">
              {TOGGLES.map((t) => (
                <button
                  key={t.pref}
                  type="button"
                  aria-pressed={prefs[t.pref]}
                  title={t.title}
                  onClick={() => toggle(t.pref)}
                  lang={t.lang}
                  className={`h-full rounded-pill px-2 font-body text-[13px] font-medium transition-colors sm:px-3 ${FOCUS_RING} ${
                    prefs[t.pref] ? "bg-highlight text-bark" : "text-bark-muted line-through decoration-1 hover:text-bark"
                  } ${t.lang ? "font-hanzi" : ""}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="mx-auto max-w-[760px] pb-2 font-body text-body-sm text-danger">
              {error}
            </p>
          )}
          <SaveFailed />
        </div>

        <div className="mx-auto max-w-[760px]">
          {children}

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
                href="/book"
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
      </div>
    </BookStoreProvider>
  );
}
