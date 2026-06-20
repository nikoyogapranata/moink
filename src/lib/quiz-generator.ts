'use server'

import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Supabase ───────────────────────────────────────────────────────────────────
// Added fallbacks so it doesn't crash Next.js during the build phase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
)

// ── Gemini ─────────────────────────────────────────────────────────────────────
// Delay initialization until the function is called to prevent SSR crashes
const getGenAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'missing_key');

// ── Types ──────────────────────────────────────────────────────────────────────

export type FlashcardQuestion = {
  type: 'flashcard'
  vocabId: string
  word: string
  pinyin: string
  correctMeaning: string
  options: string[]
}

export type FillBlankQuestion = {
  type: 'fillblank'
  sentence: string
  answer: string
  options: string[]
  translation: string
}

export type ReadingQuestion = {
  type: 'reading'
  question: string
  options: string[]
  answer: string
}

export type ReadingQuiz = {
  passage: string
  questions: ReadingQuestion[]
}

// ── Flashcard (Database via Supabase) ──────────────────────────────────────────

export async function generateFlashcardQuestions(
  hskLevel: number,
  count = 10
): Promise<FlashcardQuestion[]> {
  // Fetch a larger pool so we can sample randomly client-side
  const { data, error } = await supabase
    .from('vocabulary')
    .select('id, simplified, pinyin, english')
    .eq('hsk_level', hskLevel)
    .limit(300)

  if (error || !data || data.length < 4) {
    throw new Error(error?.message ?? 'Not enough vocabulary for this HSK level')
  }

  // Shuffle the pool
  const pool = [...data].sort(() => Math.random() - 0.5)
  const selected = pool.slice(0, count)

  return selected.map((word) => {
    const correctMeaning = (word.english as string[])[0]

    // Pick 3 distractors from pool (excluding the word itself)
    const distractors = pool
      .filter(w => w.id !== word.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => (w.english as string[])[0])

    const options = shuffle([correctMeaning, ...distractors])

    return {
      type: 'flashcard',
      vocabId: String(word.id),
      word: word.simplified as string,
      pinyin: word.pinyin as string,
      correctMeaning,
      options,
    }
  })
}

// ── Fill-in-the-blank (Server-Side Gemini Call) ────────────────────────────────

export async function generateFillBlankQuestions(
  hskLevel: number,
  count = 10
): Promise<FillBlankQuestion[]> {
  const model = getGenAI().getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `Generate ${count} HSK level ${hskLevel} fill-in-the-blank questions in JSON format.
  Return an array of objects, where each object has exactly these keys:
  "sentence" (a Chinese sentence with exactly one '___' for the missing word),
  "translation" (the English translation of the sentence),
  "answer" (the correct Chinese word that belongs in the blank),
  "options" (an array of 4 different Chinese words, including the correct answer).`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  // Parse the JSON strictly returned by Gemini
  const questionsData = JSON.parse(text) as Array<{ sentence: string; answer: string; options: string[]; translation: string }>;
  
  return questionsData.map(q => ({ type: 'fillblank' as const, ...q }));
}

// ── Reading (Server-Side Gemini Call) ──────────────────────────────────────────

export async function generateReadingQuiz(hskLevel: number): Promise<ReadingQuiz> {
  const model = getGenAI().getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `Generate an HSK level ${hskLevel} reading comprehension quiz in JSON format.
  Return a single JSON object with these two keys:
  "passage" (a short Chinese paragraph appropriate for HSK ${hskLevel} reading practice),
  "questions" (an array of exactly 3 objects. Each object must have: 
     "question" (an English question about the passage), 
     "answer" (the correct English answer), 
     "options" (an array of 4 different English answers including the correct one)).`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  const quizData = JSON.parse(text) as { passage: string; questions: Array<{ question: string; options: string[]; answer: string }> };

  return {
    passage: quizData.passage,
    questions: quizData.questions.map(q => ({ type: 'reading' as const, ...q })),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}