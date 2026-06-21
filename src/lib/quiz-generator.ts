'use server'

import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Supabase ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
)

// ── Gemini ─────────────────────────────────────────────────────────────────────
const getGenAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'missing_key')

async function generateWithRetry(
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>['getGenerativeModel']>,
  prompt: string,
  maxRetries = 3
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await model.generateContent(prompt)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('429') && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
        continue
      }
      throw error
    }
  }
  // unreachable, but satisfies TypeScript
  throw new Error('Max retries exceeded')
}

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
  // Space-sep pinyin per CJK char in sentence, EXCLUDING the blank word
  // e.g. for '我___水果' → 'wǒ shuǐ guǒ'
  sentence_pinyin?: string
  answer: string
  answer_pinyin?: string
  options: string[]
  // Space-sep pinyin per CJK char, one string per option, same order as options
  options_pinyin?: string[]
  // English meaning per option, same order as options
  option_translations?: string[]
  translation: string
}

export type ReadingQuestion = {
  type: 'reading'
  question: string
  // Space-sep pinyin per CJK char in the question
  question_pinyin?: string
  // English translation of the question
  question_translation?: string
  options: string[]
  // Space-sep pinyin per CJK char, one string per option
  options_pinyin?: string[]
  // English meaning per option, same order as options
  option_translations?: string[]
  answer: string
}

export type ReadingQuiz = {
  passage: string
  passage_translation?: string
  // Space-sep pinyin per CJK char in the passage (skip punctuation/spaces)
  passage_pinyin?: string
  questions: ReadingQuestion[]
}

// ── Flashcard (Database via Supabase) ──────────────────────────────────────────

export async function generateFlashcardQuestions(
  hskLevel: number,
  count = 10
): Promise<FlashcardQuestion[]> {
  const { data, error } = await supabase
    .from('vocabulary')
    .select('id, simplified, pinyin, english')
    .eq('hsk_level', hskLevel)
    .limit(300)

  if (error || !data || data.length < 4) {
    throw new Error(error?.message ?? 'Not enough vocabulary for this HSK level')
  }

  const pool = [...data].sort(() => Math.random() - 0.5)
  const selected = pool.slice(0, count)

  return selected.map((word) => {
    const correctMeaning = (word.english as string[])[0]
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

// ── Fill-in-the-blank (Gemini) ─────────────────────────────────────────────────

export async function generateFillBlankQuestions(
  hskLevel: number,
  count = 10
): Promise<FillBlankQuestion[]> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const prompt = `Generate ${count} HSK level ${hskLevel} fill-in-the-blank questions. Return a JSON array. Each object must have exactly these keys:

"sentence": Chinese sentence with exactly one '___' for the missing word.
"translation": English translation of the complete sentence (with the answer filled in).
"answer": the correct Chinese word for the blank.
"answer_pinyin": pinyin for the answer word only (e.g. "chī").
"options": array of exactly 4 Chinese words including the correct answer.
"sentence_pinyin": space-separated pinyin, one syllable per CJK character in the sentence — SKIP the blank word entirely. E.g. for '我___水果。' with answer '吃' → 'wǒ shuǐ guǒ' (NOT 'wǒ ___ shuǐ guǒ').
"options_pinyin": array of exactly 4 pinyin strings matching each option in order. Each string is space-separated per CJK character of that option (e.g. ["chī","hē","mǎi","kàn"]).
"option_translations": array of exactly 4 English strings, one per option in the same order (e.g. ["eat","drink","buy","watch"]).`

  const result = await generateWithRetry(model, prompt)
  const text = result.response.text()

  const raw = JSON.parse(text) as Array<{
    sentence: string
    sentence_pinyin?: string
    answer: string
    answer_pinyin?: string
    options: string[]
    options_pinyin?: string[]
    option_translations?: string[]
    translation: string
  }>

  return raw.map(q => ({ type: 'fillblank' as const, ...q }))
}

// ── Reading (Gemini) ───────────────────────────────────────────────────────────

export async function generateReadingQuiz(hskLevel: number): Promise<ReadingQuiz> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const prompt = `Generate an HSK level ${hskLevel} Chinese reading comprehension quiz. Return a single JSON object with exactly these keys:

"passage": a 5–6 sentence Chinese paragraph using only HSK ${hskLevel} vocabulary.
"passage_translation": English translation of the full passage.
"passage_pinyin": space-separated pinyin, one syllable per Chinese CHARACTER in the passage in order — skip all punctuation and spaces (e.g. "wǒ de míng zi jiào Xiǎo Míng").
"questions": array of exactly 10 comprehension questions in Chinese with 4 answer options each in Chinese. Each question object must have:
  "question": the question written entirely IN CHINESE.
  "question_pinyin": space-separated pinyin per CJK character of the question text.
  "question_translation": English translation of the question.
  "options": array of exactly 4 answer choices written entirely IN CHINESE.
  "options_pinyin": array of 4 pinyin strings, one per option (space-sep per CJK char of that option).
  "option_translations": array of 4 English strings, English meaning of each option in the same order.
  "answer": the correct answer — must exactly match one of the 4 options verbatim.`

  const result = await generateWithRetry(model, prompt)
  const text = result.response.text()

  const quizData = JSON.parse(text) as {
    passage: string
    passage_translation?: string
    passage_pinyin?: string
    questions: Array<{
      question: string
      question_pinyin?: string
      question_translation?: string
      options: string[]
      options_pinyin?: string[]
      option_translations?: string[]
      answer: string
    }>
  }

  return {
    passage: quizData.passage,
    passage_translation: quizData.passage_translation,
    passage_pinyin: quizData.passage_pinyin,
    questions: quizData.questions.map(q => ({ type: 'reading' as const, ...q })),
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
