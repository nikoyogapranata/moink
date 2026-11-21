"use client";

import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { hanCount } from "@/lib/book/answers";
import type { BookText, MatchGroup, Option, TaskTable } from "@/lib/book/types";
import type { Json } from "@/lib/supabase/database.types";

import { TEXT_DELAY_MS, useAnswer, useBookStore, useScore } from "./store";
import { ZhText } from "./ZhText";

// The HSK Book's answer inputs, plugged into the server-rendered blocks.
// Right/wrong is shown through data-result and styled by book.css only
// while moink extras are on: with extras off the same pick just looks
// selected. Feedback lines, samples, Check and Reset are book-extra.

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

function MoinkTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-pill bg-good-tint px-2 font-body text-[12px] font-medium leading-[18px] text-good-ink">
      moink
    </span>
  );
}

/** "Correct" / "Try again" under an auto-checked item (extras only). */
function Feedback({ result }: { result: "correct" | "wrong" | null }) {
  return (
    <p aria-live="polite" className="book-extra flex min-h-6 items-center gap-2 font-body text-[13px]">
      {result === "correct" && (
        <>
          <span className="inline-flex items-center gap-1 font-medium text-deep-grass">
            <Check size={15} aria-hidden="true" /> Correct
          </span>
          <span className="text-bark-muted">Answer key by moink</span>
        </>
      )}
      {result === "wrong" && (
        <>
          <span className="inline-flex items-center gap-1 font-medium text-danger">
            <X size={15} aria-hidden="true" /> Try again
          </span>
          <span className="text-bark-muted">Answer key by moink</span>
        </>
      )}
    </p>
  );
}

const asText = (v: Json | undefined) => (typeof v === "string" ? v : "");
const asList = (v: Json | undefined, n: number): (string | null)[] =>
  Array.from({ length: n }, (_, i) => (Array.isArray(v) && typeof v[i] === "string" ? (v[i] as string) : null));

/* ---------------------------------------------------------------------------
   choice
   --------------------------------------------------------------------------- */

/** A choice item's options as pills; the pick is checked at once. */
export function ChoicePills({ itemKey, options, answer }: { itemKey: string; options: Option[]; answer: string }) {
  const store = useBookStore();
  const saved = useAnswer(itemKey);
  const picked = asText(saved?.answer);
  // Bumped on every pick so a wrong pick shakes again.
  const [attempt, setAttempt] = useState(0);
  const result = picked ? (picked === answer ? "correct" : "wrong") : null;

  return (
    <div>
      <div role="group" aria-label="Options" className="flex flex-wrap gap-2 pt-1">
        {options.map((o) => {
          const selected = picked === o.label;
          return (
            <button
              key={selected ? `${o.label}-${attempt}` : o.label}
              type="button"
              aria-pressed={selected}
              data-selected={selected || undefined}
              data-result={selected ? (result ?? undefined) : undefined}
              onClick={() => {
                setAttempt((a) => a + 1);
                store.setAnswer(itemKey, o.label, o.label === answer);
              }}
              className={`book-pick inline-flex min-h-11 items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface-raised px-3.5 text-left transition-colors hover:border-bark-muted/50 ${FOCUS_RING}`}
            >
              <span className="font-body text-[15px] font-medium text-rust-dark">{o.label}</span>
              <ZhText text={o.text} className="text-[18px] leading-[2.2] text-bark" />
            </button>
          );
        })}
      </div>
      <Feedback result={result} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Picker: a small listbox popover (word_bank, passage_fill, image_match)
   --------------------------------------------------------------------------- */

function Picker({
  options,
  value,
  onPick,
  label,
  result,
  children,
  className = "",
}: {
  options: Option[];
  value: string | null;
  onPick: (label: string) => void;
  /** For screen readers: what this picker fills. */
  label: string;
  result?: "correct" | "wrong" | null;
  /** The trigger's content. */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpenState] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  // A closed picker forgets its place, so the next open measures again.
  // The popover lives on <body>: it takes the reader's 拼音 switch along.
  const [pinyin, setPinyin] = useState("on");
  const setOpen = (value: boolean) => {
    if (value) setPinyin(trigger.current?.closest<HTMLElement>(".book-reader")?.dataset.pinyin ?? "on");
    setOpenState(value);
    if (!value) setPos(null);
  };

  const place = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const height = list.current?.offsetHeight ?? 240;
    const above = r.bottom + 6 + height > window.innerHeight && r.top - 6 - height > 0;
    setPos({ left, top: above ? r.top - 6 - height : r.bottom + 6, above });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  // Into the list once it's placed (a hidden element can't take focus).
  const placed = pos !== null;
  useEffect(() => {
    if (!open || !placed) return;
    const focusTarget =
      list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>("[role=option]");
    focusTarget?.focus();
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={value ? `${label}: ${value}` : `${label}: not answered`}
        data-selected={value ? true : undefined}
        data-result={value ? (result ?? undefined) : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`book-pick inline-flex items-center gap-1 rounded-md border-[1.5px] border-line bg-surface-raised align-baseline transition-colors hover:border-bark-muted/50 ${FOCUS_RING} ${className}`}
      >
        {children}
        <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-bark-muted" />
      </button>
      {open &&
        createPortal(
        // On <body>: blanks sit inside paragraphs (no <div> allowed there)
        // and under the sticky bar's stacking. It keeps the reader's 拼音
        // switch.
        <div
          className="book-reader"
          data-pinyin={pinyin}
        >
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
          className="fixed z-50 flex w-[min(320px,calc(100vw-24px))] flex-col gap-0.5 rounded-lg border-[1.5px] border-line bg-surface-raised p-1.5 text-left shadow-float"
        >
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="option"
              aria-selected={value === o.label}
              onClick={() => {
                onPick(o.label);
                close();
              }}
              className={`flex items-baseline gap-2 rounded-md px-2.5 py-0.5 text-left transition-colors hover:bg-highlight/60 focus:bg-highlight/60 focus:outline-none ${
                value === o.label ? "bg-highlight" : ""
              }`}
            >
              <span className="font-body text-[15px] font-medium text-rust-dark">{o.label}</span>
              <ZhText text={o.text} className="text-[17px] leading-[2.2] text-bark" />
            </button>
          ))}
        </div>
        </div>,
          document.body,
        )}
    </>
  );
}

