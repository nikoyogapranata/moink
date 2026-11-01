"use client";

import { ArrowLeft, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CARD } from "@/components/app/card";
import { AudioButton } from "@/components/dictionary/AudioButton";
import { Button } from "@/components/ui/Button";
import { levelLabel } from "@/lib/hsk";
import { categoryName, ROLE_CLASSES } from "@/lib/grammar/display";
import type { Lesson, LessonExample, PointLink } from "@/lib/grammar/load";
import type { GrammarSection } from "@/lib/supabase/database.types";

import { hanziRuns, HanziText } from "./HanziText";
import { storeLessonPref, useLessonPref, type LessonPref } from "./prefs";
import { RichText } from "./RichText";
import { Sentence, type OpenWord } from "./Sentence";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";
const SECTION_TITLE = "font-heading text-h2 font-bold text-bark";
/** Room above a section scrolled to from the contents. */
const ANCHOR_OFFSET = "scroll-mt-6";

interface TocItem {
  id: string;
  title: string;
}

function Toggle({ pref, label }: { pref: LessonPref; label: string }) {
  const shown = useLessonPref(pref);
  return (
    <button
      type="button"
      aria-pressed={shown}
      onClick={() => storeLessonPref(pref, !shown)}
      className={`h-full rounded-pill px-3 font-body text-[13px] font-medium transition-colors ${FOCUS_RING} ${
        shown ? "bg-highlight text-bark" : "text-bark-muted hover:text-bark"
      }`}
    >
      {label}
    </button>
  );
}

/** The section in view: the first of `ids` crossing the upper part of the
 *  viewport. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join("|");
  useEffect(() => {
    const list = key.split("|");
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = list.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-15% 0px -55% 0px" },
    );
    for (const id of list) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function Contents({ items, active, variant }: { items: TocItem[]; active: string; variant: "side" | "chips" }) {
  if (variant === "chips") {
    return (
      <nav aria-label="Lesson contents" className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden">
        <ul className="flex w-max gap-2 pb-1">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={item.id === active ? "location" : undefined}
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-pill border-[1.5px] px-3.5 font-body text-[13px] font-medium transition-colors ${FOCUS_RING} ${
                  item.id === active
                    ? "border-transparent bg-highlight text-bark"
                    : "border-line text-bark-muted hover:bg-highlight/50 hover:text-bark"
                }`}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Lesson contents" className="sticky top-10 hidden lg:block">
      {/* min-h-7: level with the label row above the lesson title. */}
      <p className="mb-2 flex min-h-7 items-center px-3 font-body text-body-sm font-medium text-bark-muted">In this lesson</p>
      <ul className="flex flex-col gap-0.5 border-l-[1.5px] border-line">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={item.id === active ? "location" : undefined}
              className={`-ml-[1.5px] block border-l-[1.5px] px-3 py-1.5 font-body text-body-sm transition-colors ${FOCUS_RING} ${
                item.id === active
                  ? "border-rust-dark font-medium text-bark"
                  : "border-transparent text-bark-muted hover:text-bark"
              }`}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PatternBlocks({ lesson }: { lesson: Lesson }) {
  if (!lesson.pattern_parts.length) {
    return lesson.pattern ? <HanziText className="font-body text-[18px] font-medium text-rust-dark">{lesson.pattern}</HanziText> : null;
  }
  return (
    <ol aria-label="Pattern" className="flex flex-wrap items-stretch gap-2">
      {lesson.pattern_parts.map((part, i) => (
        <li
          key={i}
          className={`flex min-w-14 flex-col items-center justify-center rounded-md px-3 py-2 text-center ring-[1.5px] ring-inset ${ROLE_CLASSES[part.role]}`}
        >
          <span className="font-body text-[19px] font-medium leading-7">{hanziRuns(part.text)}</span>
          <span className="font-body text-[12px] leading-4">{hanziRuns(part.label)}</span>
        </li>
      ))}
    </ol>
  );
}

function MistakeItems({ items }: { items: NonNullable<GrammarSection["items"]> }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item, i) => (
        <li key={i} className="flex flex-col gap-1.5">
          <p className="flex items-start gap-2 rounded-md bg-again-tint px-3 py-2 text-again-ink">
            <X size={18} aria-hidden="true" className="mt-1.5 shrink-0" />
            <span className="sr-only">Wrong: </span>
            <s className="font-body text-[18px] leading-[30px]">{hanziRuns(item.wrong)}</s>
          </p>
          <p className="flex items-start gap-2 rounded-md bg-good-tint px-3 py-2 text-good-ink">
            <Check size={18} aria-hidden="true" className="mt-1.5 shrink-0" />
            <span className="sr-only">Right: </span>
            <span className="font-body text-[18px] leading-[30px]">{hanziRuns(item.right)}</span>
          </p>
          <p className="max-w-[72ch] px-1 font-body text-[15px] leading-[1.7] text-bark-muted">{hanziRuns(item.reason)}</p>
        </li>
      ))}
    </ul>
  );
}

