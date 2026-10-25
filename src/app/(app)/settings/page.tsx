import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";

import SignOutButton from "./sign-out-button";

export const metadata: Metadata = {
  title: "Settings - moink",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mt-6">
        <SignOutButton />
      </div>
    </>
  );
}
