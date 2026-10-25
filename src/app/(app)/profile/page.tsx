import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = {
  title: "Profile - moink",
};

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" />

      {/* The way to Settings on mobile, where there's no sidebar gear. */}
      <Link
        href="/settings"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface-raised px-5 font-heading text-body font-medium text-bark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        <Settings size={20} aria-hidden="true" className="text-bark-muted" />
        Settings
      </Link>
    </>
  );
}
