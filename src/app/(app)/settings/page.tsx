import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getAppUser } from "@/lib/supabase/app-user";

import SignOutButton from "./sign-out-button";
import { StudySettings } from "./StudySettings";

export const metadata: Metadata = {
  title: "Settings - moink",
};

export default async function SettingsPage() {
  // Shares the layout's read; when it failed, the layout shows the error.
  const user = await getAppUser();
  if (!user) return null;
  return (
    <>
      <PageHeader title="Settings">Your study plan and account.</PageHeader>
      <div className="mt-6 flex flex-col gap-6">
        <StudySettings standard={user.hskStandard} level={user.hskLevel} />
        <div>
          <SignOutButton />
        </div>
      </div>
    </>
  );
}
