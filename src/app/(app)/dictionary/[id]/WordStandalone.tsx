"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { CARD } from "@/components/dictionary/SideCards";
import { WordPanel, type WordTab } from "@/components/dictionary/WordPanel";
import type { WordDetail } from "@/lib/dictionary/words";

export function WordStandalone({ word, backHref }: { word: WordDetail; backHref: string }) {
  const params = useSearchParams();
  const tab: WordTab = params.get("tab") === "writing" ? "writing" : "meaning";

  function setTab(next: WordTab) {
    const search = new URLSearchParams(window.location.search);
    if (next === "writing") search.set("tab", "writing");
    else search.delete("tab");
    const query = search.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  return (
    <div className="mx-auto flex w-full max-w-160 flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex h-11 items-center gap-1 self-start rounded-pill pr-4 font-heading text-body font-medium text-bark-muted transition-colors hover:text-bark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        <ChevronLeft size={20} aria-hidden="true" />
        Dictionary
      </Link>
      <div className={CARD}>
        <WordPanel word={word} tab={tab} onTabChange={setTab} />
      </div>
    </div>
  );
}
