"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { StandardChoice } from "@/components/app/StandardChoice";
import { HillScene, MOUND_PEAK_X, hillSurfaceAt } from "@/components/HillScene";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/Wordmark";
import { closestLevel, levelLabel, type HskStandard } from "@/lib/hsk";
import { normalizeUsernameInput, usernameProblem } from "@/lib/username";

import { checkUsername, completeOnboarding } from "./actions";
import { LEVEL_CARDS } from "./levels";

// Bao's poses. feetY / topY are the measured soles and crown as fractions of
// the image height, feetX the middle of his feet as a fraction of its width,
// so every pose renders at the same figure height with his feet on the
// same spot. bubbleX is how far right of his feet (in figure heights) his
// head, or a raised fist, reaches; the desktop bubble starts just past it.
// TODO: swap think for a dedicated thinking pose when one exists;
// it reuses the reading pose for now.
const BAO_POSES = {
  wave: {
    src: "/images/mascot/bao/wave-1-tight.webp",
    width: 1278,
    height: 1363,
    alt: "Bao waving hello",
    topY: 0.023,
    feetY: 0.888,
    feetX: 0.43,
    bubbleX: 0.33,
  },
  think: {
    src: "/images/mascot/bao/feature-2-reading.webp",
    width: 717,
    height: 900,
    alt: "Bao reading a book, thinking",
    topY: 0.023,
    feetY: 0.874,
    feetX: 0.351,
    bubbleX: 0.33,
  },
  cheer: {
    src: "/images/mascot/bao/feature-3-celebrate.webp",
    width: 776,
    height: 900,
    alt: "Bao cheering with both arms up",
    topY: 0.117,
    feetY: 0.961,
    feetX: 0.41,
    bubbleX: 0.45,
  },
} as const;

type BaoPose = keyof typeof BAO_POSES;

// Bamboo to Bao's left on the desktop mound, sized in his figure heights
// (--bao-h) so the two scale together; the width follows from the height.
// The image is all stalk from top to bottom with a flat base; its tallest
// stalk is on its right side and leans right toward the top.
//   scale    image height: the tallest stalk stands 1.05x Bao above the
//            ground, plus the part sunk below it
//   sink     how far the base sits below the peak. The base lands where
//            the mound has already fallen away toward the left edge, so it
//            sinks this deep to stay covered (at least 27px at 1280x720).
//   clear    distance from his feet to the image's right edge, plus GAP_PX.
//            Measured against his silhouette in all three poses: it keeps
//            the rightmost stalk GAP_PX clear of him at every height. The
//            tightest spots are the waving paw and the cheer pose's raised
//            fist; only the leaf sprig on the image's right reaches behind
//            him.
// The rendered height is also capped so the top stays 32px under the top
// bar (68px tall); a short screen shrinks the bamboo instead.
const BAMBOO = {
  src: "/images/mascot/bao/bamboo.webp",
  width: 647,
  height: 1079,
  scale: 1.25,
  sink: 0.2,
  clear: 0.3,
} as const;
const BAMBOO_GAP_PX = 16;
const BAMBOO_TOP_LIMIT = "100px";
// Room the bamboo needs left of Bao's feet, in figure heights plus px:
// the clearance, the image width, the gap and 16px from the screen edge.
const BAMBOO_ROOM = BAMBOO.clear + (BAMBOO.scale * BAMBOO.width) / BAMBOO.height;

// Below lg: where Bao stands on the small dome, as a fraction of the page
// width, and the dome's height there (fraction of its own height). He is on
// a slope, so he sinks a little into the grass in proportion to his size:
// the downhill foot just touches the surface, the uphill one is partly
// hidden by grass.
const BAO_X = 0.3;
const BAO_GROUND = hillSurfaceAt(BAO_X);

