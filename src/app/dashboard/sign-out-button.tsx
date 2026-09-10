"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={signOut}
      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      Sign out
    </button>
  );
}
