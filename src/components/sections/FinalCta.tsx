import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/Button";

// A single wide, low dome. Both control points at the peak share its y, so
// the tangent there is horizontal and the top reads as round, not pointed.
// The SVG gets a fixed pixel height per breakpoint (instead of stretching
// to the box) so preserveAspectRatio="none" can't squeeze it into a steep
// spike on narrow screens. The viewBox is cropped at y=270, where the dome
// meets the viewport edges, so the box ends exactly at the hill's base and
// the Footer's green (same token) continues straight on from there — no
// dead band of solid green under the hill. The heights (135 / 189 / 270px)
// are 270/400 of the original 200 / 280 / 400px, so the curve's on-screen
// shape is unchanged. Peak sits at 130px in viewBox units (65 / 91 / 130px
// on screen) — Bao's anchor below is measured against these.
function Terrain() {
  const path =
    "M0 400 L0 270 C 260 215, 480 130, 720 130 C 960 130, 1180 215, 1440 270 L1440 400 Z";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 270"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 block h-full w-full"
    >
      <path d={path} fill="var(--color-deep-grass)" />
    </svg>
  );
}

// Same flame glyph used for Hero's streak pill.
function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        d="M12 2c2 3-1 4-1 7 0 1 .5 2 1.5 2 1.2 0 2-1 2-2.3 0-.7-.2-1.2-.4-1.7 2.4 1.6 3.9 4.4 3.9 7 0 4-3.1 7-7 7s-7-3-7-7c0-4.6 3.3-7.7 6-11.5.4-.6 1.3-1 2-.5z"
        fill="var(--color-bamboo-gold)"
      />
      <path
        d="M12 11c.6 1 1 2 1 3.2 0 1.5-1.1 2.8-2.6 2.8S8 15.7 8 14.2c0-1.7.9-2.9 1.8-4C10.6 12 11.4 11.4 12 11z"
        fill="var(--color-rust-dark)"
      />
    </svg>
  );
}

export function FinalCta() {
  return (
    <section className="relative bg-background pt-16 lg:pt-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 text-center sm:px-6">
        <h2 className="font-heading text-hero font-bold text-bark">
          Your streak starts today
        </h2>
        <p className="max-w-prose font-body text-body text-bark-muted">
          Join Bao and start learning old HSK vocabulary, one word at a time.
        </p>
        <Button asChild>
          <Link href="/login">Start learning free</Link>
        </Button>
      </div>

      {/* Full-bleed: a sibling of the max-w-6xl container, not inside it,
          so plain w-full already spans edge to edge. (A left-1/2 w-screen
          -translate-x-1/2 breakout would land on half-pixels at odd widths
          like 375px and leave an anti-aliased line down the left edge.)
          mt-110 is large on purpose:
          Bao renders 384–432px tall but his feet sit only ~60–125px below
          the top of this box, so most of his height lives in this margin —
          it has to absorb that, the 8px bob, and a clear gap (~115px+)
          between the button and his crown. */}
      <div className="relative mt-110 h-33.75 w-full overflow-x-clip md:h-47.25 lg:h-67.5">
        <Terrain />

        {/* Sized to Bao's own rendered box, not the section: every prop
            below is positioned relative to THIS, so they cluster tight to
            his silhouette (Hero's badge pattern) instead of floating
            independently around the wider terrain.

            Horizontal: his feet span 16–57% of the image width (the tail
            widens it to the right), so md:translate-x-[-36.5%] centers his
            feet — not the image box — on the dome's peak. Below md it's
            -41% (feet ~14px left of the peak) so the tail tip still fits
            inside a 375px viewport instead of causing horizontal scroll.

            Vertical: drawn in front of the hill, hovering just above it.
            Offsets (60 / 86 / 125px vs. peaks at 65 / 91 / 130px) were
            measured against the curve at the narrowest width of each
            breakpoint, so even at the bottom of the 8px bob every point of
            both soles stays ~16px clear of the dome's surface. They also
            absorb the image's ~2% transparent bottom padding.

            Prop clearances use the image's measured silhouette (left edge
            ≥10% at head height, ≥2.6% at the cape; right edge ≤69% above
            the tail), each kept 20px clear of it. */}
        <div className="absolute left-1/2 top-15 z-10 translate-x-[-41%] -translate-y-full md:top-21.5 md:translate-x-[-36.5%] lg:top-31.25">
          <span
            aria-hidden="true"
            style={{ animationDuration: "4s" }}
            className="float-a pointer-events-none absolute right-[calc(90%+20px)] top-[8%] z-20 hidden items-center gap-2 rounded-pill bg-rust px-4.5 py-2 text-h3 font-bold text-background shadow-float md:flex"
          >
            <FlameIcon />
            12
          </span>

          <span
            aria-hidden="true"
            style={{ animationDuration: "5s" }}
            className="float-b pointer-events-none absolute left-[calc(69%+20px)] top-[27%] z-20 hidden whitespace-nowrap rounded-pill bg-bamboo-gold px-4.5 py-2 text-h3 font-bold text-bark shadow-float md:block"
          >
            +10 XP
          </span>

          <span
            aria-hidden="true"
            style={{ animationDuration: "6s" }}
            className="float-c pointer-events-none absolute right-[calc(97%+20px)] top-[52%] z-20 hidden h-14 w-14 items-center justify-center rounded-full bg-blush text-h2 font-heading font-bold text-bark shadow-float md:flex"
          >
            学
          </span>

          <div className="bao-bob">
            <Image
              src="/images/mascot/bao/cta-king.webp"
              alt="Bao standing proudly at the top of a hill"
              width={1143}
              height={1394}
              sizes="432px"
              // max-w-none: the left-1/2 wrapper only gets half the
              // viewport as available width, and preflight's max-width:100%
              // would otherwise shrink him to ~190px wide on a 375px phone.
              className="h-96 w-auto max-w-none select-none object-contain lg:h-108"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
