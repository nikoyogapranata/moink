import type { Metadata } from "next";

import { PracticeDeck } from "@/components/training/PracticeDeck";
import { parseDirection } from "@/lib/training/deck";

export const metadata: Metadata = {
  title: "Flashcards - moink",
};

// A deck from the builder: ?dir=hanzi|meaning, and the word ids handed
// over in sessionStorage. Reads only; nothing here writes to the database.
export default async function FlashcardsPage({ searchParams }: PageProps<"/training/flashcards">) {
  const { dir } = await searchParams;
  const direction = parseDirection(Array.isArray(dir) ? dir[0] : dir);
  return <PracticeDeck key={direction ?? "stored"} initialDirection={direction} />;
}
