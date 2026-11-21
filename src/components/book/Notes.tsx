"use client";

import { ArrowDownRight, NotebookPen, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useBookStore, useNote, useNotes, type SaveStatus } from "./store";

// Notes: one per block (block_key) and one for the whole lesson (block_key
// null), plain text, autosaved. Each block gets a small notes button
// (hover-only on desktop, always there on touch screens); the Lesson notes
// panel lists them all in book order.

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";
/** Asks a block to open its note editor (from the Lesson notes panel). */
const OPEN_EVENT = "book:open-note";

function SavedIndicator({ status }: { status: SaveStatus | undefined }) {
  const text = status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save" : "";
  return (
    <span aria-live="polite" className={`font-body text-[12px] ${status === "error" ? "text-danger" : "text-bark-muted"}`}>
      {text}
    </span>
  );
}

/** A note's textarea: autosaves, grows with its text. */
export function NoteEditor({
  blockKey,
  label,
  autoFocus = false,
  onClose,
}: {
  blockKey: string | null;
  label: string;
  autoFocus?: boolean;
  onClose?: () => void;
}) {
  const store = useBookStore();
  const note = useNote(blockKey);
  const [value, setValue] = useState(note?.body ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, 72)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const save = (text: string) => {
    if ((store.getNote(blockKey)?.body ?? "") !== text) store.setNote(blockKey, text);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={ref}
        value={value}
        aria-label={label}
        placeholder="Write a note…"
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          save(e.currentTarget.value);
        }}
        onChange={(e) => {
          setValue(e.target.value);
          if (!composing.current) save(e.target.value);
        }}
        onBlur={() => store.flush(`n:${blockKey ?? ""}`)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onClose) {
            e.preventDefault();
            onClose();
          }
        }}
        className="w-full resize-none overflow-hidden rounded-md border-[1.5px] border-bamboo-gold/60 bg-learning-tint/40 px-3 py-2 font-body text-[15px] leading-[1.6] text-bark placeholder:text-bark-muted/70 focus:border-bamboo-gold-dark focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <SavedIndicator status={note?.status} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={`ml-auto rounded-md font-body text-[13px] font-medium text-bark-muted underline-offset-4 hover:text-bark hover:underline ${FOCUS_RING}`}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A block with its notes button and, when open, the note editor under it.
 * The button sits in the right margin where there's room (xl), else on
 * the block's top-right corner.
 */
export function BlockNotes({ blockKey, label, children }: { blockKey: string; label: string; children: ReactNode }) {
  const note = useNote(blockKey);
  const [open, setOpen] = useState(false);
  const [focusEditor, setFocusEditor] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const hasNote = Boolean(note?.body.trim());
  const editorId = useId();

  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== blockKey) return;
      setOpen(true);
      setFocusEditor(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [blockKey]);

  const close = () => {
    setOpen(false);
    setFocusEditor(false);
    button.current?.focus();
  };

  return (
    <div className="group/note relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? editorId : undefined}
        aria-label={hasNote ? `Note on ${label} (has a note)` : `Add a note on ${label}`}
        title={hasNote ? "Your note" : "Add a note"}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setFocusEditor(true);
          }
        }}
        className={`absolute -right-2 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-line bg-surface-raised text-bark-muted shadow-float transition-opacity hover:text-bark xl:-right-12 xl:top-0 xl:border-transparent xl:bg-transparent xl:shadow-none ${FOCUS_RING} ${
          open || hasNote
            ? "opacity-100"
            : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/note:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
        }`}
      >
        <NotebookPen size={15} aria-hidden="true" />
        {hasNote && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-bamboo-gold" />}
      </button>
      {children}
      {open && (
        <div id={editorId} className="mt-3">
          <NoteEditor blockKey={blockKey} label={`Note on ${label}`} autoFocus={focusEditor} onClose={close} />
        </div>
      )}
    </div>
  );
}

/** The sticky bar's notes button and the Lesson notes panel: a drawer on
 *  the right from lg, a bottom sheet on phones. */
export function LessonNotes({ blocks }: { blocks: { key: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const order = useRef(blocks.map((b) => b.key)).current;
  const notes = useNotes(order);
  const labels = new Map(blocks.map((b) => [b.key, b.label]));
  const blockNotes = notes.filter((n) => n.blockKey !== null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // Keep Tab inside the panel.
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>("button, a, textarea")];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      html.style.overflow = overflow;
    };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function jump(blockKey: string) {
    setOpen(false);
    // After the panel is gone and the page can scroll again.
    requestAnimationFrame(() => {
      document.getElementById(blockKey)?.scrollIntoView({ block: "start" });
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: blockKey }));
    });
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        title="Lesson notes"
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-surface-raised text-bark-muted transition-colors hover:text-bark ${FOCUS_RING}`}
      >
        <NotebookPen size={17} aria-hidden="true" />
        <span className="sr-only">Lesson notes{notes.length ? ` (${notes.length})` : ""}</span>
        {notes.length > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bamboo-gold px-1 font-body text-[10px] font-medium leading-none text-bark">
            {notes.length}
          </span>
        )}
      </button>

      {open &&
        createPortal(
        // On <body>: inside the sticky bar, its backdrop blur would make
        // the bar the box this fixed panel is placed in.
        <div className="fixed inset-0 z-50">
          <div aria-hidden="true" onClick={close} className="absolute inset-0 bg-bark/30" />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[22px] border-[1.5px] border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-float focus:outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:rounded-none lg:rounded-l-[22px]"
          >
            <div className="flex items-center gap-2 border-b-[1.5px] border-line px-5 py-3">
              <h2 id={titleId} className="font-heading text-h2 font-bold text-bark">
                Lesson notes
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className={`ml-auto flex h-9 w-9 items-center justify-center rounded-full text-bark-muted hover:bg-highlight/60 hover:text-bark ${FOCUS_RING}`}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
              <section className="flex flex-col gap-2">
                <h3 className="font-body text-[13px] font-medium text-bark-muted">For the whole lesson</h3>
                <NoteEditor blockKey={null} label="Note for the whole lesson" />
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="font-body text-[13px] font-medium text-bark-muted">On blocks</h3>
                {blockNotes.length === 0 ? (
                  <p className="font-body text-[14px] text-bark-muted">
                    No notes on blocks yet. Use the <NotebookPen size={13} aria-label="note" className="inline align-[-2px]" /> button next to any block.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {blockNotes.map((n) => (
                      <li key={n.blockKey} className="rounded-md border-[1.5px] border-line px-3 py-2">
                        <button
                          type="button"
                          onClick={() => jump(n.blockKey!)}
                          className={`mb-1 inline-flex items-center gap-1 rounded-md font-hanzi text-[13px] font-medium text-rust-dark underline-offset-4 hover:underline ${FOCUS_RING}`}
                        >
                          {labels.get(n.blockKey!) ?? n.blockKey}
                          <ArrowDownRight size={14} aria-hidden="true" />
                          <span className="sr-only"> (go to this block)</span>
                        </button>
                        <p className="whitespace-pre-wrap font-body text-[15px] leading-[1.6] text-bark">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
