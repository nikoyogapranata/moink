"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

type Step = {
  number: string;
  imageSrc: string;
  imageAlt: string;
  // Per-image crop tweaks: source photos aren't framed identically, so
  // these correct for it rather than showing a raw, unadjusted center-crop.
  imageObjectPosition: string;
  // Step 2's source is taller/narrower than the other two, so object-fit:
  // cover naturally scales it up more (~7%) to fill the circle; scaling
  // 1 and 3 up to match keeps all three heads the same size.
  imageScaleClassName?: string;
  title: string;
  description: string;
  backTitle: string;
  backDescription: string;
};

const steps: Step[] = [
  {
    number: "1",
    imageSrc: "/images/mascot/bao/step-1-confident.webp",
    imageAlt: "Bao looking confident and ready to start",
    imageObjectPosition: "50% 35%",
    imageScaleClassName: "scale-[1.07]",
    title: "Pick your HSK level",
    description:
      "Start wherever you are, from absolute beginner (HSK 1) to advanced (HSK 6).",
    backTitle: "Any level welcome",
    backDescription:
      "New to Chinese or brushing up? Start at HSK 1 through HSK 6, and adjust anytime as you grow.",
  },
  {
    number: "2",
    imageSrc: "/images/mascot/bao/step-2-reading.webp",
    imageAlt: "Bao reading a book",
    imageObjectPosition: "50% 35%",
    title: "Review with Bao every day",
    description:
      "Quick flashcards and quizzes that adapt to what you actually need to practice.",
    backTitle: "Smart repetition",
    backDescription:
      "Bao remembers what trips you up and brings it back sooner, so you spend time where it actually counts.",
  },
  {
    number: "3",
    imageSrc: "/images/mascot/bao/step-3-celebrate.webp",
    imageAlt: "Bao celebrating with arms raised",
    imageObjectPosition: "50% 35%",
    imageScaleClassName: "scale-[1.07]",
    title: "Build your streak, level up",
    description:
      "Earn XP, keep your streak alive, and climb the leaderboard with friends.",
    backTitle: "Stay motivated",
    backDescription:
      "Freeze a streak if you miss a day, earn XP, and compare progress with friends each week.",
  },
];

// Static per-card tilt (baked into the card-float animation below) and a
// staggered float duration so the three cards drift out of phase.
const cardRotations = ["-3deg", "2deg", "-2deg"];
const cardFloatDurations = ["4s", "4.6s", "5.2s"];

// Section background: a band-gold fill with a pronounced wavy top and
// bottom edge (built from cubic-bezier SVG paths, not a single arc)
// transitioning into/out of the page background.
function WavyBand() {
  const wavePath =
    "M0,120 C240,300 480,0 720,150 C960,300 1200,30 1440,180 L1440,360 L0,360 Z";

  return (
    <div aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden">
      <svg
        className="absolute top-0 left-0 h-64 w-full text-band-gold"
        viewBox="0 0 1440 360"
        preserveAspectRatio="none"
      >
        <path fill="currentColor" d={wavePath} />
      </svg>

      <div className="absolute inset-x-0 top-64 bottom-64 bg-band-gold" />

      <svg
        className="absolute bottom-0 left-0 h-64 w-full -scale-y-100 text-band-gold"
        viewBox="0 0 1440 360"
        preserveAspectRatio="none"
      >
        <path fill="currentColor" d={wavePath} />
      </svg>
    </div>
  );
}

// Shared across every card so the number badge is pixel-identical
// regardless of which step it labels.
const stepNumberClassName =
  "pointer-events-none absolute top-0 right-6 select-none font-heading text-[120px] font-bold leading-none text-bark/10";

// Shared across every card so the Bao circle is pixel-identical
// regardless of source image aspect ratio; per-step object-position and
// scale correct for each source photo's own framing/aspect quirks.
const avatarFrameClassName =
  "relative z-10 h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-blush shadow-float";

// Both card faces share size, background, and shadow so the flip reveals
// what looks like the same physical card, just with different content.
const cardFaceClassName =
  "flip-card-face flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] bg-background px-8 py-10 text-center shadow-float";

function StepCard({
  step,
  rotation,
  floatDuration,
}: {
  step: Step;
  rotation: string;
  floatDuration: string;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className="card-float h-[320px] w-full"
      style={
        {
          "--card-rotate": rotation,
          transform: `rotate(${rotation})`,
          animationDuration: floatDuration,
        } as CSSProperties
      }
    >
      <div
        className="h-full w-full transition-transform duration-200 hover:scale-[1.03]"
        style={{ perspective: "1000px" }}
      >
        <button
          type="button"
          onClick={() => setIsFlipped((flipped) => !flipped)}
          aria-label={
            isFlipped
              ? "Show less"
              : `Show more about ${step.title.charAt(0).toLowerCase()}${step.title.slice(1)}`
          }
          className={`flip-card-inner ${isFlipped ? "is-flipped" : ""} block w-full appearance-none border-0 bg-transparent p-0 text-left text-inherit cursor-pointer`}
        >
          <div
            aria-hidden={isFlipped}
            className={`flip-card-face--front ${cardFaceClassName}`}
          >
            <span aria-hidden="true" className={stepNumberClassName}>
              {step.number}
            </span>
            <div className={avatarFrameClassName}>
              <Image
                src={step.imageSrc}
                alt={step.imageAlt}
                fill
                sizes="96px"
                className={`object-cover ${step.imageScaleClassName ?? ""}`}
                style={{ objectPosition: step.imageObjectPosition }}
              />
            </div>
            <h3 className="relative z-10 font-heading text-h3 font-bold text-bark">
              {step.title}
            </h3>
            <p className="relative z-10 font-body text-body-sm text-bark-muted">
              {step.description}
            </p>
          </div>

          <div
            aria-hidden={!isFlipped}
            className={`flip-card-face--back ${cardFaceClassName}`}
          >
            <h3 className="relative z-10 font-heading text-h3 font-bold text-bark">
              {step.backTitle}
            </h3>
            <p className="relative z-10 font-body text-body-sm text-bark-muted">
              {step.backDescription}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

function SectionHeading() {
  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <h2 className="text-center font-heading text-h1 font-bold text-bark">
        Getting good at Chinese, the fun way
      </h2>
      <p className="mx-auto mt-4 max-w-prose text-center font-body text-body text-bark">
        No textbooks, no cramming, just a little bit every day.
      </p>
    </div>
  );
}

export function HowItWorks() {
  return (
    <div className="relative overflow-hidden py-40 sm:py-52">
      <WavyBand />
      <SectionHeading />

      <div className="relative z-10 mx-auto mt-12 w-full max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {steps.map((step, index) => (
            <StepCard
              key={step.number}
              step={step}
              rotation={cardRotations[index]}
              floatDuration={cardFloatDurations[index]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
