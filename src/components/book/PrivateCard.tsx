import { Lock } from "lucide-react";
import Link from "next/link";

import { CARD } from "@/components/app/card";

/** What someone without a book_access row sees on /book. */
export function PrivateCard() {
  return (
    <div className={`${CARD} mx-auto mt-6 flex max-w-md flex-col items-center gap-3 text-center`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-highlight text-rust-dark">
        <Lock size={22} aria-hidden="true" />
      </span>
      <h1 className="font-heading text-h2 font-bold text-bark">This section is private</h1>
      <p className="font-body text-body text-bark-muted">
        The HSK Book is only open to a few accounts for now. Everything else in moink is yours to use.
      </p>
      <Link
        href="/dashboard"
        className="mt-1 font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
