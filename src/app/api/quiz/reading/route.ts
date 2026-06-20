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
      content: `Create a Chinese reading comprehension exercise for HSK ${hskLevel} learners.
Level: ${desc}

Write a passage (4–6 sentences in Chinese using only HSK ${hskLevel} vocabulary) and exactly 10 comprehension questions.

Rules:
- Questions can be in English or Chinese
- Each question has exactly 4 answer options
- "answer" must exactly match one of the options verbatim

Output ONLY valid JSON with no markdown fences or explanation:
{"passage":"...","questions":[{"question":"...","options":["A","B","C","D"],"answer":"A"}]}`,
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
