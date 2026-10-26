import type { Metadata } from "next";

import { QuizDeck } from "@/components/training/QuizDeck";

export const metadata: Metadata = {
  title: "Quiz - moink",
};

// A quiz from the builder: the word ids and formats handed over in
// sessionStorage. Reads only; nothing here writes to the database.
export default function QuizPage() {
  return <QuizDeck />;
}
