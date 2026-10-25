import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = {
  title: "Training - moink",
};

export default function TrainingPage() {
  return <PageHeader title="Training" />;
}
