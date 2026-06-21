'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { createClient } from '@supabase/supabase-js'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { ArrowLeft, ArrowRight, RotateCcw, BookOpen } from 'lucide-react'
import {
  generateFlashcardQuestions,
  generateFillBlankQuestions,
  generateReadingQuiz,
  type FlashcardQuestion,
  type FillBlankQuestion,
  type ReadingQuestion,
} from '@/lib/quiz-generator'

// ── Supabase ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Types ──────────────────────────────────────────────────────────────────────

type QuizMode = 'flashcard' | 'fill' | 'reading'

type ReadingQ = { type: 'reading'; passage: string } & ReadingQuestion

type Question = FlashcardQuestion | FillBlankQuestion | ReadingQ

type Answer = {
  questionIndex: number
  selected: string
  correct: string
  isCorrect: boolean
  vocabId?: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const EASE = [0.25, 1, 0.5, 1] as const
const CARD_SHADOW = 'var(--card-shadow)'
const QUESTION_COUNT = 10

// ── Progress Bar ───────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="fixed top-0 left-0 right-0 z-50" style={{ height: 3, background: 'var(--color-brush-gray)' }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--color-red-stamp)',
          transition: 'width 300ms ease',
        }}
      />
    </div>
  )
}

// ── Option Button ──────────────────────────────────────────────────────────────

type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

function OptionButton({ label, state, onClick }: { label: string; state: OptionState; onClick: () => void }) {
  const styles: Record<OptionState, React.CSSProperties> = {
    idle:    { background: 'var(--opt-idle)', border: '2px solid transparent', boxShadow: CARD_SHADOW, color: 'var(--color-ink-black)', opacity: 1 },
    correct: { background: '#dcfce7', border: '2px solid #16a34a', boxShadow: 'none', color: '#15803d', opacity: 1 },
    wrong:   { background: '#fee2e2', border: '2px solid var(--color-red-stamp)', boxShadow: 'none', color: 'var(--color-red-stamp)', opacity: 1 },
    dim:     { background: 'var(--opt-idle)', border: '2px solid transparent', boxShadow: 'none', color: 'var(--color-muted-text)', opacity: 0.4 },
  }
  return (
    <button
      onClick={state === 'idle' ? onClick : undefined}
      disabled={state !== 'idle'}
      className="w-full text-left px-5 py-3.5 rounded-2xl font-semibold text-sm"
      style={{ ...styles[state], transition: 'background 200ms, border-color 200ms, opacity 200ms', cursor: state === 'idle' ? 'pointer' : 'default' }}
    >
      {label}
    </button>
  )
}

function optionState(opt: string, correct: string, selected: string | null, isAnswered: boolean): OptionState {
  if (!isAnswered) return 'idle'
  if (opt === correct) return 'correct'
  if (opt === selected) return 'wrong'
  return 'dim'
}

// ── Flashcard Card ─────────────────────────────────────────────────────────────

