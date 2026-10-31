"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

const TIP_ALIGN = { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" };

/** An (i) button with a one-sentence tooltip: shown on hover and keyboard
 *  focus, and toggled by a tap. Screen readers get it as the button's
 *  description. */
export function InfoTip({ label, info, align }: { label: string; info: string; align: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={tipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="-m-1.5 flex h-8 w-8 items-center justify-center rounded-full text-bark-muted transition-colors hover:text-bark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        <Info size={16} aria-hidden="true" />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute top-full z-20 mt-1.5 w-52 whitespace-normal max-w-[calc(100vw-48px)] rounded-md bg-bark px-2.5 py-1.5 text-left font-body text-[13px] font-medium leading-5 text-background group-hover:block group-has-[:focus-visible]:block ${TIP_ALIGN[align]} ${
          open ? "block" : "hidden"
        }`}
      >
        {info}
      </span>
    </span>
  );
}
