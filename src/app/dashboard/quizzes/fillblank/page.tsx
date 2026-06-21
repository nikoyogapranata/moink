'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { generateFillBlankQuestions, type FillBlankQuestion } from '@/lib/quiz-generator'

// ── Constants ──────────────────────────────────────────────────────────────────

const EASE = [0.25, 1, 0.5, 1] as const

// ── Toggle Button ──────────────────────────────────────────────────────────────

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-mono"
      style={{
        fontSize: 12,
        color: active ? '#dc2626' : 'var(--text-secondary)',
        background: active ? 'rgba(220,38,38,0.08)' : 'rgba(127,127,127,0.1)',
        padding: '6px 10px',
        borderRadius: 8,
        transition: 'color 150ms, background 150ms',
        letterSpacing: '0.04em',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label} {active ? 'ON' : 'OFF'}
    </button>
  )
}

// ── Option Button ──────────────────────────────────────────────────────────────

type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

function OptionButton({
  label,
  pinyin,
  translation,
  showPinyin,
  showTranslation,
  state,
  onClick,
}: {
  label: string
  pinyin?: string
  translation?: string
  showPinyin: boolean
  showTranslation: boolean
  state: OptionState
  onClick: () => void
}) {
  const colorMap: Record<OptionState, React.CSSProperties> = {
    idle:    { background: 'var(--opt-idle)',  border: '2px solid transparent', boxShadow: 'var(--card-shadow)', color: 'var(--color-ink-black)', opacity: 1 },
    correct: { background: 'var(--opt-correct)', border: '2px solid var(--opt-correct-border)', boxShadow: 'none', color: 'var(--opt-correct-text)', opacity: 1 },
    wrong:   { background: 'var(--opt-wrong)',   border: '2px solid var(--opt-wrong-border)',   boxShadow: 'none', color: 'var(--opt-wrong-text)',   opacity: 1 },
    dim:     { background: 'var(--opt-idle)',  border: '2px solid transparent', boxShadow: 'none', color: 'var(--color-muted-text)', opacity: 0.4 },
  }

  return (
    <button
      onClick={state === 'idle' ? onClick : undefined}
      disabled={state !== 'idle'}
      className="font-cjk rounded-2xl w-full"
      style={{
        ...colorMap[state],
        minHeight: 80,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        textAlign: 'center',
        transition: 'background 180ms, border-color 180ms, opacity 180ms',
        cursor: state === 'idle' ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: '1.25rem', lineHeight: 1.4 }}>{label}</span>

      {showPinyin && pinyin && (
        <span style={{ fontSize: 12, opacity: 0.6, fontFamily: 'var(--font-mono)', lineHeight: 1.3 }}>
          {pinyin}
        </span>
      )}

      {showTranslation && translation && (
        <span style={{ fontSize: 12, opacity: 0.65, fontFamily: 'var(--font-mono)', lineHeight: 1.3, fontStyle: 'italic' }}>
          {translation}
        </span>
      )}
    </button>
  )
}

function optionState(opt: string, correct: string, selected: string | null, isAnswered: boolean): OptionState {
  if (!isAnswered) return 'idle'
  if (opt === correct) return 'correct'
  if (opt === selected) return 'wrong'
  return 'dim'
}