const optionText = (options: Option[], label: string | null) => options.find((o) => o.label === label)?.text ?? null;

/* ---------------------------------------------------------------------------
   word_bank, image_match: one pick per item, checked at once
   --------------------------------------------------------------------------- */

/** A word_bank blank: shows the chosen word (with pinyin) once picked. */
export function BankBlank({ itemKey, num, options, answer }: { itemKey: string; num: string; options: Option[]; answer: string }) {
  const store = useBookStore();
  const picked = asText(useAnswer(itemKey)?.answer) || null;
  const result = picked ? (picked === answer ? "correct" : "wrong") : null;
  const text = optionText(options, picked);
  return (
    <Picker
      options={options}
      value={picked}
      result={result}
      label={`Blank ${num}`}
      onPick={(l) => store.setAnswer(itemKey, l, l === answer)}
      className="mx-1 min-w-[4em] justify-center px-1.5"
    >
      {text ? <ZhText text={text} /> : <span className="inline-block w-[3em]" aria-hidden="true" />}
    </Picker>
  );
}

/** Correct / Try again after a word_bank item. */
export function ItemFeedback({ itemKey, answer }: { itemKey: string; answer: string }) {
  const picked = asText(useAnswer(itemKey)?.answer);
  return <Feedback result={picked ? (picked === answer ? "correct" : "wrong") : null} />;
}

/** The label picker under an image_match picture. */
export function MatchPicker({ itemKey, num, options, answer }: { itemKey: string; num: number; options: Option[]; answer: string }) {
  const store = useBookStore();
  const picked = asText(useAnswer(itemKey)?.answer) || null;
  const result = picked ? (picked === answer ? "correct" : "wrong") : null;
  const text = optionText(options, picked);
  return (
    <div className="flex flex-col items-center">
      <Picker
        options={options}
        value={picked}
        result={result}
        label={`Picture ${num}`}
        onPick={(l) => store.setAnswer(itemKey, l, l === answer)}
        className="min-h-11 max-w-full px-2.5"
      >
        <span className="font-body text-[15px] text-bark-muted">{num}.</span>
        {picked && text ? (
          <>
            <span className="font-body text-[15px] font-medium text-rust-dark">{picked}</span>
            <ZhText text={text} className="text-[17px] leading-[2.2] text-bark" />
          </>
        ) : (
          <span className="font-body text-[14px] text-bark-muted">Choose</span>
        )}
      </Picker>
      <span className="book-extra">
        {result === "correct" && <span className="font-body text-[13px] font-medium text-deep-grass">Correct</span>}
        {result === "wrong" && <span className="font-body text-[13px] font-medium text-danger">Try again</span>}
      </span>
    </div>
  );
}

