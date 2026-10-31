"use client";

import Image from "next/image";
import Link from "next/link";

import { RetryButton } from "@/components/app/RetryButton";
import { CARD } from "@/components/dictionary/SideCards";
import { Button } from "@/components/ui/Button";
import type { TodayReview } from "@/lib/training/today";

import { baoImage, type BaoPose } from "./bao";
import { InfoTip } from "./InfoTip";

const REVIEW_HREF = "/training/review";

// Rough time per card for the estimate on the review card.
const SECONDS_PER_DUE = 25;
const SECONDS_PER_NEW = 40;
const SECONDS_PER_WRITE = 60;

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

function Bao({ pose, className }: { pose: BaoPose; className: string }) {
  const img = baoImage(pose);
  return (
    <Image
      src={img.src}
      alt=""
      width={img.width}
      height={img.height}
      sizes="160px"
      priority
      className={`w-auto shrink-0 select-none ${className}`}
    />
  );
}

const LATER_TODAY_INFO = "Words you just learned come back once more today to help them stick.";

/** "{n} later today": cards in a learning or relearning step due later
 *  today, with why. */
function LaterToday({ count, className = "" }: { count: number; className?: string }) {
  return (
    <p className={`whitespace-nowrap font-body text-body-sm text-bark-muted ${className}`}>
      {count} later today <InfoTip label="later today" info={LATER_TODAY_INFO} align="start" />
    </p>
  );
}

/**
 * Today's review, on the Training hub and the Dashboard: what's due, new
 * and to write, with Start review; "All done" once nothing's left; an
 * error with a retry when it couldn't be loaded.
 */
export function TodayCard({
  review,
  dueTomorrow,
  dailyNewWords,
  nothingStarted,
  onChangeLimit,
  bao,
}: {
  /** Null when it couldn't be loaded: the card says so, with a retry. */
  review: TodayReview | null;
  /** Null when the stats couldn't be loaded. */
  dueTomorrow: number | null;
  /** Null when the profile couldn't be loaded. */
  dailyNewWords: number | null;
  nothingStarted: boolean;
  /** Opens the daily limits dialog. Without it, "Change the limit" links
   *  to Training, where the dialog is. */
  onChangeLimit?: () => void;
  /** Bao's pose, in place of the card's own (ready, or happy when all
   *  done): the Dashboard's mood. */
  bao?: BaoPose;
}) {
  if (!review) {
    return (
      <section aria-labelledby="today-title" className={`${CARD} flex items-center justify-between gap-4`}>
        <div className="min-w-0">
          <h2 id="today-title" className="font-heading text-h2 font-bold text-bark">
            Today&apos;s review
          </h2>
          <p role="alert" className="mt-1 font-body text-body text-bark">
            Couldn&apos;t load your review. Try again.
          </p>
          <RetryButton className="mt-4" />
        </div>
        <Bao pose="ready" className="h-24 sm:h-32" />
      </section>
    );
  }

  const { due, soon, laterToday, newCount, newFromDictionary, toWrite } = review;
  if (due === 0 && soon === 0 && newCount === 0 && toWrite === 0) {
    const limitZero = nothingStarted && dailyNewWords === 0;
    const changeClass = `rounded-sm font-medium text-rust-dark underline underline-offset-4 ${FOCUS_RING}`;
    return (
      <section aria-labelledby="today-title" className={`${CARD} flex items-center justify-between gap-4`}>
        <div className="min-w-0">
          <h2 id="today-title" className="font-heading text-h2 font-bold text-bark">
            {limitZero ? "No new words today" : "All done for today"}
          </h2>
          {limitZero ? (
            <p className="mt-1 font-body text-body text-bark">
              Your new-words limit is 0 a day, so there&apos;s nothing to learn yet.{" "}
              {onChangeLimit ? (
                <button type="button" onClick={onChangeLimit} className={changeClass}>
                  Change the limit
                </button>
              ) : (
                <Link href="/training" className={changeClass}>
                  Change the limit
                </Link>
              )}
            </p>
          ) : (
            dueTomorrow !== null && (
              <p className="mt-1 font-body text-body text-bark-muted">
                {dueTomorrow === 1 ? "1 card due tomorrow" : `${dueTomorrow} due tomorrow`}
              </p>
            )
          )}
          {laterToday > 0 && <LaterToday count={laterToday} className="mt-1" />}
        </div>
        <Bao pose={bao ?? (limitZero ? "ready" : "happy")} className="h-24 sm:h-32" />
      </section>
    );
  }

  const minutes = Math.max(
    1,
    Math.round(((due + soon) * SECONDS_PER_DUE + newCount * SECONDS_PER_NEW + toWrite * SECONDS_PER_WRITE) / 60),
  );

  return (
    <section aria-labelledby="today-title" className={`${CARD} flex items-end justify-between gap-4`}>
      <div className="min-w-0">
        <h2 id="today-title" className="font-heading text-h2 font-bold text-bark">
          Today&apos;s review
        </h2>
        <dl className="mt-3 flex gap-6 sm:gap-8">
          <div>
            <dt className="sr-only">Due</dt>
            <dd className="font-heading text-[40px] font-bold leading-[44px] text-rust-dark">{due}</dd>
            <dd aria-hidden="true" className="font-body text-body text-bark-muted">
              due
            </dd>
          </div>
          <div>
            <dt className="sr-only">New</dt>
            <dd className="font-heading text-[40px] font-bold leading-[44px] text-deep-grass">{newCount}</dd>
            <dd aria-hidden="true" className="font-body text-body text-bark-muted">
              new
            </dd>
          </div>
          <div>
            <dt className="sr-only">To write</dt>
            <dd className="font-heading text-[40px] font-bold leading-[44px] text-bamboo-gold-dark">{toWrite}</dd>
            <dd aria-hidden="true" className="font-body text-body text-bark-muted">
              to write
            </dd>
          </div>
        </dl>
        {/* Below the counts, so it doesn't widen the due column. */}
        {laterToday > 0 && <LaterToday count={laterToday} className="mt-1" />}
        <Button asChild className="mt-4">
          <Link href={REVIEW_HREF}>Start review</Link>
        </Button>
        <p className="mt-2 font-body text-body-sm text-bark-muted">Saves your progress and keeps your streak</p>
        <p className="mt-2 font-body text-body text-bark-muted">
          About {minutes} min
          {newFromDictionary > 0 &&
            ` · ${newFromDictionary} of your new words ${newFromDictionary === 1 ? "is" : "are"} from the Dictionary`}
        </p>
      </div>
      <Bao pose={bao ?? "ready"} className="h-28 sm:h-36" />
    </section>
  );
}
