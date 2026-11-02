import type { Viewport } from "next";
import { Suspense, type ReactNode } from "react";

import { AccountError } from "@/components/app/AccountError";
import { HskStandardProvider } from "@/components/app/HskStandard";
import { SessionSkeleton } from "@/components/training/SessionSkeleton";
import { getAppUser } from "@/lib/supabase/app-user";

// Focus mode (a session): no sidebar or tab bar, but the same guards as the
// app shell. "cover" so the bottom controls can pad for the home indicator.
export const viewport: Viewport = {
  viewportFit: "cover",
};

async function FocusGuard({ children }: { children: ReactNode }) {
  const user = await getAppUser();
  if (!user) return <AccountError />;
  return <HskStandardProvider standard={user.hskStandard}>{children}</HskStandardProvider>;
}

// The guard has its own boundary: loading.tsx sits below this layout, so it
// can't cover the account check, and the navigation would wait on it.
export default function FocusLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh bg-background">
      <Suspense fallback={<SessionSkeleton />}>
        <FocusGuard>{children}</FocusGuard>
      </Suspense>
    </div>
  );
}