// From lg the page is a fixed "stage": the viewport, but never shorter than
// 720px. The mound peaks 72% down it, Bao's feet stand there and he is 42%
// of the stage tall. The form band is centered on him, so everything lines
// up from CSS alone:
//   --feet-y   distance from the top of the page to his soles
//   --bao-h    his figure height, crown to soles
//   --peak-x   where the mound peaks and Bao stands: 22% of the width below
//              xl. From xl (where the bamboo shows) the group of bamboo,
//              Bao and bubble is centered between the screen's left edge
//              and the form: the space left of the bamboo equals the gap
//              from the bubble to the form. Measured against step 2's wider
//              form so Bao doesn't move between steps. Never less than the
//              room the bamboo needs to stay fully on screen.
const STAGE_VARS =
  "lg:[--stage-h:max(100dvh,720px)] lg:[--bao-h:calc(var(--stage-h)*0.42)] lg:[--feet-y:calc(var(--stage-h)*0.72)]";
const PEAK_X = `${MOUND_PEAK_X * 100}%`;
// Step 2 form's left edge: centered in the right half of the max-w-6xl
// container (72rem wide, 1.5rem padding each side), 27.5rem wide.
const FORM_LEFT_XL = "(50vw + (min(100vw, 72rem) - 3rem) / 4 - 13.75rem)";
// Two-line "Where are we / starting?" bubble at xl, about 160px wide; it
// starts 0.33 figure heights + 8px right of his feet.
const BUBBLE_RIGHT_FROM_FEET = "(var(--bao-h) * 0.33 + 8px + 10rem)";
// Left edge of the bamboo, from his feet.
const BAMBOO_LEFT_FROM_FEET = `(var(--bao-h) * ${BAMBOO_ROOM.toFixed(3)} + ${BAMBOO_GAP_PX}px)`;
const PEAK_X_XL = `max(calc(${BAMBOO_LEFT_FROM_FEET} + ${BAMBOO_GAP_PX}px), calc((${FORM_LEFT_XL} + ${BAMBOO_LEFT_FROM_FEET} - ${BUBBLE_RIGHT_FROM_FEET}) / 2))`;

// Speech bubble lines. Each line is kept whole and the bubble sizes to its
// content, so it never wraps mid-sentence.
const BUBBLE = {
  username: ["你好! I'm Bao.", "And you are?"],
  level: ["Where are we", "starting?"],
  done: ["加油!", "Let's go."],
};

const CELEBRATE_MS = 700;
const CHECK_DEBOUNCE_MS = 400;

type Step = 1 | 2;
type UsernameStatus =
  | "idle"
  | "invalid"
  | "checking"
  | "available"
  | "taken"
  | "error";

const numberFormat = new Intl.NumberFormat("en-US");

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Icons */

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="spin shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="shrink-0 text-danger">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M12 7v6" stroke="var(--color-background)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="16.75" r="1.4" fill="var(--color-background)" />
    </svg>
  );
}

/* Bao and the hill */

