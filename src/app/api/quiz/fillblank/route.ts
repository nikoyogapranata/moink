import Groq from 'groq-sdk'
import type { NextRequest } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const HSK_DESC: Record<number, string> = {
  1: 'very basic vocabulary (numbers, family, greetings, common verbs like 吃/喝/看/买)',
  2: 'elementary vocabulary (daily activities, time, places, simple descriptions)',
  3: 'intermediate vocabulary (emotions, opinions, more complex situations)',
  4: 'upper-intermediate vocabulary (abstract topics, formal situations, nuanced expressions)',
}

export async function POST(request: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
  }

  const body = await request.json()
  const hskLevel = Number(body.hskLevel) || 1
  const count = Number(body.count) || 10
  const desc = HSK_DESC[hskLevel] ?? HSK_DESC[1]

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Generate ${count} fill-in-the-blank Chinese sentences for HSK ${hskLevel} learners.
Level: ${desc}

Rules:
- Each sentence has exactly one blank marked as ___
- The blank must be a single Chinese word or short phrase
- options must be exactly 4 Chinese words (1 correct + 3 plausible distractors at the same HSK level)
- Sentences should be 5–12 characters, natural and practical
- "answer" must exactly match one of the options

Output ONLY valid JSON with no markdown fences or explanation:
{"questions":[{"sentence":"我___苹果。","answer":"吃","options":["吃","喝","买","看"],"translation":"I eat an apple."}]}`,
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
