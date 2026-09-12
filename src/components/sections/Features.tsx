import Image from "next/image";
import type { ReactNode } from "react";

type FeatureRow = {
  title: string;
  body: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  // true = image on the left, text on the right at lg+ ("reversed" order).
  reversed: boolean;
  bobDuration: string;
  decorations: ReactNode[];
};

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M7 3h10v4a5 5 0 0 1-4 4.9V14h2a1 1 0 0 1 0 2h-2v2h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-2H9a1 1 0 0 1 0-2h2v-2.1A5 5 0 0 1 7 7V3Z" />
      <path d="M5 4H3v2a3 3 0 0 0 3 3V7a2 2 0 0 1-1-1.7V4Z" />
      <path d="M19 4h2v2a3 3 0 0 1-3 3V7a2 2 0 0 0 1-1.7V4Z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10Z" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
    </svg>
  );
}

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2c2 3-1 4-1 7 0 1 .5 2 1.5 2 1.2 0 2-1 2-2.3 0-.7-.2-1.2-.4-1.7 2.4 1.6 3.9 4.4 3.9 7 0 4-3.1 7-7 7s-7-3-7-7c0-4.6 3.3-7.7 6-11.5.4-.6 1.3-1 2-.5z" />
    </svg>
  );
}

// Reused across every floating decoration: a fixed set of durations cycled
// with a per-element delay, so none of the 12 elements (3 per row) ever
// land in phase with each other.
const FLOAT_DURATIONS = ["4s", "4.5s", "5s", "5.5s", "6s"];
const FLOAT_CLASSES = ["float-a", "float-b", "float-c", "float-d"];

function floatStyle(index: number) {
  return {
    duration: FLOAT_DURATIONS[index % FLOAT_DURATIONS.length],
    delay: `${(index * 0.4).toFixed(1)}s`,
    floatClass: FLOAT_CLASSES[index % FLOAT_CLASSES.length],
  };
}