/** A grouped image's saved picks, by group key. */
const asPicks = (v: Json | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  }
  return out;
};

/** One group's picker under a grouped image_match picture ("菜名 Dish"),
 *  offering only that group's labels and checked on its own. The image's
 *  answer is saved as one label per group; it counts as correct once every
 *  group is picked right, wrong once any pick is wrong. */
export function GroupMatchPicker({
  itemKey,
  num,
  options,
  group,
  groups,
  answer,
}: {
  itemKey: string;
  num: number;
  options: Option[];
  group: MatchGroup;
  groups: MatchGroup[];
  answer: Record<string, string>;
}) {
  const store = useBookStore();
  const picked = asPicks(useAnswer(itemKey)?.answer)[group.key] ?? null;
  const result = picked ? (picked === answer[group.key] ? "correct" : "wrong") : null;
  const text = optionText(options, picked);
  const own = options.filter((o) => group.labels.includes(o.label));

  const pick = (label: string) => {
    const picks = { ...asPicks(store.getAnswer(itemKey)?.answer), [group.key]: label };
    const wrong = groups.some((g) => picks[g.key] && picks[g.key] !== answer[g.key]);
    const done = groups.every((g) => picks[g.key]);
    store.setAnswer(itemKey, picks, wrong ? false : done ? true : null);
  };

  return (
    <div className="flex w-full flex-col items-center">
      <span className="font-body text-[12px] leading-4 text-bark-muted">
        <span lang="zh-CN" className="font-hanzi">
          {group.label_zh}
        </span>{" "}
        {group.label_en}
      </span>
      <Picker
        options={own}
        value={picked}
        result={result}
        label={`Picture ${num}, ${group.label_en} (${group.label_zh})`}
        onPick={pick}
        className="min-h-11 max-w-full px-2.5"
      >
        {picked && text ? (
          <>
            <span className="font-body text-[15px] font-medium text-rust-dark">{picked}</span>
            <ZhText text={text} className="text-[17px] leading-[2.2] text-bark" />
          </>
        ) : (
          <span className="font-body text-[14px] text-bark-muted">
            Choose {own[0]?.label}–{own[own.length - 1]?.label}
          </span>
        )}
      </Picker>
      <span className="book-extra">
        {result === "correct" && <span className="font-body text-[13px] font-medium text-deep-grass">Correct</span>}
        {result === "wrong" && <span className="font-body text-[13px] font-medium text-danger">Try again</span>}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   passage_fill: pick every blank, then Check
   --------------------------------------------------------------------------- */

export function PassageBlank({
  answerKey,
  index,
  count,
  options,
  answers,
}: {
  answerKey: string;
  index: number;
  count: number;
  options: Option[];
  answers: string[];
}) {
  const store = useBookStore();
  const saved = useAnswer(answerKey);
  const picks = asList(saved?.answer, count);
  const picked = picks[index];
  const checked = saved?.is_correct !== null && saved?.is_correct !== undefined;
  const result = checked && picked ? (picked === answers[index] ? "correct" : "wrong") : null;
  const text = optionText(options, picked);
  return (
    <Picker
      options={options}
      value={picked}
      result={result}
      label={`Blank ${index + 1}`}
      // A new pick un-checks the passage until Check again.
      onPick={(l) => {
        const next = asList(store.getAnswer(answerKey)?.answer, count);
        next[index] = l;
        store.setAnswer(answerKey, next, null);
      }}
      className="mx-0.5 px-1.5 indent-0"
    >
      <span className="font-body text-[12px] font-medium text-bark-muted">{index + 1}</span>
      {text ? <ZhText text={text} /> : <span className="inline-block w-[3em]" aria-hidden="true" />}
    </Picker>
  );
}

/** Checks every blank of a passage_fill at once. */
export function PassageCheck({ answerKey, answers }: { answerKey: string; answers: string[] }) {
  const store = useBookStore();
  const saved = useAnswer(answerKey);
  const picks = asList(saved?.answer, answers.length);
  const checked = saved?.is_correct !== null && saved?.is_correct !== undefined;
  const right = picks.filter((p, i) => p === answers[i]).length;
  return (
    <div className="book-extra flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => store.setAnswer(answerKey, picks, right === answers.length)}
        disabled={picks.every((p) => p === null)}
        className={`inline-flex min-h-10 items-center rounded-pill bg-rust px-4 font-heading text-[17px] font-bold text-background transition-colors hover:bg-rust-dark disabled:opacity-50 ${FOCUS_RING}`}
      >
        Check
      </button>
      <p aria-live="polite" className="font-body text-[13px] text-bark-muted">
        {checked && (
          <>
            <span className={right === answers.length ? "font-medium text-deep-grass" : "font-medium text-bark"}>
              {right} of {answers.length} right
            </span>{" "}
            · Answer key by moink
          </>
        )}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Reset (auto-checked blocks)
   --------------------------------------------------------------------------- */

export function ResetAnswers({ keys }: { keys: string[] }) {
  const store = useBookStore();
  // Shown once anything in the block is answered.
  const any = useSyncExternalStore(
    store.subscribe,
    () => keys.some((k) => store.getAnswer(k)),
    () => keys.some((k) => store.getAnswer(k)),
  );
  if (!any) return null;
  return (
    <button
      type="button"
      onClick={() => store.clearAnswers(keys)}
      className={`inline-flex min-h-9 items-center gap-1.5 self-start rounded-md font-body text-[13px] font-medium text-bark-muted underline-offset-4 hover:text-bark hover:underline ${FOCUS_RING}`}
    >
      <RotateCcw size={14} aria-hidden="true" />
      Reset
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Free text: inline blanks and textareas. IME-friendly: nothing is saved
   while a composition is open, only on compositionend, a pause or blur.
   --------------------------------------------------------------------------- */

/** An inline input where {_} is, growing with its text. */
export function FillBlank({ itemKey, index, count, label }: { itemKey: string; index: number; count: number; label: string }) {
  const store = useBookStore();
  const saved = asList(useAnswer(itemKey)?.answer, count)[index] ?? "";
  const [value, setValue] = useState(saved);
  // No saving while an IME composition is open.
  const composingRef = useRef(false);

  const save = (text: string, delay: number) => {
    const next = asList(store.getAnswer(itemKey)?.answer, count).map((v) => v ?? "");
    if (next[index] === text) return;
    next[index] = text;
    store.setAnswer(itemKey, next, null, delay);
  };

  // Han characters about 1em, other text about half.
  const han = hanCount(value);
  const width = Math.max(4, han + (value.length - han) * 0.55 + 1.2);

  return (
    <input
      type="text"
      value={value}
      aria-label={label}
      autoComplete="off"
      spellCheck={false}
      lang="zh-CN"
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onChange={(e) => {
        setValue(e.target.value);
        if (!composingRef.current) save(e.target.value, TEXT_DELAY_MS);
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        save(e.currentTarget.value, TEXT_DELAY_MS);
      }}
      onBlur={(e) => {
        save(e.currentTarget.value, 0);
        store.flush(`a:${itemKey}`);
      }}
      style={{ width: `${width}em` }}
      className="book-fill mx-1 max-w-full rounded-t-[4px] border-b-[1.5px] border-bark-muted bg-highlight/30 px-1 text-center font-hanzi text-bark focus:border-rust focus:bg-highlight/60 focus:outline-none"
    />
  );
}

/** A saved table answer as exactly rows × cols strings. */
const asGrid = (v: Json | undefined, rows: number, cols: number): string[][] =>
  Array.from({ length: rows }, (_, r) => {
    const row = Array.isArray(v) ? v[r] : undefined;
    return Array.from({ length: cols }, (_, c) => (Array.isArray(row) && typeof row[c] === "string" ? (row[c] as string) : ""));
  });

/** One cell of a task table: saves the whole grid, like FillBlank does its
 *  list. */
function TableCell({ answerKey, row, col, rows, cols, label }: { answerKey: string; row: number; col: number; rows: number; cols: number; label: string }) {
  const store = useBookStore();
  const saved = asGrid(useAnswer(answerKey)?.answer, rows, cols)[row][col];
  const [value, setValue] = useState(saved);
  // No saving while an IME composition is open.
  const composingRef = useRef(false);

  const save = (text: string, delay: number) => {
    const grid = asGrid(store.getAnswer(answerKey)?.answer, rows, cols);
    if (grid[row][col] === text) return;
    grid[row][col] = text;
    store.setAnswer(answerKey, grid, null, delay);
  };

  return (
    <input
      type="text"
      value={value}
      aria-label={label}
      autoComplete="off"
      spellCheck={false}
      lang="zh-CN"
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onChange={(e) => {
        setValue(e.target.value);
        if (!composingRef.current) save(e.target.value, TEXT_DELAY_MS);
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        save(e.currentTarget.value, TEXT_DELAY_MS);
      }}
      onBlur={(e) => {
        save(e.currentTarget.value, 0);
        store.flush(`a:${answerKey}`);
      }}
      className="h-11 w-full min-w-0 rounded-md border-[1.5px] border-transparent bg-transparent px-2 font-hanzi text-[16px] text-bark hover:border-line focus:border-rust focus:bg-surface-raised focus:outline-none"
    />
  );
}

/** A task's survey table (answer_mode "table"), saved under its
 *  answer_key as rows of cell strings. Wider than a phone: it scrolls
 *  sideways inside its card rather than squeezing the columns. */
export function TableAnswer({ answerKey, table }: { answerKey: string; table: TaskTable }) {
  const cols = table.columns.length;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className="w-full min-w-136 border-separate border-spacing-0 rounded-lg border-[1.5px] border-line">
        <thead>
          <tr>
            {table.numbered && (
              <th className="w-10 border-b-[1.5px] border-line">
                <span className="sr-only">Row</span>
              </th>
            )}
            {table.columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={`border-b-[1.5px] border-line px-2 pb-1.5 text-left align-bottom font-normal ${i > 0 || table.numbered ? "border-l-[1.5px]" : ""}`}
              >
                <ZhText text={c.text} className="book-zh block font-bold text-bark" />
                <span className="book-en block font-body text-[13px]! leading-4">{c.en}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: table.rows }, (_, r) => (
            <tr key={r}>
              {table.numbered && (
                <th scope="row" className={`text-center font-body text-[15px] font-medium text-bark-muted ${r > 0 ? "border-t-[1.5px] border-line" : ""}`}>
                  {r + 1}
                </th>
              )}
              {table.columns.map((c, i) => (
                <td
                  key={i}
                  className={`p-1 ${r > 0 ? "border-t-[1.5px]" : ""} ${i > 0 || table.numbered ? "border-l-[1.5px]" : ""} border-line`}
                >
                  <TableCell
                    answerKey={answerKey}
                    row={r}
                    col={i}
                    rows={table.rows}
                    cols={cols}
                    label={`Row ${r + 1}, ${c.en} (${c.text.zh})`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A textarea answer (prompts, retell, picture_write, task). */
export function AnswerBox({
  answerKey,
  label,
  placeholder = "Write your answer",
  minChars,
}: {
  answerKey: string;
  label: string;
  placeholder?: string;
  minChars?: number;
}) {
  const store = useBookStore();
  const saved = asText(useAnswer(answerKey)?.answer);
  const [value, setValue] = useState(saved);
  const ref = useRef<HTMLTextAreaElement>(null);
  // No saving while an IME composition is open.
  const composingRef = useRef(false);

  // Auto height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  const save = (text: string, delay: number) => {
    if (asText(store.getAnswer(answerKey)?.answer) === text) return;
    store.setAnswer(answerKey, text, null, delay);
  };
  const count = hanCount(value);

  return (
    <div className="flex flex-col gap-1">
      <textarea
        ref={ref}
        value={value}
        rows={2}
        aria-label={label}
        placeholder={placeholder}
        lang="zh-CN"
        onCompositionStart={() => {
        composingRef.current = true;
      }}
        onChange={(e) => {
          setValue(e.target.value);
          if (!composingRef.current) save(e.target.value, TEXT_DELAY_MS);
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          save(e.currentTarget.value, TEXT_DELAY_MS);
        }}
        onBlur={(e) => {
          save(e.currentTarget.value, 0);
          store.flush(`a:${answerKey}`);
        }}
        className="w-full resize-none overflow-hidden rounded-md border-[1.5px] border-line bg-surface-raised px-3 py-2 font-hanzi text-[17px] leading-[1.7] text-bark placeholder:font-body placeholder:text-[15px] placeholder:text-bark-muted/70 focus:border-rust focus:outline-none"
      />
      {minChars ? (
        <p aria-live="polite" className="self-end font-body text-[13px] text-bark-muted">
          <span className={count >= minChars ? "font-medium text-deep-grass" : ""}>{count}</span> / {minChars}
          <span className="sr-only"> Chinese characters</span>
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Samples: "Show sample" once something is written (or after "I'm stuck")
   --------------------------------------------------------------------------- */

const hasText = (v: Json | undefined): boolean =>
  typeof v === "string" ? v.trim() !== "" : Array.isArray(v) ? v.some((x) => hasText(x as Json)) : false;

export function SampleReveal({ answerKey, sample }: { answerKey: string; sample: BookText[] }) {
  const typed = hasText(useAnswer(answerKey)?.answer);
  const [stuck, setStuck] = useState(false);
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className="book-extra flex flex-col items-start gap-1">
      {!shown && (
        <div className="flex flex-wrap items-center gap-3">
          {typed || stuck ? (
            <button
              type="button"
              aria-expanded={false}
              aria-controls={id}
              onClick={() => setShown(true)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md font-body text-[13px] font-medium text-rust-dark underline-offset-4 hover:underline ${FOCUS_RING}`}
            >
              Show sample
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStuck(true)}
              className={`inline-flex min-h-9 items-center rounded-md font-body text-[13px] text-bark-muted underline-offset-4 hover:text-bark hover:underline ${FOCUS_RING}`}
            >
              I&apos;m stuck
            </button>
          )}
        </div>
      )}
      {shown && (
        <div id={id} className="flex w-full flex-col gap-1 rounded-md bg-good-tint/50 px-3 py-2">
          <p className="flex items-center gap-2 font-body text-[13px] font-medium text-bark">
            Sample <MoinkTag />
            <button
              type="button"
              onClick={() => setShown(false)}
              className={`ml-auto rounded-md font-body text-[13px] text-bark-muted underline-offset-4 hover:underline ${FOCUS_RING}`}
            >
              Hide
            </button>
          </p>
          {sample.map((t, i) => (
            <ZhText key={i} text={t} className="book-zh text-bark" />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   self_check and objectives
   --------------------------------------------------------------------------- */

export function SelfCheckRadio({ rowKey, value, label }: { rowKey: string; value: string; label: string }) {
  const store = useBookStore();
  const picked = asText(useAnswer(rowKey)?.answer);
  return (
    <input
      type="radio"
      name={rowKey}
      value={value}
      checked={picked === value}
      aria-label={label}
      onChange={() => store.setAnswer(rowKey, value, null)}
      className="h-5 w-5 cursor-pointer accent-rust"
    />
  );
}

export function ObjectiveCheck({ itemKey, label }: { itemKey: string; label: string }) {
  const store = useBookStore();
  const checked = useAnswer(itemKey)?.answer === true;
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(e) => store.setAnswer(itemKey, e.target.checked, null)}
      className="h-4.5 w-4.5 cursor-pointer accent-deep-grass"
    />
  );
}

/* ---------------------------------------------------------------------------
   Score
   --------------------------------------------------------------------------- */

export function BookScore() {
  const score = useScore();
  const [right, total] = score.split("/");
  if (total === "0") return null;
  return (
    <span
      title="Auto-checked answers right"
      className="book-extra inline-flex items-center gap-1 rounded-pill border-[1.5px] border-line px-2.5 py-0.5 font-body text-[13px] font-medium text-bark"
    >
      <Check size={14} aria-hidden="true" className="text-deep-grass" />
      {right} / {total}
      <span className="sr-only"> auto-checked answers right</span>
    </span>
  );
}
