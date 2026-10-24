import Image from "next/image";
import Link from "next/link";

// Shared by every footer link: full-strength text (no opacity), underline
// on hover, and a clear outline for keyboard focus.
const linkClassName =
  "rounded-sm font-body text-body text-background underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background";

const headingClassName = "font-heading text-h3 font-bold";

// Sits directly under FinalCta with no margin or top gap, so its
// bg-deep-grass continues the hill's green as one uninterrupted field.
// FinalCta's green ends exactly at the hill's base, so pt-16 / lg:pt-20 is the
// only space between the dome's edges and the first line of text here.
export function Footer() {
  return (
    <footer className="overflow-hidden bg-deep-grass text-background">
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6 lg:pt-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Image
                src="/images/logo/bao.png"
                alt="moink logo"
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg"
              />
              <span className="font-heading text-h1 font-bold">moink</span>
            </div>
            <p className="font-body text-body">Learn Chinese the fun way.</p>
          </div>

          <nav aria-label="Explore" className="flex flex-col gap-3">
            <h2 className={headingClassName}>Explore</h2>
            <ul className="flex flex-col gap-2">
              <li>
                <a href="#how-it-works" className={linkClassName}>
                  How it works
                </a>
              </li>
              <li>
                <a href="#features" className={linkClassName}>
                  Features
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label="Get started" className="flex flex-col gap-3">
            <h2 className={headingClassName}>Get started</h2>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/login" className={linkClassName}>
                  Start learning free
                </Link>
              </li>
              <li>
                <Link href="/login" className={linkClassName}>
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-background/30 pt-6 font-body text-body-sm md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} moink. All rights reserved.</p>
          <p className="md:max-w-md">
            moink is an independent project and is not affiliated with the
            official HSK exam or its administrators. Vocabulary data from{" "}
            <a
              href="https://github.com/drkameleon/complete-hsk-vocabulary"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background"
            >
              complete-hsk-vocabulary
            </a>{" "}
            (MIT).
          </p>
        </div>
      </div>

      {/* Decorative only: outside the max-w-6xl container so it can run
          wide. Measured in Baloo 2 at leading-[0.8]: the glyphs' ink is
          0.717em tall, its top pokes 0.024em above the line box, and its
          bottom sits 0.106em above the box's bottom edge. So mb-[-0.27em]
          lets the footer's overflow-hidden crop ~23% off the bottom of the
          letters, and the em term in mt cancels the ascender overshoot so
          the ink stays exactly 24px below the bottom bar at every size. */}
      <div
        aria-hidden="true"
        className="pointer-events-none mt-[calc(24px+0.024em)] mb-[-0.27em] select-none text-center font-heading text-[clamp(110px,24vw,340px)] leading-[0.8] font-bold tracking-tight text-background/15"
      >
        moink
      </div>
    </footer>
  );
}
