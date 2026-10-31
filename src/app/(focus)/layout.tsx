import type { Viewport } from "next";

import { AccountError } from "@/components/app/AccountError";
import { HskStandardProvider } from "@/components/app/HskStandard";
import { getAppUser } from "@/lib/supabase/app-user";

// Focus mode (a session): no sidebar or tab bar, but the same guards as the
// app shell. "cover" so the bottom controls can pad for the home indicator.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function FocusLayout({ children }: LayoutProps<"/">) {
  const user = await getAppUser();
  if (!user) return <AccountError />;
  return (
    <HskStandardProvider standard={user.hskStandard}>
      <div className="min-h-dvh bg-background">{children}</div>
    </HskStandardProvider>
  );
}