function NeighborLink({ point, direction }: { point: PointLink; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <Link
      href={`/grammar/${point.slug}`}
      className={`${CARD} flex items-center gap-3 py-4 transition-colors hover:bg-highlight/40 ${FOCUS_RING} ${
        direction === "next" ? "flex-row-reverse text-right sm:col-start-2" : ""
      }`}
    >
      <Icon size={20} aria-hidden="true" className="shrink-0 text-rust-dark" />
      <span className="flex min-w-0 flex-col">
        <span className="font-body text-body-sm text-bark-muted">{direction === "previous" ? "Previous" : "Next"}</span>
        <HanziText className="font-body text-body font-medium text-bark">{point.name_en}</HanziText>
      </span>
    </Link>
  );
}

/** A grammar lesson. The server loads it (lib/grammar/load.ts); this adds
 *  the toggles, tappable words and the contents. */
export function LessonView({ lesson }: { lesson: Lesson }) {
  const showPinyin = useLessonPref("pinyin");
  const showEnglish = useLessonPref("english");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [openWord, setOpenWord] = useState<OpenWord | null>(null);
  const closeWord = useCallback(() => setOpenWord(null), []);
  const reveal = useCallback((id: string) => setRevealed((r) => (r.has(id) ? r : new Set(r).add(id))), []);

  // Recaps (in short) go after the other sections, just before the
  // examples; ids keep each section's place in the lesson.
  const sections = lesson.sections.map((section, i) => ({ section, id: `section-${i + 1}` }));
  const ordered = [...sections.filter((s) => s.section.kind !== "recap"), ...sections.filter((s) => s.section.kind === "recap")];

  const toc: TocItem[] = [
    { id: "overview", title: "Overview" },
    ...ordered.map(({ section, id }) => ({ id, title: section.title })),
    ...(lesson.examples.length ? [{ id: "examples", title: "Examples" }] : []),
  ];
  const active = useActiveSection(toc.map((t) => t.id));

  const sentence = (e: LessonExample, key: string) => (
    <Sentence
      id={key}
      parts={e.parts}
      hanzi={e.hanzi}
      highlight={e.highlight}
      pinyin={e.pinyin}
      translation={e.translation}
      literal={e.literal}
      showPinyin={showPinyin}
      showEnglish={showEnglish}
      revealed={revealed.has(key)}
      onReveal={reveal}
      words={lesson.popoverWords}
      openWord={openWord}
      onOpenWord={setOpenWord}
      onCloseWord={closeWord}
    />
  );

  const first = lesson.examples[0];
  const level = levelLabel(lesson.level, "hsk3");

  const toggles = (className: string) => (
    <div
      role="group"
      aria-label="Show"
      className={`h-9 shrink-0 items-center rounded-pill border-[1.5px] border-line p-0.5 ${className}`}
    >
      <Toggle pref="pinyin" label="Pinyin" />
      <Toggle pref="english" label="English" />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/grammar?level=${lesson.level}`}
        className={`inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill border-[1.5px] border-line bg-surface-raised py-2 pl-[11px] pr-4 font-body text-[15px] font-medium leading-6 text-bark transition-colors hover:border-bark-muted/50 hover:bg-highlight/40 ${FOCUS_RING}`}
      >
        <ArrowLeft size={18} aria-hidden="true" className="text-rust-dark" />
        All {level} grammar
      </Link>

      {/* The app's page width, as the list: contents on the left, the
          lesson filling the rest (paragraphs keep their own measure,
          RichText). Both columns start at the same top. */}
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <div className="hidden lg:block">
          <Contents items={toc} active={active} variant="side" />
        </div>

        <article aria-labelledby="lesson-title" className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-3">
            {/* The label row, as tall as the contents heading beside it.
                Mobile: HSK, Draft, category, then the toggles at the end.
                Desktop: HSK, category, then Draft at the end. */}
            <div className="flex min-h-7 items-center gap-2">
              <span className="order-1 shrink-0 rounded-pill bg-highlight px-2.5 py-0.5 font-body text-[13px] font-medium leading-5 text-rust-dark">
                {level}
              </span>
              {lesson.status === "draft" && (
                <span className="order-2 shrink-0 rounded-pill bg-learning-tint px-2 py-0.5 font-body text-[12px] font-medium leading-4 text-learning-ink lg:order-4 lg:ml-auto">
                  Draft
                </span>
              )}
              <span className="order-3 min-w-0 truncate font-body text-body-sm text-bark-muted">
                {categoryName(lesson.category)}
              </span>
              {toggles("order-5 ml-auto inline-flex lg:hidden")}
            </div>
            <div className="flex items-center justify-between gap-4">
              <h1 id="lesson-title" className="min-w-0 font-heading text-h1 font-bold text-bark lg:text-[1.875rem] lg:leading-[2.375rem]">
                {hanziRuns(lesson.name_en)}
              </h1>
              {toggles("hidden lg:inline-flex")}
            </div>
            <p lang="zh-CN" className="-mt-2 font-hanzi text-body-sm text-bark-muted">
              {lesson.name_zh}
            </p>
            <p aria-live="polite" className="font-body text-body-sm text-bark-muted empty:hidden">
              {showPinyin ? "" : "Tap a sentence to see its pinyin."}
            </p>
            <Contents items={toc} active={active} variant="chips" />
          </header>

          <section
            id="overview"
            aria-label="Overview"
            className={`${ANCHOR_OFFSET} flex flex-col gap-4 rounded-[22px] border-[1.5px] border-rust/25 bg-rust/[0.06] p-5`}
          >
            {lesson.summary && <RichText text={lesson.summary} />}
            <PatternBlocks lesson={lesson} />
            {first && (
              <div className="flex items-start gap-2 rounded-lg bg-surface-raised p-4">
                {sentence(first, "overview")}
                <AudioButton text={first.hanzi} size="sm" />
              </div>
            )}
          </section>

          {ordered.map(({ section, id }) =>
            section.kind === "recap" ? (
              // A small highlighted card: the lesson in short.
              <section
                key={id}
                id={id}
                aria-labelledby={`${id}-title`}
                className={`${ANCHOR_OFFSET} flex flex-col gap-2 rounded-[22px] border-[1.5px] border-rust/25 bg-highlight px-5 py-4`}
              >
                <h2 id={`${id}-title`} className="font-heading text-h3 font-bold text-bark">
                  {hanziRuns(section.title)}
                </h2>
                {section.body.trim() && <RichText text={section.body} />}
              </section>
            ) : (
              <section
                key={id}
                id={id}
                aria-labelledby={`${id}-title`}
                className={`${CARD} ${ANCHOR_OFFSET} flex flex-col gap-3`}
              >
                <h2 id={`${id}-title`} className={SECTION_TITLE}>
                  {hanziRuns(section.title)}
                </h2>
                {section.body.trim() && <RichText text={section.body} />}
                {section.kind === "mistakes" && section.items?.length ? <MistakeItems items={section.items} /> : null}
              </section>
            ),
          )}

          {lesson.examples.length > 0 && (
            <section id="examples" aria-labelledby="examples-title" className={`${CARD} ${ANCHOR_OFFSET} flex flex-col gap-1`}>
              <h2 id="examples-title" className={`${SECTION_TITLE} pb-2`}>
                Examples
              </h2>
              <ol className="flex flex-col divide-y-[1.5px] divide-line">
                {lesson.examples.map((e, i) => (
                  <li key={e.id} className="flex items-start gap-3 py-3">
                    <span
                      aria-hidden="true"
                      className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-highlight font-body text-[12px] font-medium text-bark"
                    >
                      {i + 1}
                    </span>
                    {sentence(e, `example-${e.id}`)}
                    <AudioButton text={e.hanzi} size="sm" />
                  </li>
                ))}
              </ol>
            </section>
          )}

          {lesson.words.length > 0 && (
            <section aria-labelledby="words-title" className={`${CARD} flex flex-col gap-3`}>
              <h2 id="words-title" className={SECTION_TITLE}>
                Words
              </h2>
              <ul className="flex flex-wrap gap-2">
                {lesson.words.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/dictionary/${w.id}`}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-pill border-[1.5px] border-line px-3.5 transition-colors hover:bg-highlight/50 ${FOCUS_RING}`}
                    >
                      <span lang="zh-CN" className="font-hanzi text-[18px] leading-6 text-bark">
                        {w.simplified}
                      </span>
                      <span className="font-body text-[13px] leading-5 text-rust-dark">{w.pinyin}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {lesson.related.length > 0 && (
            <section aria-labelledby="related-title" className="flex flex-col gap-3">
              <h2 id="related-title" className="font-heading text-h3 font-bold text-bark">
                Related
              </h2>
              <ul className="flex flex-wrap gap-2">
                {lesson.related.map((p, i) => (
                  <li key={p.slug ?? `soon-${i}`}>
                    {p.slug ? (
                      <Link
                        href={`/grammar/${p.slug}`}
                        className={`inline-flex min-h-11 items-center rounded-pill border-[1.5px] border-line px-4 font-body text-body text-bark transition-colors hover:bg-highlight/50 ${FOCUS_RING}`}
                      >
                        {hanziRuns(p.name_en)}
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center gap-2 rounded-pill border-[1.5px] border-dashed border-line px-4 font-body text-body text-bark-muted">
                        {hanziRuns(p.name_en)}
                        <span className="text-[12px]">Coming soon</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(lesson.previous || lesson.next) && (
            <nav aria-label="More lessons" className="grid gap-3 sm:grid-cols-2">
              {lesson.previous && <NeighborLink point={lesson.previous} direction="previous" />}
              {lesson.next && <NeighborLink point={lesson.next} direction="next" />}
            </nav>
          )}

          <div className="flex flex-col items-center gap-2 pt-2">
            <Button disabled aria-describedby="practice-soon" className="w-full max-w-xs">
              Practice
            </Button>
            <p id="practice-soon" className="font-body text-body-sm text-bark-muted">
              Practice is coming soon
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