function BaoScene({ pose, bubble }: { pose: BaoPose; bubble: string[] }) {
  const bambooH = `min(calc(var(--bao-h) * ${BAMBOO.scale}), calc((var(--feet-y) - ${BAMBOO_TOP_LIMIT}) * ${BAMBOO.scale / (BAMBOO.scale - BAMBOO.sink)}))`;
  const vars = {
    "--ground": BAO_GROUND,
    "--bubble-x": BAO_POSES[pose].bubbleX,
    // The point between Bao's feet, for each layout.
    "--anchor-x": `${BAO_X * 100}%`,
    "--anchor-y":
      "calc(var(--hill-h) * var(--ground) - 2px - var(--bao-h) * 0.015)",
    // Picked per breakpoint by the classes below (inline --peak-x would
    // win over any class).
    "--peak-x-lg": PEAK_X,
    "--peak-x-xl": PEAK_X_XL,
    "--anchor-y-lg": "calc(var(--stage-h) * 0.28 - var(--bao-h) * 0.02)",
  } as CSSProperties;

  return (
    // Below lg: a block at the top of the page, tall enough for Bao and his
    // bubble, on a short dome. From lg: it covers the whole stage, with the
    // mound along the bottom and Bao on its peak.
    <div
      className="pointer-events-none relative h-[calc(var(--hill-h)*var(--ground)+var(--bao-h)+6rem)] shrink-0 overflow-x-clip lg:absolute lg:inset-0 lg:h-auto lg:[--peak-x:var(--peak-x-lg)] xl:[--peak-x:var(--peak-x-xl)]"
      style={vars}
    >
      {/* Bamboo-green ground: Bao's pants are deep-grass, so the lighter
          hill keeps him from blending into it. */}
      <HillScene
        fill="var(--color-bamboo-green)"
        className="absolute inset-x-0 bottom-0 h-(--hill-h) lg:hidden"
      />

      {/* Bamboo, from xl only: below 1280px the left half has no room for
          Bao, the bamboo and the bubble side by side. Positioned from the
          same point as Bao (between his feet), with a right offset, so the
          gap to him is the same at every width. Drawn before the mound so
          the hill covers its flat base, and before Bao so it stays behind
          him. */}
      <div className="absolute bottom-(--anchor-y-lg) left-(--peak-x) hidden size-0 xl:block">
        <Image
          src={BAMBOO.src}
          alt=""
          aria-hidden="true"
          width={BAMBOO.width}
          height={BAMBOO.height}
          sizes="(min-width: 1280px) 420px, 0px"
          className="absolute max-w-none select-none"
          style={{
            height: bambooH,
            width: "auto",
            right: `calc(var(--bao-h) * ${BAMBOO.clear} + ${BAMBOO_GAP_PX}px)`,
            bottom: `calc(var(--bao-h) * 0.02 - ${bambooH} * ${BAMBOO.sink / BAMBOO.scale})`,
          }}
        />
      </div>

      <HillScene
        variant="mound"
        fill="var(--color-bamboo-green)"
        peakX="var(--peak-x)"
        className="absolute inset-x-0 bottom-0 hidden h-[calc(var(--stage-h)*0.28)] lg:block"
      />

      {/* Zero-size anchor at the point between Bao's feet. */}
      <div className="absolute bottom-(--anchor-y) left-(--anchor-x) z-10 size-0 lg:bottom-(--anchor-y-lg) lg:left-(--peak-x)">
        <div className="bao-bob">
          {(Object.keys(BAO_POSES) as BaoPose[]).map((key) => {
            const p = BAO_POSES[key];
            // Image height that makes the figure itself (crown to soles)
            // exactly --bao-h tall.
            const scale = 1 / (p.feetY - p.topY);
            const active = key === pose;
            return (
              <Image
                key={key}
                src={p.src}
                alt={active ? p.alt : ""}
                aria-hidden={!active}
                width={p.width}
                height={p.height}
                priority={key === "wave"}
                sizes="(min-width: 1024px) 480px, 200px"
                className={`bao-pose absolute max-w-none select-none ${active ? "opacity-100" : "opacity-0"}`}
                style={{
                  height: `calc(var(--bao-h) * ${scale})`,
                  width: "auto",
                  bottom: `calc(var(--bao-h) * ${-(1 - p.feetY) * scale})`,
                  left: `calc(var(--bao-h) * ${-p.feetX * (p.width / p.height) * scale})`,
                }}
              />
            );
          })}
        </div>

        {/* Speech bubble. Below lg: above and right of his head, clear of
            his ears even at the top of the bob. From lg: right of his head,
            in the gap before the form. Sized to its lines, which never
            wrap. The tail points down-left at him. */}
        <div
          aria-live="polite"
          className="absolute bottom-[calc(var(--bao-h)+0.75rem)] left-[calc(var(--bao-h)*0.18)] w-max rounded-lg border-2 border-blush bg-background px-4 py-2.5 shadow-float lg:bottom-[calc(var(--bao-h)*0.6)] lg:left-[calc(var(--bao-h)*var(--bubble-x)+0.5rem)] lg:px-5 lg:py-3"
        >
          <span
            key={bubble.join(" ")}
            className="bubble-text-in block font-heading text-body font-medium text-bark lg:text-h3 xl:text-h2"
          >
            {bubble.map((line) => (
              <span key={line} className="block whitespace-nowrap">
                {line}
              </span>
            ))}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 18 16"
            width="18"
            height="16"
            className="absolute left-4 top-[calc(100%-2px)]"
          >
            <path d="M3 0 L1 15 L15 0 Z" fill="var(--color-background)" />
            <path
              d="M3 0 L1 15 L15 0"
              fill="none"
              stroke="var(--color-blush)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* Header */

function TopBar({ step }: { step: Step }) {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Wordmark />

        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="flex items-center gap-1.5">
            {[1, 2].map((n) => (
              <span
                key={n}
                className={`h-2 rounded-pill transition-[width,background-color] duration-250 ${
                  n === step ? "w-6 bg-rust" : "w-3 bg-blush"
                }`}
              />
            ))}
          </div>
          <p className="font-body text-body-sm text-bark-muted">
            Step {step} of 2
          </p>
        </div>
      </div>
    </header>
  );
}

/* Step 1 */

const STATUS_BORDER: Record<UsernameStatus, string> = {
  idle: "border-bark-muted",
  checking: "border-bark-muted",
  error: "border-bark-muted",
  invalid: "border-danger",
  taken: "border-danger",
  available: "border-bamboo-green",
};

function UsernameHelper({
  status,
  problem,
}: {
  status: UsernameStatus;
  problem: string | null;
}) {
  // Error text stays text-bark: danger is under 4.5:1 on the light
  // background at this size, so the color rides on the icon and border.
  switch (status) {
    case "invalid":
      return (
        <>
          <AlertIcon />
          <span className="text-bark">{problem}</span>
        </>
      );
    case "taken":
      return (
        <>
          <AlertIcon />
          <span className="text-bark">
            Someone already has that one. Try another.
          </span>
        </>
      );
    case "checking":
      return (
        <>
          <span className="text-bark-muted">
            <SpinnerIcon />
          </span>
          <span className="text-bark-muted">Checking...</span>
        </>
      );
    case "available":
      return (
        <>
          <CheckIcon className="text-deep-grass" />
          <span className="text-deep-grass">Nice, that one&apos;s free</span>
        </>
      );
    case "error":
      return (
        <span className="text-bark">
          Couldn&apos;t check that right now. Try again in a moment.
        </span>
      );
    default:
      return null;
  }
}

/* Main flow */

export function OnboardingFlow({
  suggestedUsername,
}: {
  suggestedUsername: string | null;
}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  // Which way the incoming step slides from: forward comes from the right.
  const [direction, setDirection] = useState<1 | -1>(1);
  const [username, setUsername] = useState(suggestedUsername ?? "");
  // HSK 3.0 by default; the level is one of the standard's.
  const [standard, setStandard] = useState<HskStandard>("hsk3");
  const [level, setLevel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  // Server answers per name. Keying by name is what makes stale responses
  // harmless: a late answer for "ba" only fills in "ba", it can never
  // overwrite the status of the name currently in the field.
  const [checks, setChecks] = useState<Record<string, "available" | "taken">>({});
  const [failedCheck, setFailedCheck] = useState<string | null>(null);

  const savingRef = useRef(false);
  const firstCheckRef = useRef(true);
  const focusOnStepRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const levelHeadingRef = useRef<HTMLHeadingElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const problem = username ? usernameProblem(username) : null;
  const status: UsernameStatus = !username
    ? "idle"
    : problem
      ? "invalid"
      : (checks[username] ?? (failedCheck === username ? "error" : "checking"));

  const pose: BaoPose = celebrating ? "cheer" : step === 1 ? "wave" : "think";
  const bubble = celebrating
    ? BUBBLE.done
    : step === 1
      ? BUBBLE.username
      : BUBBLE.level;

  // Availability check, only for names that pass the local rules. The
  // prefilled Google suggestion is checked right away on load; everything
  // after waits for typing to pause.
  useEffect(() => {
    if (!username || usernameProblem(username) || checks[username]) return;

    const name = username;
    const delay = firstCheckRef.current ? 0 : CHECK_DEBOUNCE_MS;
    firstCheckRef.current = false;

    const timer = setTimeout(async () => {
      try {
        const result = await checkUsername(name);
        if (result === "available" || result === "taken") {
          setChecks((prev) => ({ ...prev, [name]: result }));
        } else {
          setFailedCheck(name);
        }
      } catch {
        setFailedCheck(name);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [username, checks]);

  // Move focus with the step so keyboard and screen reader users land in
  // the new content. Skipped on first render.
  useEffect(() => {
    if (!focusOnStepRef.current) return;
    focusOnStepRef.current = false;
    if (step === 1) inputRef.current?.focus();
    else levelHeadingRef.current?.focus();
  }, [step]);

  function goToStep(next: Step) {
    setDirection(next > step ? 1 : -1);
    focusOnStepRef.current = true;
    setStep(next);
  }

  function handleUsernameSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "available") goToStep(2);
  }

  const cards = LEVEL_CARDS[standard];
  // From lg, HSK 3.0's seven cards go four across so the step stays as
  // short as HSK 2.0's six in three (two rows either way).
  const wideCols = cards.length > 6 ? 4 : 3;

  /** A level picked in the other standard moves to the closest one. */
  function chooseStandard(next: HskStandard) {
    setLevel((current) => (current === null ? null : closestLevel(current, standard, next)));
    setStandard(next);
  }

  function handleCardKeyDown(event: KeyboardEvent, index: number) {
    const last = cards.length - 1;
    const cols = window.matchMedia("(min-width: 1024px)").matches ? wideCols : 2;
    let next: number;

    switch (event.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "ArrowDown":
        next = Math.min(index + cols, last);
        break;
      case "ArrowUp":
        next = Math.max(index - cols, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    setLevel(cards[next].level);
    cardRefs.current[next]?.focus();
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || level === null) return;

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);

    const result = await completeOnboarding(username, standard, level).catch(
      () => ({ ok: false, error: "unknown" }) as const,
    );

    if (result.ok) {
      // Stay in the saving state through the celebration and navigation.
      setCelebrating(true);
      setTimeout(
        () => router.replace("/dashboard"),
        prefersReducedMotion() ? 0 : CELEBRATE_MS,
      );
      return;
    }

    savingRef.current = false;
    setSaving(false);

    switch (result.error) {
      case "username_taken":
        setChecks((prev) => ({ ...prev, [username]: "taken" }));
        goToStep(1);
        break;
      case "invalid":
        goToStep(1);
        break;
      case "signed_out":
        router.replace("/login");
        break;
      default:
        setSaveError("We couldn't save that. Please try again.");
    }
  }

  const tabbableIndex = Math.max(
    0,
    cards.findIndex((card) => card.level === level),
  );

  return (
    <div
      className={`relative flex min-h-dvh flex-col overflow-x-clip bg-background [--bao-h:8rem] [--hill-h:3.5rem] sm:[--bao-h:11rem] [@media(max-height:640px)_and_(max-width:1023px)]:[--bao-h:6.5rem] lg:min-h-(--stage-h) ${STAGE_VARS}`}
    >
      <TopBar step={step} />

      <BaoScene pose={pose} bubble={bubble} />

      {/* From lg: a band that starts 88px down, just under the header, and
          is symmetric around Bao's vertical center, so whatever it centers
          is centered on him. A step taller than the band (step 2 on a short
          stage) falls back to the top instead of rising into the header. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-6 pt-4 sm:px-6 lg:absolute lg:inset-x-0 lg:top-22 lg:grid lg:h-[calc(var(--feet-y)*2-var(--bao-h)-11rem)] lg:grid-cols-2 lg:p-0 lg:px-6">
        <div aria-hidden="true" className="hidden lg:block" />

        <div className="flex flex-1 flex-col lg:items-center lg:justify-center-safe">
          <div
            key={step}
            className="step-in flex w-full flex-1 flex-col lg:flex-none"
            style={{ "--step-from": `${direction * 12}px` } as CSSProperties}
          >
            {step === 1 ? (
              <form
                onSubmit={handleUsernameSubmit}
                noValidate
                // From lg, Bao's height and centered on him, so the heading
                // lines up with the top of his head. The content is shorter
                // than he is, so Continue lands a little above his feet.
                className="mx-auto flex w-full max-w-90 flex-1 flex-col lg:min-h-(--bao-h)"
              >
                <h1 className="font-heading text-display font-bold text-bark">
                  Pick a username
                </h1>
                <p className="mt-1 font-body text-body text-bark-muted">
                  This is how friends find you on the leaderboard.
                </p>

                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <div
                  className={`mt-6 flex h-12 items-center rounded-md border-2 bg-background px-4 transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-rust/40 ${STATUS_BORDER[status]}`}
                >
                  <span aria-hidden="true" className="select-none font-body text-h3 text-bark-muted">
                    @
                  </span>
                  <input
                    ref={inputRef}
                    id="username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    aria-invalid={status === "invalid" || status === "taken"}
                    aria-describedby="username-status username-hint"
                    className="min-w-0 flex-1 bg-transparent pl-0.5 font-body text-h3 text-bark outline-none placeholder:text-bark-muted/70"
                    placeholder="your_name"
                  />
                </div>

                <p
                  id="username-status"
                  aria-live="polite"
                  className="mt-2 flex min-h-5 items-center gap-1.5 font-body text-body-sm"
                >
                  <UsernameHelper status={status} problem={problem} />
                </p>
                <p id="username-hint" className="mt-1 font-body text-body-sm text-bark-muted">
                  3 to 20 characters: lowercase letters, numbers, underscores.
                </p>

                <div className="mt-auto pt-6 sm:mt-0">
                  <Button
                    type="submit"
                    disabled={status !== "available"}
                    className="w-full"
                  >
                    Continue
                  </Button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleSave}
                className="mx-auto flex w-full max-w-110 flex-1 flex-col"
              >
                <h1
                  ref={levelHeadingRef}
                  tabIndex={-1}
                  className="font-heading text-display font-bold text-bark outline-none"
                >
                  Where are you starting?
                </h1>
                <p className="mt-1 font-body text-body text-bark-muted">
                  You can change this later.
                </p>

                <div className="mt-5">
                  <StandardChoice name="standard" value={standard} onChange={chooseStandard} disabled={saving} />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setLevel(1);
                    cardRefs.current[0]?.focus();
                  }}
                  className="mt-3 flex items-center justify-between gap-3 rounded-md border-2 border-dashed border-bamboo-gold px-4 py-3 text-left font-body text-body text-bark transition-colors hover:bg-bamboo-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
                >
                  <span>
                    Brand new to Chinese?{" "}
                    <span className="font-heading font-bold text-bamboo-gold-dark">
                      Start at HSK 1
                    </span>
                  </span>
                  <span aria-hidden="true" className="font-heading text-h3 text-bamboo-gold-dark">
                    →
                  </span>
                </button>

                <div
                  role="radiogroup"
                  aria-label="Starting level"
                  className={`mt-4 grid grid-cols-2 gap-3 ${wideCols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
                >
                  {cards.map((card, index) => {
                    const selected = card.level === level;
                    return (
                      <button
                        key={card.level}
                        ref={(el) => {
                          cardRefs.current[index] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${levelLabel(card.level, standard)}, about ${numberFormat.format(card.count)} words, for example ${card.word}, ${card.pinyin}`}
                        tabIndex={index === tabbableIndex ? 0 : -1}
                        onClick={() => setLevel(card.level)}
                        onKeyDown={(e) => handleCardKeyDown(e, index)}
                        className={`relative flex flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-3 text-center transition-[border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          selected
                            ? "border-rust bg-rust/10"
                            : "border-bark/15 bg-background hover:border-bark/30"
                        }`}
                      >
                        {selected && (
                          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rust text-background">
                            <CheckIcon />
                          </span>
                        )}
                        <span className="font-heading text-body-sm font-bold text-bark-muted">
                          {levelLabel(card.level, standard)}
                        </span>
                        <span lang="zh-CN" className="text-display font-medium text-bark">
                          {card.word}
                        </span>
                        <span className="font-body text-body-sm text-bark-muted">
                          {card.pinyin}
                        </span>
                        <span className="mt-1 font-body text-caption text-bark-muted">
                          {numberFormat.format(card.count)} words
                        </span>
                      </button>
                    );
                  })}
                </div>

                {saveError && (
                  <p role="alert" className="mt-4 flex items-center gap-1.5 font-body text-body-sm text-bark">
                    <AlertIcon />
                    {saveError}
                  </p>
                )}

                <div className="mt-auto flex items-center gap-3 pt-6 sm:mt-0 sm:pt-8 lg:justify-between">
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    disabled={saving}
                    className="h-11 rounded-pill px-4 font-heading text-body font-medium text-bark-muted transition-colors hover:text-bark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <Button
                    type="submit"
                    disabled={level === null || saving}
                    aria-busy={saving}
                    // While saving it is disabled but should still look
                    // like a live button, not a faded one.
                    className={`flex-1 gap-2 lg:flex-none ${saving ? "opacity-100!" : ""}`}
                  >
                    {saving && <SpinnerIcon />}
                    {saving ? "Saving..." : "Start learning"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
