"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/*
 * Keeps the line being read where it is on screen when a display switch
 * (pinyin, English…) changes line heights or adds and removes lines all over
 * the page. Used by the HSK Book reader and the grammar lessons.
 *
 * Before the switch, `capture` notes the character on the line ~30% down the
 * visible part of the page; once React has applied it, the page is scrolled
 * so that character is back where it was. Meanwhile the root carries
 * data-anchoring, which turns the browser's own scroll anchoring off
 * (globals.css): it would fight this. Only then: the rest of the time it
 * keeps the page still as lazy images load above the screen.
 */

interface ScrollAnchor {
  range: Range | null;
  el: Element;
  top: number;
  /** scrollY once it was last put back: while the page is still there, the
   *  next switch keeps the same anchor (so the same line), not a new one. */
  settledY?: number;
}

/** Whether `a` can anchor a switch that hides `hide`, with the page where it is. */
function reusable(a: ScrollAnchor | null, hide: string): a is ScrollAnchor {
  if (!a?.el.isConnected || a.settledY === undefined || Math.abs(window.scrollY - a.settledY) > 1) return false;
  const node = a.range?.startContainer;
  return !(node?.isConnected === false || (hide && node?.parentElement?.closest(hide)));
}

function anchorTop(a: ScrollAnchor) {
  return (a.range ?? a.el).getBoundingClientRect().top;
}

/** Distance from y to the nearest of these boxes (0 when one crosses it). */
function distanceTo(rects: DOMRectList | DOMRect[], y: number) {
  let best = Infinity;
  for (const r of rects) {
    if (r.width === 0 && r.height === 0) continue;
    best = Math.min(best, y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0);
  }
  return best;
}

/**
 * The reading position: the character on the line ~30% down the visible part
 * of the page (under any sticky bar), as a live Range, so its line can be
 * found again after the line heights change. Looks in the `blocks` nearest
 * that line and skips text matching `hide` (what the switch is about to
 * hide or remove). Falls back to the block.
 */
function findAnchor(content: HTMLElement, blocks: string, barBottom: number, hide: string): ScrollAnchor | null {
  const y = Math.max(barBottom + 8, barBottom + (window.innerHeight - barBottom) * 0.3);
  const near = [...content.querySelectorAll<HTMLElement>(blocks)]
    .map((el) => ({ el, d: distanceTo([el.getBoundingClientRect()], y) }))
    .filter((b) => b.d < Infinity)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  const range = document.createRange();

  for (const { el } of near) {
    // The text node nearest the line...
    let node: Text | null = null;
    let nodeD = Infinity;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      if (!t.data.trim() || (hide && t.parentElement?.closest(hide))) continue;
      range.selectNodeContents(t);
      const d = distanceTo(range.getClientRects(), y);
      if (d < nodeD) {
        node = t;
        nodeD = d;
        if (d === 0) break;
      }
    }
    if (!node) continue;
    // ...and its character nearest the line.
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < node.length && bestD > 0; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const d = distanceTo([range.getBoundingClientRect()], y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    }
    range.setStart(node, best);
    range.setEnd(node, Math.min(best + 1, node.length));
    return { range, el, top: range.getBoundingClientRect().top };
  }
  const el = near[0]?.el;
  return el ? { range: null, el, top: el.getBoundingClientRect().top } : null;
}

/** Scrolls so the anchor is back where it was: now (before paint), on the
 *  next frames, once fonts have loaded (pinyin's font can arrive late) and
 *  whenever the content changes size, for a moment. Stops as soon as the
 *  reader scrolls themselves, then calls `done`. `room(px)` makes the page
 *  that much taller at the bottom when it got too short to scroll that far
 *  (switching near the end). */
function keepAnchor(a: ScrollAnchor, content: Element, room: (px: number) => void, done: () => void) {
  let expected: number | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    done();
  };
  const fix = () => {
    if (stopped) return;
    if (!a.el.isConnected || (expected !== null && Math.abs(window.scrollY - expected) > 1)) {
      stop();
      return;
    }
    const d = anchorTop(a) - a.top;
    if (Math.abs(d) >= 0.5) {
      const short = window.scrollY + d - (document.documentElement.scrollHeight - window.innerHeight);
      if (short > 0) room(Math.ceil(short));
      window.scrollBy({ top: d, behavior: "instant" });
    }
    expected = a.settledY = window.scrollY;
  };
  fix();
  let raf = requestAnimationFrame(() => {
    fix();
    raf = requestAnimationFrame(fix);
  });
  document.fonts?.ready.then(() => requestAnimationFrame(fix));
  // Anything else that changes size meanwhile (a lazy image loading above)
  // would move the page too, with the browser's anchoring off.
  const resized = new ResizeObserver(fix);
  resized.observe(content);
  const timer = window.setTimeout(stop, 1500);
  return () => {
    stop();
    cancelAnimationFrame(raf);
    resized.disconnect();
    window.clearTimeout(timer);
  };
}

/**
 * `root`: gets data-anchoring while correcting. `content`: where the text
 * is, made of `blocks` (a selector). `bar`: a sticky bar at the top, if any.
 * `display`: changes whenever a switch has been applied (the prefs).
 *
 * Call `capture(hide)` right before applying a switch, with a selector for
 * what it hides or removes (or ""). Render `<div ref={spacer} />` at the
 * end of `root`: the room kept at the bottom when the page gets shorter.
 */
export function useKeepReadingPosition({
  root,
  content,
  bar,
  blocks,
  display,
}: {
  root: RefObject<HTMLElement | null>;
  content: RefObject<HTMLElement | null>;
  bar?: RefObject<HTMLElement | null>;
  blocks: string;
  display: unknown;
}) {
  const spacer = useRef<HTMLDivElement>(null);
  const anchor = useRef<ScrollAnchor | null>(null);
  const last = useRef<ScrollAnchor | null>(null);

  function capture(hide: string) {
    if (!content.current || !root.current) return;
    const barBottom = Math.max(0, bar?.current?.getBoundingClientRect().bottom ?? 0);
    anchor.current = reusable(last.current, hide) ? last.current : findAnchor(content.current, blocks, barBottom, hide);
    if (anchor.current) root.current.setAttribute("data-anchoring", "");
  }

  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a || !content.current) return;
    last.current = a;
    const room = (px: number) => {
      const s = spacer.current;
      if (s) s.style.height = `${s.offsetHeight + px}px`;
    };
    return keepAnchor(a, content.current, room, () => {
      // Not when the next switch is already on its way.
      if (!anchor.current && root.current) root.current.removeAttribute("data-anchoring");
    });
  }, [display, root, content]);

  // The room added at the bottom goes as soon as it's out of sight: only
  // the empty part below the screen, so nothing on screen moves.
  useEffect(() => {
    function trim() {
      const s = spacer.current;
      if (!s?.offsetHeight) return;
      const below = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (below > 0.5) s.style.height = `${Math.max(0, s.offsetHeight - below)}px`;
    }
    window.addEventListener("scroll", trim, { passive: true });
    window.addEventListener("resize", trim);
    return () => {
      window.removeEventListener("scroll", trim);
      window.removeEventListener("resize", trim);
    };
  }, []);

  return { capture, spacer };
}