function FlashcardCard({
  question, selectedOption, isAnswered, onSelect,
}: {
  question: FlashcardQuestion
  selectedOption: string | null
  isAnswered: boolean
  onSelect: (opt: string) => void
}) {
  return (
    <div>
      <div className="rounded-3xl p-8 mb-6 text-center" style={{ background: 'var(--card-bg)', boxShadow: CARD_SHADOW }}>
        <p className="font-cjk text-ink-black leading-none select-none max-w-none" style={{ fontSize: 96 }}>
          {question.word}
        </p>
        <p className="font-mono text-muted-text mt-3 max-w-none" style={{ letterSpacing: '0.06em' }}>
          {question.pinyin}
        </p>
        <p className="font-mono text-xs text-muted-text mt-4 tracking-widest uppercase max-w-none">
          What does this mean?
        </p>
      </div>
      <div className="space-y-3">
        {question.options.map(opt => (
          <OptionButton
            key={opt}
            label={opt}
            state={optionState(opt, question.correctMeaning, selectedOption, isAnswered)}
            onClick={() => onSelect(opt)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Fill-in-blank Card ─────────────────────────────────────────────────────────

function FillBlankCard({
  question, selectedOption, isAnswered, onSelect,
}: {
  question: FillBlankQuestion
  selectedOption: string | null
  isAnswered: boolean
  onSelect: (opt: string) => void
}) {
  const parts = question.sentence.split('___')
  return (
    <div>
      <div className="rounded-3xl p-8 mb-6" style={{ background: 'var(--card-bg)', boxShadow: CARD_SHADOW }}>
        <p className="font-cjk text-ink-black leading-relaxed text-2xl max-w-none">
          {parts[0]}
          <span
            className="inline-block border-b-2 min-w-[2rem] mx-1 align-bottom"
            style={{ borderColor: 'var(--color-red-stamp)', color: 'var(--color-red-stamp)' }}
          >
            {isAnswered ? question.answer : '    '}
          </span>
          {parts[1]}
        </p>
        <p className="font-mono text-xs text-muted-text mt-4 max-w-none">{question.translation}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {question.options.map(opt => (
          <OptionButton
            key={opt}
            label={opt}
            state={optionState(opt, question.answer, selectedOption, isAnswered)}
            onClick={() => onSelect(opt)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Reading Card ───────────────────────────────────────────────────────────────

function ReadingCard({
  passage, question, selectedOption, isAnswered, onSelect,
}: {
  passage: string
  question: ReadingQuestion
  selectedOption: string | null
  isAnswered: boolean
  onSelect: (opt: string) => void
}) {
  return (
    <div>
      <div className="rounded-3xl p-6 mb-5" style={{ background: 'var(--card-bg)', boxShadow: CARD_SHADOW }}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={13} style={{ color: 'var(--color-muted-text)' }} />
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-text">Passage</span>
        </div>
        <div className="no-scrollbar overflow-y-auto font-cjk text-ink-black leading-relaxed max-w-none" style={{ maxHeight: 192, fontSize: '1.1rem' }}>
          {passage}
        </div>
      </div>
      <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--color-paper-medium)', boxShadow: CARD_SHADOW }}>
        <p className="font-semibold text-ink-black text-sm max-w-none">{question.question}</p>
      </div>
      <div className="space-y-3">
        {question.options.map(opt => (
          <OptionButton
            key={opt}
            label={opt}
            state={optionState(opt, question.answer, selectedOption, isAnswered)}
            onClick={() => onSelect(opt)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Loading Screen ─────────────────────────────────────────────────────────────

function LoadingScreen({ mode }: { mode: QuizMode }) {
  const isAI = mode === 'fill' || mode === 'reading'
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6">
      <div
        className="w-12 h-12 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--color-red-stamp)', borderTopColor: 'transparent' }}
      />
      <div className="text-center">
        <p className="font-bold text-ink-black text-base max-w-none">
          {isAI ? 'Generating questions with AI…' : 'Preparing your quiz…'}
        </p>
        <p className="font-mono text-xs text-muted-text mt-1 max-w-none">This may take a moment</p>
      </div>
    </div>
  )
}

// ── Results Screen ─────────────────────────────────────────────────────────────

const SCORE_MESSAGES = [
  { min: 9, label: 'Sharp!' },
  { min: 7, label: 'Solid session' },
  { min: 5, label: 'Getting there' },
  { min: 0, label: 'Keep at it' },
]

function ResultsScreen({
  score, total, answers, onRetry, onMenu,
}: {
  score: number
  total: number
  answers: Answer[]
  onRetry: () => void
  onMenu: () => void
}) {
  const pct = total > 0 ? score / total : 0
  const circumference = 2 * Math.PI * 44
  const dashOffset = circumference * (1 - pct)
  const message = SCORE_MESSAGES.find(m => score >= m.min)?.label ?? 'Keep at it'
  const wrong = answers.filter(a => !a.isCorrect)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="rounded-3xl p-10 text-center mb-6" style={{ background: 'var(--card-bg)', boxShadow: CARD_SHADOW }}>
        <div className="relative flex items-center justify-center mb-4">
          <svg width={100} height={100} viewBox="0 0 100 100">
            <circle cx={50} cy={50} r={44} fill="none" stroke="var(--color-brush-gray)" strokeWidth={6} />
            <circle
              cx={50} cy={50} r={44} fill="none"
              stroke="var(--color-red-stamp)" strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 600ms ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-black text-ink-black" style={{ fontSize: '1.5rem', letterSpacing: '-0.04em' }}>
              {score}/{total}
            </span>
          </div>
        </div>
        <p className="font-black text-ink-black max-w-none" style={{ fontSize: '1.5rem', letterSpacing: '-0.03em' }}>
          {message}
        </p>
        <p className="font-mono text-xs text-muted-text mt-2 max-w-none">
          {score === total ? 'Perfect score — incredible!' : `${total - score} to review`}
        </p>
      </div>

      {wrong.length > 0 && (
        <div className="mb-6">
          <p className="font-mono text-[10px] tracking-widest uppercase text-muted-text mb-3 max-w-none">Review</p>
          <div className="space-y-2">
            {wrong.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: 'var(--card-bg)', boxShadow: CARD_SHADOW }}
              >
                <span className="text-sm text-muted-text line-clamp-1 flex-1 mr-3 max-w-none">{a.selected}</span>
                <span className="font-semibold text-sm text-ink-black flex-shrink-0 max-w-none">→ {a.correct}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onMenu}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm"
          style={{ background: 'var(--color-paper-medium)', color: 'var(--color-ink-black)' }}
        >
          <ArrowLeft size={15} />
          Menu
        </button>
        <button
          onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm"
          style={{ background: 'var(--color-ink-black)', color: 'var(--color-paper-warm)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-red-stamp)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-ink-black)')}
        >
          <RotateCcw size={15} />
          Try again
        </button>
      </div>
    </motion.div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl font-mono text-sm text-white"
      style={{ background: '#111111', zIndex: 100, whiteSpace: 'nowrap' }}
    >
      {message}
    </motion.div>
  )
}

// ── Session Inner ──────────────────────────────────────────────────────────────

function SessionInner() {
  const params = useSearchParams()
  const router = useRouter()
  const prefersReduced = useReducedMotion()

  const level = Number(params.get('level')) || 1
  const mode = (params.get('mode') ?? 'flashcard') as QuizMode

  const [screen, setScreen] = useState<'loading' | 'session' | 'results'>('loading')
  const [questions, setQuestions] = useState<Question[]>([])
  const [passage, setPassage] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [slideDir] = useState(1)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [firebaseUid, setFirebaseUid] = useState('anonymous')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => setFirebaseUid(user?.uid ?? 'anonymous'))
    return unsub
  }, [])

  const loadQuiz = useCallback(async () => {
    setScreen('loading')
    setCurrentIndex(0)
    setAnswers([])
    setSelectedOption(null)
    setIsAnswered(false)

    try {
      if (mode === 'flashcard') {
        const qs = await generateFlashcardQuestions(level, QUESTION_COUNT)
        setQuestions(qs)
        setPassage('')
      } else if (mode === 'fill') {
        const qs = await generateFillBlankQuestions(level, QUESTION_COUNT)
        setQuestions(qs)
        setPassage('')
      } else {
        const result = await generateReadingQuiz(level)
        setPassage(result.passage)
        const qs: Question[] = result.questions.slice(0, QUESTION_COUNT).map(q => ({
          ...q,
          passage: result.passage,
        }))
        setQuestions(qs)
      }
      setScreen('session')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load quiz'
      setToastMsg(msg)
      setTimeout(() => setToastMsg(null), 4000)
      setTimeout(() => router.back(), 4100)
    }
  }, [level, mode, router])

  useEffect(() => { loadQuiz() }, [loadQuiz])

  const saveHistory = useCallback(async (completedAnswers: Answer[]) => {
    if (firebaseUid === 'anonymous') return
    const rows = completedAnswers
      .filter(a => a.vocabId)
      .map(a => ({
        firebase_uid: firebaseUid,
        vocab_id: a.vocabId,
        quiz_type: mode,
        is_correct: a.isCorrect,
      }))
    if (rows.length > 0) await supabase.from('quiz_history').insert(rows)
  }, [firebaseUid, mode])

  const handleSelect = useCallback((opt: string) => {
    if (isAnswered) return
    setSelectedOption(opt)
    setIsAnswered(true)
  }, [isAnswered])

  const currentQuestion = questions[currentIndex]

  const getCorrect = (q: Question): string => {
    if (q.type === 'flashcard') return q.correctMeaning
    if (q.type === 'fillblank') return q.answer
    return q.answer
  }

  const handleNext = useCallback(async () => {
    if (!currentQuestion || !selectedOption) return
    const correct = getCorrect(currentQuestion)
    const newAnswer: Answer = {
      questionIndex: currentIndex,
      selected: selectedOption,
      correct,
      isCorrect: selectedOption === correct,
      vocabId: currentQuestion.type === 'flashcard' ? currentQuestion.vocabId : undefined,
    }
    const updated = [...answers, newAnswer]

    if (currentIndex + 1 >= questions.length) {
      setAnswers(updated)
      await saveHistory(updated)
      setScreen('results')
      return
    }

    setAnswers(updated)
    setCurrentIndex(i => i + 1)
    setSelectedOption(null)
    setIsAnswered(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, selectedOption, currentIndex, answers, questions.length, saveHistory])

  const score = answers.filter(a => a.isCorrect).length
  const isLast = currentIndex + 1 >= questions.length

  const slideVariants = {
    enter: (dir: number) => ({ x: dir * (prefersReduced ? 0 : 40), opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir * (prefersReduced ? 0 : -40), opacity: 0 }),
  }

  return (
    <div className="max-w-[600px] mx-auto px-6 py-10 lg:py-14 pb-24">
      {screen !== 'results' && (
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 font-mono text-xs text-muted-text mb-10 max-w-none"
          style={{ transition: 'color 150ms' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--color-ink-black)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--color-muted-text)')}
        >
          <ArrowLeft size={14} />
          Back to selection
        </button>
      )}

      {screen === 'session' && questions.length > 0 && (
        <>
          <ProgressBar current={currentIndex} total={questions.length} />
          <div className="flex items-center justify-between mb-6">
            <p className="font-mono text-[10px] tracking-widest uppercase text-muted-text max-w-none">
              HSK {level} · {mode === 'flashcard' ? 'Flashcard' : mode === 'fill' ? 'Fill in the Blank' : 'Reading'}
            </p>
            <p className="font-mono text-xs text-muted-text max-w-none">
              {currentIndex + 1} / {questions.length}
            </p>
          </div>
        </>
      )}

      <AnimatePresence mode="wait">
        {screen === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <LoadingScreen mode={mode} />
          </motion.div>
        )}

        {screen === 'session' && currentQuestion && (
          <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <AnimatePresence mode="wait" custom={slideDir}>
              <motion.div
                key={currentIndex}
                custom={slideDir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: EASE }}
              >
                {currentQuestion.type === 'flashcard' && (
                  <FlashcardCard question={currentQuestion} selectedOption={selectedOption} isAnswered={isAnswered} onSelect={handleSelect} />
                )}
                {currentQuestion.type === 'fillblank' && (
                  <FillBlankCard question={currentQuestion} selectedOption={selectedOption} isAnswered={isAnswered} onSelect={handleSelect} />
                )}
                {currentQuestion.type === 'reading' && (
                  <ReadingCard passage={passage} question={currentQuestion} selectedOption={selectedOption} isAnswered={isAnswered} onSelect={handleSelect} />
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              {isAnswered && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="mt-6"
                >
                  <button
                    onClick={handleNext}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm"
                    style={{ background: 'var(--color-ink-black)', color: 'var(--color-paper-warm)', transition: 'background 200ms' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-red-stamp)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-ink-black)')}
                  >
                    {isLast ? 'See Results' : 'Next'}
                    <ArrowRight size={15} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {screen === 'results' && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <ResultsScreen
              score={score}
              total={questions.length}
              answers={answers}
              onRetry={loadQuiz}
              onMenu={() => router.push('/dashboard/quizzes')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMsg && <Toast key="toast" message={toastMsg} />}
      </AnimatePresence>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function QuizSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--color-red-stamp)', borderTopColor: 'transparent' }}
          />
        </div>
      }
    >
      <SessionInner />
    </Suspense>
  )
}
