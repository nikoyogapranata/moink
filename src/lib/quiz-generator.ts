import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

// ── Flashcard ──────────────────────────────────────────────────────────────────

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

// ── Fill-in-the-blank (via API route — server-side Anthropic call) ─────────────

export async function generateFillBlankQuestions(
  hskLevel: number,
  count = 10
): Promise<FillBlankQuestion[]> {
  const res = await fetch('/api/quiz/fillblank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hskLevel, count }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to generate fill-in-blank questions')
  }

  const data = await res.json() as { questions: Array<{ sentence: string; answer: string; options: string[]; translation: string }> }
  return data.questions.map(q => ({ type: 'fillblank' as const, ...q }))
}

// ── Reading (via API route — server-side Anthropic call) ──────────────────────

export async function generateReadingQuiz(hskLevel: number): Promise<ReadingQuiz> {
  const res = await fetch('/api/quiz/reading', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hskLevel }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to generate reading quiz')
  }

  const data = await res.json() as { passage: string; questions: Array<{ question: string; options: string[]; answer: string }> }
  return {
    passage: data.passage,
    questions: data.questions.map(q => ({ type: 'reading' as const, ...q })),
  }
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
