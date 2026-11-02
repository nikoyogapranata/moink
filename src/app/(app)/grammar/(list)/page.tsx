import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CARD } from "@/components/app/card";
import { RetryButton } from "@/components/app/RetryButton";
import { HanziText } from "@/components/grammar/HanziText";
import { StatusDot } from "@/components/grammar/StatusDot";
import { levelLabel } from "@/lib/hsk";
import {
  categoryName,
  GRAMMAR_LEVELS,
  grammarLevelFor,
  parseGrammarLevel,
  wordListName,
} from "@/lib/grammar/display";
import { loadLevel, type ListPoint } from "@/lib/grammar/load";
import { getAppUser } from "@/lib/supabase/app-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Grammar - moink",
};

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

/** Structure points by syllabus category, in the order the categories
 *  first appear. */
function groupByCategory(points: ListPoint[]) {
  const groups = new Map<string | null, ListPoint[]>();
  for (const p of points) {
    const group = groups.get(p.category);
    if (group) group.push(p);
    else groups.set(p.category, [p]);
  }
  return [...groups];
}

function DraftPill() {
  return (
    <span className="shrink-0 rounded-pill bg-learning-tint px-2 py-0.5 font-body text-[12px] font-medium leading-4 text-learning-ink">
      Draft
    </span>
  );
}

function PointRow({ point }: { point: ListPoint }) {
  const name = point.name_en ?? point.name_zh;
  if (!point.lesson || !point.slug) {
    return (
      <li className="flex items-center gap-3 px-3 py-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <HanziText className="font-body text-body text-bark-muted">{name}</HanziText>
          {/* Without a lesson the name is the syllabus text, which often
              already ends with the pattern. */}
          {point.pattern && !name.includes(point.pattern) && (
            <span lang="zh-CN" className="truncate font-hanzi text-body text-bark-muted">
              {point.pattern}
            </span>
          )}
        </span>
        <span className="shrink-0 font-body text-[13px] leading-5 text-bark-muted">Coming soon</span>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={`/grammar/${point.slug}`}
        className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-highlight/50 ${FOCUS_RING}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <HanziText className="font-body text-body font-medium text-bark">{name}</HanziText>
          {point.pattern && (
            <HanziText className="font-body text-body text-rust-dark">{point.pattern}</HanziText>
          )}
        </span>
        {point.lesson.status === "draft" && <DraftPill />}
        <StatusDot />
      </Link>
    </li>
  );
}

function WordListRow({ point }: { point: ListPoint }) {
  const count = point.words.length;
  return (
    <li>
      <details className="group">
        <summary
          className={`flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-highlight/50 [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-body text-body font-medium text-bark">{wordListName(point)}</span>
            <span lang="zh-CN" className="truncate font-hanzi text-[13px] leading-5 text-bark-muted">
              {point.name_zh}
            </span>
          </span>
          <span className="shrink-0 font-body text-[13px] leading-5 text-bark-muted">
            {count} {count === 1 ? "word" : "words"}
          </span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="shrink-0 text-bark-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <ul className="flex flex-wrap gap-2 px-3 pb-3 pt-1">
          {point.words.map((w) => (
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
      </details>
    </li>
  );
}

function Group({ id, title, zh, children }: { id: string; title: string; zh?: string | null; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${CARD} px-2 py-3 sm:px-3`}>
      <h2 id={id} className="flex flex-wrap items-baseline gap-x-2 px-3 pb-1 font-heading text-h2 font-bold text-bark">
        {title}
        {zh && (
          <span lang="zh-CN" className="font-hanzi text-[13px] font-normal leading-5 text-bark-muted">
            {zh}
          </span>
        )}
      </h2>
      <ul className="flex flex-col divide-y-[1.5px] divide-line">{children}</ul>
    </section>
  );
}

/** The grammar points of one HSK 3.0 level: lessons grouped by category,
 *  then the level's word lists. ?level= is the level (1 to 7, 7 for 7–9);
 *  without it, the user's target level in HSK 3.0. */
export default async function GrammarPage({ searchParams }: PageProps<"/grammar">) {
  const [user, query, supabase] = await Promise.all([getAppUser(), searchParams, createClient()]);
  const level =
    parseGrammarLevel(query.level) ?? grammarLevelFor(user?.hskLevel ?? null, user?.hskStandard ?? "hsk3");

  let points: ListPoint[] | null = null;
  try {
    points = await loadLevel(supabase, level);
  } catch (error) {
    console.error(`GrammarPage: couldn't load level ${level}.`, error);
  }

  const structure = points?.filter((p) => p.kind === "structure") ?? [];
  const wordLists = points?.filter((p) => p.kind === "words") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="font-heading text-h1 font-bold text-bark lg:text-[1.875rem] lg:leading-[2.375rem]">Grammar</h1>
          {user?.hskStandard === "hsk2" && (
            <p className="mt-1 font-body text-body-sm text-bark-muted">Grammar follows the HSK 3.0 levels.</p>
          )}
        </div>
        <nav aria-label="HSK level" className="flex flex-wrap gap-2">
          {GRAMMAR_LEVELS.map((l) => {
            const active = l === level;
            return (
              <Link
                key={l}
                href={`/grammar?level=${l}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-pill border-[1.5px] px-3.5 font-body text-[13px] font-medium transition-colors ${FOCUS_RING} ${
                  active
                    ? "border-transparent bg-highlight text-bark"
                    : "border-line text-bark-muted hover:bg-highlight/50 hover:text-bark"
                }`}
              >
                {levelLabel(l, "hsk3")}
              </Link>
            );
          })}
        </nav>
      </header>

      {points === null ? (
        <div className={`${CARD} flex flex-col items-start gap-3`}>
          <p role="alert" className="font-body text-body text-bark">
            Couldn&apos;t load the grammar for {levelLabel(level, "hsk3")}.
          </p>
          <RetryButton />
        </div>
      ) : (
        <>
          {groupByCategory(structure).map(([category, group], i) => (
            <Group key={category ?? "none"} id={`group-${i}`} title={categoryName(category)} zh={category}>
              {group.map((p) => (
                <PointRow key={p.id} point={p} />
              ))}
            </Group>
          ))}
          {wordLists.length > 0 && (
            <Group id="group-words" title="Word lists">
              {wordLists.map((p) => (
                <WordListRow key={p.id} point={p} />
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  );
}
