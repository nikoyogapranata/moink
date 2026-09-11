import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/Button";

// Tightly-cropped mascot pose, no dead space around Bao.
const BAO_WIDTH = 1278;
const BAO_HEIGHT = 1363;

export function Hero() {
  return (
    <section className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 overflow-x-clip px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
      {/* Bao, illustration first on mobile, right column on desktop. */}
      <div className="order-1 flex items-center justify-center lg:order-2">
        <div className="relative w-84 max-w-[80%]">
          {/* Speech bubble, floating independently near Bao's head. */}
          <div
            aria-hidden="true"
            className="bao-bubble-float pointer-events-none absolute -top-[2%] right-[10%] z-30 flex items-center rounded-2xl bg-surface px-6 py-4 shadow-float"
          >
            <span
              aria-hidden="true"
              className="absolute -bottom-1.5 left-4 h-3.5 w-3.5 rotate-45 bg-surface"
            />
            <span className="font-heading text-display font-bold text-bark">
              你好
            </span>
          </div>

          {/* Decorative floating elements, clustered just outside Bao's silhouette. */}
          <div
            aria-hidden="true"
            className="float-a pointer-events-none absolute left-[-7%] top-[-3%] z-20 flex items-center gap-1.5 rounded-pill bg-rust px-3.5 py-1.5 text-body-sm font-bold text-background shadow-float"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                d="M12 2c2 3-1 4-1 7 0 1 .5 2 1.5 2 1.2 0 2-1 2-2.3 0-.7-.2-1.2-.4-1.7 2.4 1.6 3.9 4.4 3.9 7 0 4-3.1 7-7 7s-7-3-7-7c0-4.6 3.3-7.7 6-11.5.4-.6 1.3-1 2-.5z"
                fill="var(--color-bamboo-gold)"
              />
              <path
                d="M12 11c.6 1 1 2 1 3.2 0 1.5-1.1 2.8-2.6 2.8S8 15.7 8 14.2c0-1.7.9-2.9 1.8-4C10.6 12 11.4 11.4 12 11z"
                fill="var(--color-rust-dark)"
              />
            </svg>
            12
          </div>

          <div
            aria-hidden="true"
            className="float-b pointer-events-none absolute bottom-[6%] right-[-8%] z-20 flex items-center rounded-pill bg-bamboo-gold px-3.5 py-1.5 text-body-sm font-bold text-bark shadow-float"
          >
            +10 XP
          </div>

          <div
            aria-hidden="true"
            className="float-c pointer-events-none absolute left-[-10%] top-[38%] z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-blush text-h3 font-heading font-bold text-rust-dark md:flex"
          >
            学
          </div>

          <div
            aria-hidden="true"
            className="float-d pointer-events-none absolute bottom-[-5%] left-[22%] z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-bamboo-green/20 text-h3 font-heading font-bold text-deep-grass md:flex"
          >
            字
          </div>

          <div className="bao-bob relative z-10">
            <Image
              src="/images/mascot/bao/wave-1-tight.png"
              alt="Bao waving hello"
              width={BAO_WIDTH}
              height={BAO_HEIGHT}
              priority
              sizes="(min-width: 1024px) 336px, 80vw"
              className="block h-auto w-full select-none object-contain"
            />
          </div>
        </div>
      </div>

      <div className="order-2 mx-auto flex max-w-3xl flex-col items-center gap-6 text-center lg:order-1">
        <h1 className="font-heading text-hero font-bold text-bark">
          Meet Bao, your HSK study buddy
        </h1>
        <p className="max-w-prose font-body text-hero-sub text-bark-muted">
          Learn old HSK vocabulary through daily reviews, quick quizzes, and just
          enough friendly competition to keep you coming back.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Button asChild>
            <Link href="/login">Start learning</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
