// Same wide, low dome as FinalCta's hill (horizontal tangent at the peak).
// The viewBox runs to y=300, 30 units past where the curve meets the edges
// at y=270, so a thin solid band keeps the hill's corners off the very
// bottom of the screen.
const VIEWBOX_W = 1440;
const VIEWBOX_H = 300;
const HILL_PATH =
  "M0 400 L0 270 C 260 215, 480 130, 720 130 C 960 130, 1180 215, 1440 270 L1440 400 Z";

// Left half of the dome as a cubic Bezier; the right half mirrors it.
const P0 = { x: 0, y: 270 };
const P1 = { x: 260, y: 215 };
const P2 = { x: 480, y: 130 };
const P3 = { x: 720, y: 130 };

function bezier(t: number, a: number, b: number, c: number, d: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/**
 * Height of the hill's surface at a horizontal position, as a fraction of
 * the rendered SVG height measured up from its bottom edge. `x` is a
 * fraction of the width (0 = left edge, 0.5 = peak). Because the SVG uses
 * preserveAspectRatio="none", this fraction holds at every width, so
 * anything that stands on the hill can be placed with
 * `bottom: calc(<hill height> * hillSurfaceAt(x))`.
 */
export function hillSurfaceAt(x: number) {
  const target = Math.min(x, 1 - x) * VIEWBOX_W;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, P0.x, P1.x, P2.x, P3.x) < target) lo = mid;
    else hi = mid;
  }
  const y = bezier(lo, P0.y, P1.y, P2.y, P3.y);
  return (VIEWBOX_H - y) / VIEWBOX_H;
}

// "mound" variant (onboarding, desktop): low, gentle ground. Its peak
// touches the very top of the box with a flat tangent, so whatever stands
// there sits at the top edge. Onboarding makes the box the bottom 28% of
// the screen, which puts the left edge at about 80% of the screen height,
// the peak at 72%, the ground under the form near 88 to 90% and the right
// edge at 92%: a quarter of the screen on the left, a thin strip on the
// right.
//
// The mound is drawn as two halves that meet at the peak, each stretched
// to its own width, so the peak can sit at any CSS position (`peakX`) and
// the slopes on either side keep their shape. The right half starts with a
// short flat top (103 of its 1123 units, 73 to 121px on screen) so a figure
// on the peak has level ground under both feet before the slope begins.
export const MOUND_PEAK_X = 0.22;
const MOUND_LEFT_PATH = "M0 400 L0 114 C 110 45, 210 0, 317 0 L317 400 Z";
const MOUND_RIGHT_PATH =
  "M317 400 L317 0 L420 0 C 500 0, 560 150, 700 240 C 770 285, 1050 288, 1440 286 L1440 400 Z";

/** The hill shared by the login and onboarding pages. Pass the height (and
 *  any positioning) through className; the width is always the full
 *  container. "dome" is the wide, low hill login uses; "mound" is the
 *  raised onboarding hill. `fill` is a CSS color, normally a token. */
export function HillScene({
  className = "h-20 lg:h-35",
  variant = "dome",
  fill = "var(--color-deep-grass)",
  peakX = `${MOUND_PEAK_X * 100}%`,
}: {
  className?: string;
  variant?: "dome" | "mound";
  fill?: string;
  /** Mound only: the peak's horizontal position, any CSS length. */
  peakX?: string;
}) {
  if (variant === "mound") {
    return (
      <div aria-hidden="true" className={`w-full ${className}`}>
        <svg
          viewBox="0 0 317 400"
          preserveAspectRatio="none"
          className="absolute inset-y-0 left-0 block h-full"
          style={{ width: peakX }}
        >
          <path d={MOUND_LEFT_PATH} fill={fill} />
        </svg>
        {/* Starts 1px early so the halves overlap and no hairline shows.
            An absolutely positioned svg doesn't stretch between left and
            right like a div, so it gets an explicit width. */}
        <svg
          viewBox="317 0 1123 400"
          preserveAspectRatio="none"
          className="absolute inset-y-0 block h-full"
          style={{ left: `calc(${peakX} - 1px)`, width: `calc(100% - ${peakX} + 1px)` }}
        >
          <path d={MOUND_RIGHT_PATH} fill={fill} />
        </svg>
      </div>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      preserveAspectRatio="none"
      className={`block w-full shrink-0 ${className}`}
    >
      <path d={HILL_PATH} fill={fill} />
    </svg>
  );
}
