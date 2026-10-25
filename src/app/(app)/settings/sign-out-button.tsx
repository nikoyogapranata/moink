"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    // Drop cached app pages so Back can't show them signed out.
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      className="inline-flex h-11 items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface-raised px-5 font-heading text-body font-medium text-bark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:opacity-60"
    >
      <LogOut size={20} aria-hidden="true" className="text-bark-muted" />
      {signingOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