// ── Question Card ──────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  isAnswered,
  showPinyin,
  showTranslation,
  showHint,
}: {
  question: FillBlankQuestion
  isAnswered: boolean
  showPinyin: boolean
  showTranslation: boolean
  showHint: boolean
}) {
  const parts = question.sentence.split('___')

  return (
    <div
      className="rounded-3xl w-full"
      style={{
        background: 'var(--card-bg)',
        boxShadow: 'var(--card-shadow)',
        padding: 32,
        minHeight: 192,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      {/* Sentence */}
      <p className="font-cjk max-w-none" style={{ fontSize: '1.5rem', lineHeight: 1.8, color: 'var(--color-ink-black)' }}>
        {parts[0]}
        <span
          className="inline-block border-b-2 mx-1 align-bottom text-center font-mono"
          style={{
            borderColor: '#dc2626',
            color: '#dc2626',
            minWidth: '3rem',
            fontSize: '1.25rem',
            letterSpacing: '0.04em',
          }}
        >
          {isAnswered ? question.answer : '   '}
        </span>
        {parts[1]}
      </p>

      {/* Pinyin subtitle */}
      {showPinyin && question.sentence_pinyin && (
        <p className="font-mono max-w-none" style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {question.sentence_pinyin}
        </p>
      )}

      {/* Answer pinyin hint */}
      {showHint && question.answer_pinyin && !isAnswered && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <span
            className="font-mono"
            style={{
              fontSize: 14,
              color: '#dc2626',
              background: 'rgba(220,38,38,0.07)',
              padding: '4px 10px',
              borderRadius: 8,
              display: 'inline-block',
            }}
          >
            Hint: {question.answer_pinyin}
          </span>
        </motion.div>
      )}

      {/* Translation */}
      {showTranslation && (
        <p className="font-mono max-w-none" style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {question.translation}
        </p>
      )}
    </div>
  )
}

// ── Results Screen ─────────────────────────────────────────────────────────────

type Answer = { selected: string; correct: string; isCorrect: boolean }

function ResultsScreen({
  score,
  total,
  answers,
  hskLevel,
  onRetry,
  onBack,
}: {
  score: number
  total: number
  answers: Answer[]
  hskLevel: number
  onRetry: () => void
  onBack: () => void
}) {
  const pct = total > 0 ? score / total : 0
  const circumference = 2 * Math.PI * 44
  const wrong = answers.filter(a => !a.isCorrect)

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}>
      <div className="rounded-3xl p-10 text-center mb-6" style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
        <div className="relative flex items-center justify-center mb-4">
          <svg width={100} height={100} viewBox="0 0 100 100">
            <circle cx={50} cy={50} r={44} fill="none" stroke="var(--color-brush-gray)" strokeWidth={6} />
            <circle
              cx={50} cy={50} r={44} fill="none" stroke="#dc2626" strokeWidth={6}
              strokeLinecap="round" strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct)} transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 600ms ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-black" style={{ fontSize: '1.5rem', letterSpacing: '-0.04em', color: 'var(--color-ink-black)' }}>
              {score}/{total}
            </span>
          </div>
        </div>
        <p className="font-black max-w-none" style={{ fontSize: '2rem', letterSpacing: '-0.03em', color: 'var(--color-ink-black)' }}>
          {score === total ? 'Perfect!' : score >= Math.ceil(total * 0.7) ? 'Solid!' : 'Keep practicing'}
        </p>
        <p className="font-mono mt-2 max-w-none" style={{ fontSize: 13, color: 'var(--color-muted-text)' }}>
          HSK {hskLevel} · Fill in the Blank
        </p>
      </div>

      {wrong.length > 0 && (
        <div className="mb-6">
          <p className="font-mono mb-3 max-w-none" style={{ fontSize: 13, color: 'var(--color-muted-text)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Review
          </p>
          <div className="space-y-2">
            {wrong.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: 'var(--card-bg)', boxShadow: 'var(--card-shadow)' }}>
                <span className="font-cjk line-clamp-1 flex-1 mr-3 max-w-none" style={{ fontSize: 15, color: 'var(--color-muted-text)' }}>
                  {a.selected}
                </span>
                <span className="font-cjk font-semibold flex-shrink-0 max-w-none" style={{ fontSize: 16, color: 'var(--color-ink-black)' }}>
                  → {a.correct}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold"
          style={{ fontSize: 15, background: 'var(--color-paper-medium)', color: 'var(--color-ink-black)', border: 'none' }}
        >
          <ArrowLeft size={15} />
          Quiz Menu
        </button>
        <button
          onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold"
          style={{ fontSize: 15, background: 'var(--color-ink-black)', color: 'var(--color-paper-warm)', border: 'none', transition: 'background 200ms' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#dc2626')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-ink-black)')}
        >
          <RotateCcw size={15} />
          Try again
        </button>
      </div>
    </motion.div>
  )
}

// ── Page Inner ─────────────────────────────────────────────────────────────────

function FillBlankInner() {
  const params = useSearchParams()
  const router = useRouter()
  const prefersReduced = useReducedMotion()
  const hskLevel = Number(params.get('level')) || 1

  const [screen, setScreen] = useState<'loading' | 'session' | 'results'>('loading')
  const [questions, setQuestions] = useState<FillBlankQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [showPinyin, setShowPinyin] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const loadQuiz = useCallback(async () => {
    setScreen('loading')
    setCurrentIndex(0)
    setAnswers([])
    setSelectedOption(null)
    setIsAnswered(false)
    setShowHint(false)
    setErrorMsg(null)

    try {
      const qs = await generateFillBlankQuestions(hskLevel, 10)
      setQuestions(qs)
      setScreen('session')
    } catch {
      setErrorMsg('Generation failed — try again in a moment')
    }
  }, [hskLevel])

  useEffect(() => { loadQuiz() }, [loadQuiz])

  function handleSelect(opt: string) {
    if (isAnswered) return
    setSelectedOption(opt)
    setIsAnswered(true)
    setShowHint(false)
  }

  function handleNext() {
    if (!selectedOption || !questions[currentIndex]) return
    const q = questions[currentIndex]
    const updated = [...answers, { selected: selectedOption, correct: q.answer, isCorrect: selectedOption === q.answer }]
    if (currentIndex + 1 >= questions.length) {
      setAnswers(updated)
      setScreen('results')
      return
    }
    setAnswers(updated)
    setCurrentIndex(i => i + 1)
    setSelectedOption(null)
    setIsAnswered(false)
    setShowHint(false)
  }

  const score = answers.filter(a => a.isCorrect).length
  const isLast = currentIndex + 1 >= questions.length
  const currentQ = questions[currentIndex]

  return (
    <main style={{
      width: '100%',
      minHeight: '100vh',
      background: 'var(--color-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 24px 96px',
    }}>
      <div style={{ width: '100%', maxWidth: '900px' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => router.push('/dashboard/quizzes')}
          className="flex items-center gap-2 font-mono flex-shrink-0"
          style={{ fontSize: 13, color: 'var(--color-muted-text)', transition: 'color 150ms' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--color-ink-black)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--color-muted-text)')}
        >
          <ArrowLeft size={14} />
          Quizzes
        </button>

        {screen === 'session' && (
          <div className="flex items-center gap-2">
            <ToggleBtn label="Pinyin" active={showPinyin} onClick={() => setShowPinyin(p => !p)} />
            <ToggleBtn label="Translation" active={showTranslation} onClick={() => setShowTranslation(p => !p)} />
          </div>
        )}
      </div>

      {/* ── Progress bar ── */}
      {screen === 'session' && (
        <div className="mb-7">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono whitespace-nowrap" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              HSK {hskLevel} · Fill in the Blank
            </span>
            <span className="font-mono whitespace-nowrap" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {currentIndex + 1} / {questions.length}
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--color-brush-gray)', borderRadius: 99, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(currentIndex / questions.length) * 100}%`,
                background: '#dc2626',
                borderRadius: 99,
                transition: 'width 300ms ease',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {screen === 'loading' && (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          {errorMsg ? (
            <div className="text-center">
              <p className="font-bold mb-2" style={{ fontSize: 16, color: 'var(--color-ink-black)' }}>{errorMsg}</p>
              <button
                onClick={loadQuiz}
                className="mt-4 px-6 py-3 rounded-2xl font-semibold"
                style={{ background: 'var(--color-ink-black)', color: 'var(--color-paper-warm)', fontSize: 15 }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-full border-2 animate-spin" style={{ width: 44, height: 44, borderColor: '#dc2626', borderTopColor: 'transparent' }} />
              <div className="text-center">
                <p className="font-bold" style={{ fontSize: 16, color: 'var(--color-ink-black)' }}>Generating with AI…</p>
                <p className="font-mono mt-1" style={{ fontSize: 13, color: 'var(--color-muted-text)' }}>This may take a moment</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Session ── */}
      <AnimatePresence mode="wait">
        {screen === 'session' && currentQ && (
          <motion.div
            key={currentIndex}
            initial={prefersReduced ? false : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, x: -40 }}
            transition={{ duration: 0.26, ease: EASE }}
          >
            <QuestionCard
              question={currentQ}
              isAnswered={isAnswered}
              showPinyin={showPinyin}
              showTranslation={showTranslation}
              showHint={showHint}
            />

            {/* 2×2 answer grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              {currentQ.options.map((opt, i) => (
                <OptionButton
                  key={opt}
                  label={opt}
                  pinyin={currentQ.options_pinyin?.[i]}
                  translation={currentQ.option_translations?.[i]}
                  showPinyin={showPinyin}
                  showTranslation={showTranslation}
                  state={optionState(opt, currentQ.answer, selectedOption, isAnswered)}
                  onClick={() => handleSelect(opt)}
                />
              ))}
            </div>

            {/* Hint link */}
            {!isAnswered && currentQ.answer_pinyin && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  onClick={() => setShowHint(h => !h)}
                  className="font-mono"
                  style={{
                    fontSize: 13,
                    color: showHint ? '#dc2626' : 'var(--text-secondary)',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    transition: 'color 150ms',
                  }}
                >
                  {showHint ? 'Hide pinyin hint' : 'Reveal pinyin hint'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Next button ── */}
      <AnimatePresence>
        {screen === 'session' && isAnswered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ marginTop: 16 }}
          >
            <button
              onClick={handleNext}
              className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold"
              style={{ padding: '16px', fontSize: 16, background: 'var(--color-ink-black)', color: 'var(--color-paper-warm)', border: 'none', transition: 'background 200ms' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#dc2626')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-ink-black)')}
            >
              {isLast ? 'See Results' : 'Next'}
              <ArrowRight size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ── */}
      {screen === 'results' && (
        <ResultsScreen
          score={score}
          total={questions.length}
          answers={answers}
          hskLevel={hskLevel}
          onRetry={loadQuiz}
          onBack={() => router.push('/dashboard/quizzes')}
        />
      )}

      </div>
    </main>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FillBlankPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <div className="rounded-full border-2 animate-spin" style={{ width: 40, height: 40, borderColor: '#dc2626', borderTopColor: 'transparent' }} />
        </div>
      }
    >
      <FillBlankInner />
    </Suspense>
  )
}
