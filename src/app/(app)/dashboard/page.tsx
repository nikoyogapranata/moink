import type { Metadata } from "next";

import { Greeting } from "./Greeting";

export const metadata: Metadata = {
  title: "Dashboard - moink",
};

export default function DashboardPage() {
  return (
    <>
      <header>
        <Greeting />
        <p className="mt-1 font-body text-body text-bark-muted">
          Ready for today&apos;s words?
        </p>
      </header>

      <div className="mt-8 flex min-h-60 items-center justify-center rounded-xl border-2 border-dashed border-line p-6 text-center font-body text-body text-bark-muted">
        Dashboard content, designed next
      </div>
    </>
  );
}
