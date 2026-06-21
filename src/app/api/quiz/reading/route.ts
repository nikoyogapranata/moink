import Groq from 'groq-sdk'
import type { NextRequest } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const HSK_DESC: Record<number, string> = {
  1: 'very basic — simple sentences about daily life, family, food',
  2: 'elementary — short story about a day, shopping, or weather',
  3: 'intermediate — a short story with travel or work themes',
  4: 'upper-intermediate — a cultural or opinion piece with nuance',
}

export async function POST(request: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
  }

  const body = await request.json()
  const hskLevel = Number(body.hskLevel) || 1
  const desc = HSK_DESC[hskLevel] ?? HSK_DESC[1]

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Create a Chinese reading comprehension exercise for HSK ${hskLevel} learners (${desc}).

Write a passage (4–6 sentences in Chinese using only HSK ${hskLevel} vocabulary) and exactly 10 comprehension questions in Chinese with 4 answer options each in Chinese.

Rules:
- "passage_translation": English translation of the passage
- "passage_pinyin": space-separated pinyin, one syllable per Chinese character, skip punctuation
- Each question: "question" IN CHINESE, "question_translation" in English, "options" array of 4 IN CHINESE, "option_translations" array of 4 English meanings, "answer" must exactly match one option verbatim
- Each question also has "question_pinyin" (space-sep per CJK char) and "options_pinyin" (array of 4 pinyin strings)

Output ONLY valid JSON with no markdown fences:
{"passage":"...","passage_translation":"...","passage_pinyin":"...","questions":[{"question":"...","question_pinyin":"...","question_translation":"...","options":["A","B","C","D"],"options_pinyin":["...","...","...","..."],"option_translations":["...","...","...","..."],"answer":"A"}]}`,
    }],
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content ?? ''

  try {
    const data = JSON.parse(raw)
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }
}
