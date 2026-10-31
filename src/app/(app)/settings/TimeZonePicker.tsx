"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import { browserTimeZone, timeZoneNames, utcOffsetLabel } from "@/lib/time";

const noSubscribe = () => () => {};

/** "America/Argentina/Buenos_Aires" as people read it. */
const readable = (zone: string) => zone.replace(/_/g, " ");

/**
 * A searchable list of IANA time zones: type to filter by name or offset
 * ("tokyo", "utc+9"), arrows and Enter (or a click) to pick, Escape to
 * close. The current zone is preselected when the list opens. Without a
 * pick nothing changes; the caller saves.
 */
export function TimeZonePicker({
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  labelledBy: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;
  const listRef = useRef<HTMLUListElement>(null);
  // Only known after hydration: null on the server and the first pass.
  const device = useSyncExternalStore(noSubscribe, browserTimeZone, () => null);

  // Built on first open (client only), with each zone's offset now.
  const zones = useMemo(
    () => (open ? timeZoneNames(value).map((zone) => ({ zone, offset: utcOffsetLabel(zone) })) : []),
    [open, value],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/_/g, " ");
    if (!q) return zones;
    return zones.filter(({ zone, offset }) => readable(zone).toLowerCase().includes(q) || offset.toLowerCase() === q);
  }, [zones, query]);

  function scrollTo(i: number) {
    listRef.current?.querySelector(`#${CSS.escape(optionId(i))}`)?.scrollIntoView({ block: "nearest" });
  }

  function openList() {
    if (open || disabled) return;
    setQuery("");
    setOpen(true);
    // The current zone, once the list has rendered.
    requestAnimationFrame(() => {
      const i = timeZoneNames(value).indexOf(value);
      setActive(Math.max(i, 0));
      scrollTo(Math.max(i, 0));
    });
  }

  function choose(zone: string) {
    onChange(zone);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openList();
      const next = Math.max(0, Math.min(filtered.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      scrollTo(next);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const pick = filtered[active];
      if (pick) choose(pick.zone);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative max-w-md">
        <input
          type="text"
          role="combobox"
          aria-labelledby={labelledBy}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? optionId(active) : undefined}
          disabled={disabled}
          value={open ? query : readable(value)}
          placeholder={open ? `Search: ${readable(value)}` : undefined}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setQuery("");
          }}
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full rounded-md border-[1.5px] border-line bg-surface-raised pl-3 pr-10 font-body text-body text-bark outline-none transition-[border-color,box-shadow] placeholder:text-bark-muted focus:border-bark-muted focus:ring-2 focus:ring-rust/40 disabled:opacity-60"
        />
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-bark-muted"
        />
        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={labelledBy}
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border-[1.5px] border-line bg-surface-raised py-1 shadow-float"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 font-body text-body text-bark-muted">No time zones match.</li>
            )}
            {filtered.map(({ zone, offset }, i) => {
              const selected = zone === value;
              return (
                <li
                  key={zone}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  // mousedown, not click: the input's blur would close the
                  // list before a click lands.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(zone);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 font-body text-body ${
                    i === active ? "bg-highlight text-bark" : "text-bark"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Check size={16} aria-hidden="true" className={`shrink-0 ${selected ? "text-rust-dark" : "invisible"}`} />
                    <span className="truncate">{readable(zone)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-bark-muted">{offset}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {device && device !== value && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(device)}
          className="self-start rounded-sm font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:opacity-60"
        >
          Use this device&apos;s time zone ({readable(device)})
        </button>
      )}
    </div>
  );
}
