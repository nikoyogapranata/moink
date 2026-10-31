"use client";

import { useId, useState, useTransition } from "react";

import { StandardChoice } from "@/components/app/StandardChoice";
import { CARD } from "@/components/dictionary/SideCards";
import { Button } from "@/components/ui/Button";
import { closestLevel, levelLabel, STANDARD_INFO, STANDARD_LEVELS, type HskStandard } from "@/lib/hsk";

import { saveStudySettings } from "./actions";
import { TimeZonePicker } from "./TimeZonePicker";

const FOCUS_RING = "has-focus-visible:ring-2 has-focus-visible:ring-rust/40 has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background";

/**
 * Study: the HSK standard and the target level in it, and the time zone
 * that decides when the day starts. Switching the standard asks for the
 * level again, with the closest one to the saved level picked as a
 * suggestion. Nothing changes until Save.
 */
export function StudySettings({
  standard: savedStandard,
  level: savedLevel,
  timeZone: savedTimeZone,
}: {
  standard: HskStandard;
  level: number | null;
  timeZone: string;
}) {
  const [standard, setStandard] = useState(savedStandard);
  const [level, setLevel] = useState<number | null>(savedLevel);
  const [timeZone, setTimeZone] = useState(savedTimeZone);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const levelLabelId = useId();
  const timeZoneLabelId = useId();

  const switched = standard !== savedStandard;
  const changed = switched || level !== savedLevel || timeZone !== savedTimeZone;
  const suggested = switched ? closestLevel(savedLevel, savedStandard, standard) : null;

  function chooseStandard(next: HskStandard) {
    setStatus("idle");
    setStandard(next);
    // Back to the saved standard: the saved level. Otherwise the closest.
    setLevel(next === savedStandard ? savedLevel : closestLevel(savedLevel, savedStandard, next));
  }

  function save() {
    if (level === null || !changed) return;
    setStatus("idle");
    startTransition(async () => {
      const result = await saveStudySettings(standard, level, timeZone).catch(() => ({ ok: false }));
      // Updates after an await need their own transition; this one shows
      // "Saved." together with the refreshed page (the sidebar's level).
      startTransition(() => setStatus(result.ok ? "saved" : "error"));
    });
  }

  return (
    <section aria-labelledby={titleId} className={`${CARD} flex flex-col gap-5`}>
      <h2 id={titleId} className="font-heading text-h2 font-bold text-bark">
        Study
      </h2>

      <div className="flex flex-col gap-3">
        <h3 className="font-heading text-h3 font-bold text-bark">HSK standard</h3>
        <StandardChoice name="hsk-standard" value={standard} onChange={chooseStandard} disabled={pending} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 id={levelLabelId} className="font-heading text-h3 font-bold text-bark">
          Your level
        </h3>
        {switched && (
          <div className="flex flex-col gap-1 rounded-md bg-highlight px-3 py-2">
            <p className="font-body text-body text-bark">
              Pick your level in {STANDARD_INFO[standard].short}.
              {savedLevel !== null && suggested !== null && (
                <>
                  {" "}
                  {levelLabel(suggested, standard)} is the closest to your {levelLabel(savedLevel, savedStandard)} in{" "}
                  {STANDARD_INFO[savedStandard].short}.
                </>
              )}
            </p>
            <p className="font-body text-body-sm text-bark-muted">Your learned words and reviews stay as they are.</p>
          </div>
        )}
        <fieldset aria-labelledby={levelLabelId} disabled={pending} className="flex flex-wrap gap-2">
          {STANDARD_LEVELS[standard].map((n) => {
            const checked = level === n;
            return (
              <label
                key={n}
                className={`relative flex h-12 min-w-20 cursor-pointer items-center justify-center rounded-md border-2 px-3 font-heading text-h3 font-bold transition-colors has-disabled:cursor-default has-disabled:opacity-60 ${FOCUS_RING} ${
                  checked ? "border-rust bg-rust/10 text-bark" : "border-bark/15 text-bark-muted hover:border-bark/30 hover:text-bark"
                }`}
              >
                <input
                  type="radio"
                  name="hsk-level"
                  value={n}
                  checked={checked}
                  onChange={() => {
                    setStatus("idle");
                    setLevel(n);
                  }}
                  className="sr-only"
                />
                {levelLabel(n, standard)}
                {n === suggested && <span className="sr-only"> (suggested)</span>}
              </label>
            );
          })}
        </fieldset>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 id={timeZoneLabelId} className="font-heading text-h3 font-bold text-bark">
            Time zone
          </h3>
          <p className="font-body text-body-sm text-bark-muted">When your day starts and ends, for reviews and your streak.</p>
        </div>
        <TimeZonePicker
          value={timeZone}
          onChange={(zone) => {
            setStatus("idle");
            setTimeZone(zone);
          }}
          disabled={pending}
          labelledBy={timeZoneLabelId}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!changed || level === null || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <p aria-live="polite" className="font-body text-body text-bark-muted">
          {status === "saved" && "Saved."}
          {status === "error" && <span className="text-again-ink">Couldn&apos;t save. Try again.</span>}
        </p>
      </div>
    </section>
  );
}