const rows: FeatureRow[] = [
  {
    title: "Start exactly where you are",
    body: "Whether you're brand new or brushing up after a break, pick any HSK level from 1 to 6 and jump straight into words that match where you're at. No need to start from zero if you already know the basics, and no pressure to rush ahead before you're ready.",
    imageSrc: "/images/mascot/bao/feature-1-confident.webp",
    imageAlt: "Bao standing confidently, ready to start learning",
    imageWidth: 1294,
    imageHeight: 1391,
    reversed: false,
    bobDuration: "3s",
    decorations: [
      <span
        key="hsk"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(0).duration,
          animationDelay: floatStyle(0).delay,
        }}
        className={`${floatStyle(0).floatClass} pointer-events-none absolute -left-4 -top-3 z-20 hidden rounded-pill bg-rust px-3.5 py-1.5 text-body-sm font-bold text-background shadow-float md:block`}
      >
        HSK 1–6
      </span>,
      <span
        key="one"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(1).duration,
          animationDelay: floatStyle(1).delay,
        }}
        className={`${floatStyle(1).floatClass} pointer-events-none absolute -bottom-3 -right-3 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-blush text-body font-heading font-bold text-bark shadow-float md:flex`}
      >
        1
      </span>,
      <span
        key="sparkle"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(2).duration,
          animationDelay: floatStyle(2).delay,
        }}
        className={`${floatStyle(2).floatClass} pointer-events-none absolute -right-3 -top-3 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-blush shadow-float md:flex`}
      >
        <SparkleIcon className="h-4 w-4 text-bamboo-gold-dark" />
      </span>,
    ],
  },
  {
    title: "Look up any word, see how to write it",
    body: "Search the dictionary and get pinyin, English meanings, and full stroke-order guidance for every character. Whether you're double-checking a word from a review session or just exploring on your own, everything you need sits in one place.",
    imageSrc: "/images/mascot/bao/feature-2-reading.webp",
    imageAlt: "Bao reading a book and looking up a word",
    imageWidth: 1110,
    imageHeight: 1393,
    reversed: true,
    bobDuration: "3.4s",
    decorations: [
      <span
        key="zi"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(3).duration,
          animationDelay: floatStyle(3).delay,
        }}
        className={`${floatStyle(3).floatClass} pointer-events-none absolute -bottom-3 -right-3 z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-blush text-h3 font-heading font-bold text-bark shadow-float md:flex`}
      >
        字
      </span>,
      <span
        key="ci"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(4).duration,
          animationDelay: floatStyle(4).delay,
        }}
        className={`${floatStyle(4).floatClass} pointer-events-none absolute -left-3 -top-3 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-surface text-body font-heading font-bold text-bark shadow-float md:flex`}
      >
        词
      </span>,
      <span
        key="pencil"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(5).duration,
          animationDelay: floatStyle(5).delay,
        }}
        className={`${floatStyle(5).floatClass} pointer-events-none absolute -bottom-2 -left-4 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-blush shadow-float md:flex`}
      >
        <PencilIcon className="h-4 w-4 text-rust-dark" />
      </span>,
    ],
  },
  {
    title: "Small wins, every single day",
    body: "Earn XP for every review, keep your streak alive, and watch your progress add up faster than you'd expect. Bao keeps track of what you've learned and nudges you back to the words you're most likely to forget, right when you need it.",
    imageSrc: "/images/mascot/bao/feature-3-celebrate.webp",
    imageAlt: "Bao celebrating a small win",
    imageWidth: 1222,
    imageHeight: 1416,
    reversed: false,
    bobDuration: "3.8s",
    decorations: [
      <span
        key="xp"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(6).duration,
          animationDelay: floatStyle(6).delay,
        }}
        className={`${floatStyle(6).floatClass} pointer-events-none absolute -right-4 -top-3 z-20 hidden rounded-pill bg-bamboo-gold px-3.5 py-1.5 text-body-sm font-bold text-bark shadow-float md:block`}
      >
        +10 XP
      </span>,
      <span
        key="flame"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(7).duration,
          animationDelay: floatStyle(7).delay,
        }}
        className={`${floatStyle(7).floatClass} pointer-events-none absolute -bottom-3 -left-4 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-blush shadow-float md:flex`}
      >
        <FlameIcon className="h-4 w-4 text-rust-dark" />
      </span>,
      <span
        key="lvl"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(8).duration,
          animationDelay: floatStyle(8).delay,
        }}
        className={`${floatStyle(8).floatClass} pointer-events-none absolute -bottom-3 -right-4 z-20 hidden rounded-pill bg-blush px-3 py-1 text-body-sm font-bold text-bark shadow-float md:block`}
      >
        Lvl 5
      </span>,
    ],
  },
  {
    title: "Bring your friends along",
    body: "Compare streaks, climb weekly leaderboards, and challenge friends to stay accountable together. Learning a language is a lot more fun, and a lot easier to stick with, when you're not doing it alone.",
    imageSrc: "/images/mascot/bao/feature-4-trophy.webp",
    imageAlt: "Bao holding up a trophy",
    imageWidth: 1421,
    imageHeight: 1460,
    reversed: true,
    bobDuration: "4.2s",
    decorations: [
      <span
        key="rank"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(9).duration,
          animationDelay: floatStyle(9).delay,
        }}
        className={`${floatStyle(9).floatClass} pointer-events-none absolute -bottom-3 -left-4 z-20 hidden rounded-pill bg-bamboo-green px-3.5 py-1.5 text-body-sm font-bold text-background shadow-float md:block`}
      >
        #1
      </span>,
      <span
        key="trophy"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(10).duration,
          animationDelay: floatStyle(10).delay,
        }}
        className={`${floatStyle(10).floatClass} pointer-events-none absolute -right-3 -top-3 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-blush shadow-float md:flex`}
      >
        <TrophyIcon className="h-4 w-4 text-deep-grass" />
      </span>,
      <span
        key="friends"
        aria-hidden="true"
        style={{
          animationDuration: floatStyle(11).duration,
          animationDelay: floatStyle(11).delay,
        }}
        className={`${floatStyle(11).floatClass} pointer-events-none absolute -left-4 -top-3 z-20 hidden rounded-pill bg-blush px-3 py-1 text-body-sm font-bold text-bark shadow-float md:block`}
      >
        3 friends
      </span>,
    ],
  },
];

function FeatureRowSection({ row }: { row: FeatureRow }) {
  const imageOrderClassName = row.reversed ? "order-1 lg:order-1" : "order-1 lg:order-2";
  const textOrderClassName = row.reversed ? "order-2 lg:order-2" : "order-2 lg:order-1";

  return (
    <div className="grid grid-cols-1 items-center gap-10 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
      <div className={`flex justify-center ${imageOrderClassName}`}>
        <div className="relative inline-block">
          {row.decorations}
          <div
            className="bao-bob"
            style={{ animationDuration: row.bobDuration }}
          >
            <Image
              src={row.imageSrc}
              alt={row.imageAlt}
              width={row.imageWidth}
              height={row.imageHeight}
              sizes="(min-width: 1024px) 400px, 70vw"
              className="h-80 w-auto select-none object-contain lg:h-96"
            />
          </div>
        </div>
      </div>

      <div
        className={`flex flex-col items-center gap-4 text-center lg:items-start lg:text-left ${textOrderClassName}`}
      >
        <h2 className="font-heading text-hero font-bold text-bark">
          {row.title}
        </h2>
        <p className="max-w-prose font-body text-body text-bark-muted">
          {row.body}
        </p>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {rows.map((row) => (
          <FeatureRowSection key={row.title} row={row} />
        ))}
      </div>
    </section>
  );
}
