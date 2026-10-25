import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = {
  title: "Dictionary - moink",
};

export default function DictionaryPage() {
  return <PageHeader title="Dictionary" />;
}
