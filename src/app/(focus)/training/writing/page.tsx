import type { Metadata } from "next";

import { WritingDeck } from "@/components/training/WritingDeck";

export const metadata: Metadata = {
  title: "Writing - moink",
};

// A writing set from the builder: the word ids, style and shuffle handed
// over in sessionStorage. Reads only; nothing here writes to the database.
export default function WritingPage() {
  return <WritingDeck />;
}
