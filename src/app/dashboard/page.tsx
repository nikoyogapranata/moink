import { redirect } from "next/navigation";
import { getHomePath } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/app/dashboard/sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // proxy.ts already does this; repeated so the page is safe on its own.
  if ((await getHomePath(supabase, user.id)) === "/onboarding") {
    redirect("/onboarding");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg">Welcome, {user.email}</p>
      <SignOutButton />
    </main>
  );
}
