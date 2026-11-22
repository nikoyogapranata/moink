"use client";

import { useEffect, useRef, type ReactNode, type Ref } from "react";

// The sticky bar of the reading pages (HSK Book lessons, grammar lessons):
// section chips on the left, the display switches on the right.

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

/**
 * Stuck to the top of the screen once scrolled to. Its background bleeds
 * into the page gutters (AppShell's --page-gutter), so content scrolls under
 * it cleanly; its content keeps the page's edges. `below`: lines under the
 * row (errors).
 */
export function ReadingBar({
  ref,
  className = "",
  below,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  below?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      className={`sticky top-0 z-20 -mx-(--page-gutter) border-b-[1.5px] border-line bg-background/95 px-(--page-gutter) backdrop-blur ${className}`}
    >
      {/* min-h: as tall with or without the chips (40px) in it. */}
      <div className="flex min-h-14 items-center gap-2 py-2">{children}</div>
      {below}
    </div>
  );
}

export interface ReadingChip {
  id: string;
  label: string;
  /** Hover text (the label in English, say). */
  title?: string;
}

/** Links to the page's sections, the one being read highlighted. `hanzi`:
 *  the labels are Chinese. */
export function SectionChips({
  items,
  active,
  hanzi = false,
  className = "",
}: {
  items: ReadingChip[];
  active: string;
  hanzi?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);

  // Keep the active chip in view in the bar (without scrolling the page).
  useEffect(() => {
    const list = ref.current;
    const chip = list?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + chip.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - 16, behavior: "smooth" });
    }
  }, [active]);

  return (
    <nav aria-label="Sections" className={`min-w-0 flex-1 ${className}`}>
      <ul ref={ref} className="flex gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
        {items.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              data-chip={s.id}
              title={s.title}
              lang={hanzi ? "zh-CN" : undefined}
              aria-current={s.id === active ? "location" : undefined}
              className={`inline-flex h-8 items-center whitespace-nowrap rounded-pill border-[1.5px] px-3 transition-colors ${FOCUS_RING} ${
                hanzi ? "font-hanzi text-[14px]" : "font-body text-[13px]"
              } ${
                s.id === active
                  ? "border-transparent bg-highlight font-medium text-bark"
                  : "border-line text-bark-muted hover:bg-highlight/50 hover:text-bark"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface DisplayToggle {
  key: string;
  label: string;
  title: string;
  lang?: string;
  shown: boolean;
  onToggle: () => void;
}

/** The display switches: on highlighted, off struck through. */
export function DisplayToggles({ toggles, className = "" }: { toggles: DisplayToggle[]; className?: string }) {
  return (
    <div
      role="group"
      aria-label="Show"
      className={`flex h-9 shrink-0 items-center rounded-pill border-[1.5px] border-line bg-surface-raised p-0.5 ${className}`}
    >
      {toggles.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={t.shown}
          title={t.title}
          onClick={t.onToggle}
          lang={t.lang}
          className={`h-full rounded-pill px-2 text-[13px] font-medium transition-colors sm:px-3 ${FOCUS_RING} ${
            t.shown ? "bg-highlight text-bark" : "text-bark-muted line-through decoration-1 hover:text-bark"
          } ${t.lang ? "font-hanzi" : "font-body"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
