import type { Viewport } from "next";

import { AppShell } from "@/components/app/AppShell";
import { getAppUser } from "@/lib/supabase/app-user";

// "cover" so env(safe-area-inset-bottom) is non-zero on notched phones and
// the floating tab bar can clear the home indicator.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell user={await getAppUser()}>{children}</AppShell>;
}
