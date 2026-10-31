"use client";

import Image from "next/image";
import Link from "next/link";

import { CARD } from "@/components/app/card";
import { useRecentWords, type RecentWord } from "@/lib/dictionary/recent";
import type { WordDetail } from "@/lib/dictionary/words";

import { AudioButton } from "./AudioButton";
import { TrainingButton } from "./TrainingButton";

// The word of the day card's Bao. TODO: switch to a reading pose once one
// exists for this spot.
export const WOTD_BAO = {
  src: "/images/mascot/bao/wave-1-tight.webp",
  width: 1278,
  height: 1363,
};

export { CARD };

const DETAILS =
  "inline-flex h-11 items-center rounded-pill border-[1.5px] border-line px-5 font-heading text-body font-medium text-bark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

/** The word of the day: on the Dictionary (Details opens it in the panel)
 *  and, compact, on the Dashboard (a link opens it in the Dictionary). */
export function WordOfTheDayCard({
  word,
  dateLabel,
  details,
  compact = false,
}: {
  word: WordDetail;
  dateLabel: string;
  /** Details as a button (the Dictionary's panel) or a link to the word. */
  details: { onClick: () => void } | { href: string };
  /** Smaller hanzi and Bao, for the Dashboard. */
  compact?: boolean;
}) {
  return (
    <section aria-labelledby="wotd-title" className={`${CARD} relative overflow-hidden`}>
      <div className="flex items-center gap-2">
        <span className="rounded-pill bg-bamboo-green/20 px-3 py-1 font-body text-[13px] font-medium leading-5 text-deep-grass">
          Word of the day
        </span>
        <span className="font-body text-body text-bark-muted">{dateLabel}</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="wotd-title"
            className={`font-hanzi font-medium text-bark ${compact ? "text-[40px] leading-12" : "text-[52px] leading-[60px]"}`}
          >
            {word.simplified}
          </h2>
          <div className="mt-1 flex items-center gap-1">
            <p className="font-body text-h2 font-medium text-rust-dark">{word.pinyin}</p>
            <AudioButton text={word.simplified} size="sm" />
          </div>
          {word.gloss && <p className="mt-1 font-body text-body text-bark">{word.gloss}</p>}
        </div>
        <Image
          src={WOTD_BAO.src}
          alt=""
          width={WOTD_BAO.width}
          height={WOTD_BAO.height}
          sizes="96px"
          className={`${compact ? "h-20" : "h-24"} w-auto shrink-0 select-none`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <TrainingButton key={word.id} wordId={word.id} simplified={word.simplified} />
        {"href" in details ? (
          <Link href={details.href} className={DETAILS}>
            Open in Dictionary
          </Link>
        ) : (
          <button type="button" onClick={details.onClick} className={DETAILS}>
            Details
          </button>
        )}
      </div>
    </section>
  );
}

export function RecentlyViewedCard({ onOpen }: { onOpen: (word: RecentWord) => void }) {
  const recent = useRecentWords();
  if (recent.length === 0) return null;

  return (
    <section aria-labelledby="recent-title" className={CARD}>
      <h2 id="recent-title" className="font-heading text-h3 font-bold text-bark">
        Recently viewed
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {recent.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              onClick={() => onOpen(w)}
              className="inline-flex items-baseline gap-2 rounded-pill border-[1.5px] border-line px-3 py-1.5 transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
            >
              <span className="font-hanzi text-h3 text-bark">{w.simplified}</span>
              <span className="font-body text-[13px] leading-5 text-rust-dark">{w.pinyin}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
