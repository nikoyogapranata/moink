'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, useAnimation, useReducedMotion, AnimatePresence } from 'framer-motion'
import { createClient } from '@supabase/supabase-js'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { ArrowLeft, ArrowRight } from 'lucide-react'

// ── Supabase ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Types ──────────────────────────────────────────────────────────────────────

type VocabWord = {
  id: number
  simplified: string
  pinyin: string
  english: string[]
}

type VocabWordWithOptions = VocabWord & {
  correctMeaning: string
  options: string[] // 4 shuffled English meanings
}

type WordStats = {
  correctCount: number
  incorrectCount: number
  lastSeen: string | null
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

// ── Constants ──────────────────────────────────────────────────────────────────

const SESSION_SIZE = 20
const CARD_SHADOW = 'var(--card-shadow-lg)'

// ── Helpers ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildOptions(word: VocabWord, pool: VocabWord[]): string[] {
  const correct = Array.isArray(word.english) ? word.english[0] : String(word.english)
  const distractors = pool
    .filter(w => w.id !== word.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(w => (Array.isArray(w.english) ? w.english[0] : String(w.english)))
  return shuffle([correct, ...distractors])
}

function buildPriorityQueue(words: VocabWord[], historyMap: Map<string, WordStats>): VocabWord[] {
  return [...words].sort((a, b) => {
    const sa = historyMap.get(String(a.id))
    const sb = historyMap.get(String(b.id))
    const unseenA = !sa
    const unseenB = !sb
    if (unseenA && !unseenB) return -1
    if (!unseenA && unseenB) return 1
    if (unseenA && unseenB) return 0
    const diffA = sa!.incorrectCount - sa!.correctCount
    const diffB = sb!.incorrectCount - sb!.correctCount
    if (diffA !== diffB) return diffB - diffA
    return (sa?.lastSeen ?? '').localeCompare(sb?.lastSeen ?? '')
  })
}

// ── Option Button ──────────────────────────────────────────────────────────────

function OptionButton({
  label,
  state,
  onClick,
}: {
  label: string
  state: OptionState
  onClick: () => void
}) {
  const base: React.CSSProperties = {
    width: '100%',
    textAlign: 'left',
    padding: '16px 20px',
    borderRadius: 16,
    fontSize: 17,
    fontWeight: 500,
    transition: 'background 180ms, border-color 180ms, opacity 180ms',
    cursor: state === 'idle' ? 'pointer' : 'default',
  }
  const variants: Record<OptionState, React.CSSProperties> = {
    idle:    { background: 'var(--opt-idle)',    border: '2px solid transparent', color: 'var(--color-ink-black)',    opacity: 1, boxShadow: 'var(--card-shadow)' },
    correct: { background: 'var(--opt-correct)', border: '2px solid var(--opt-correct-border)', color: 'var(--opt-correct-text)', opacity: 1, boxShadow: 'none' },
    wrong:   { background: 'var(--opt-wrong)',   border: '2px solid var(--opt-wrong-border)',   color: 'var(--opt-wrong-text)',   opacity: 1, boxShadow: 'none' },
    dim:     { background: 'var(--opt-idle)',    border: '2px solid transparent', color: 'var(--color-muted-text)', opacity: 0.4, boxShadow: 'none' },
  }
  return (
    <button
      onClick={state === 'idle' ? onClick : undefined}
      disabled={state !== 'idle'}
      style={{ ...base, ...variants[state] }}
    >
      {label}
    </button>
  )
}

function optionState(
  opt: string,
  correct: string,
  selected: string | null,
  isAnswered: boolean
): OptionState {
  if (!isAnswered) return 'idle'
  if (opt === correct) return 'correct'
  if (opt === selected) return 'wrong'
  return 'dim'
}

// ── Flip Card ──────────────────────────────────────────────────────────────────

function FlipCard({
  word,
  isFlipped,
  showPinyin,
  onToggleFlip,
  controls,
}: {
  word: VocabWordWithOptions
  isFlipped: boolean
  showPinyin: boolean
  onToggleFlip: () => void
  controls: ReturnType<typeof useAnimation>
}) {
  const prefersReduced = useReducedMotion()
  const meanings = Array.isArray(word.english) ? word.english : [String(word.english)]

  return (
    <motion.div animate={controls}>
      <div style={{ perspective: '1000px' }}>
        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={prefersReduced ? { duration: 0 } : { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: 320 }}
          whileHover={{ scale: 1.008 }}
          onClick={onToggleFlip}
        >
          {/* ── Front ── */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: 'var(--card-bg)',
              borderRadius: 24,
              boxShadow: CARD_SHADOW,
              padding: '40px 36px 32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 320,
              cursor: 'pointer',
            }}
          >
            <p
              className="font-cjk select-none"
              style={{ fontSize: 160, lineHeight: 1, color: 'var(--color-ink-black)' }}
            >
              {word.simplified}
            </p>

            {/* Pinyin row — always takes space so layout doesn't shift */}
            <div style={{ height: 36, marginTop: 12, display: 'flex', alignItems: 'center' }}>
              <p
                className="font-mono"
                style={{
                  fontSize: 22,
                  letterSpacing: '0.04em',
                  color: showPinyin ? '#dc2626' : 'transparent',
                  transition: 'color 200ms',
                  userSelect: showPinyin ? 'auto' : 'none',
                }}
              >
                {word.pinyin}
              </p>
            </div>

            {/* Flip hint */}
            <p
              className="font-mono"
              style={{
                fontSize: 11,
                color: 'var(--text-faint)',
                marginTop: 16,
                letterSpacing: '0.06em',
              }}
            >
              tap for details ↺
            </p>
          </div>

          {/* ── Back ── */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              position: 'absolute',
              inset: 0,
              background: 'var(--card-bg)',
              borderRadius: 24,
              boxShadow: CARD_SHADOW,
              padding: '32px 36px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <p
              className="font-cjk select-none"
              style={{ fontSize: 48, lineHeight: 1, color: 'var(--color-ink-black)', marginBottom: 4 }}
            >
              {word.simplified}
            </p>
            <p
              className="font-mono"
              style={{ fontSize: 15, color: '#dc2626', letterSpacing: '0.04em', marginBottom: 20 }}
            >
              {word.pinyin}
            </p>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 4 }}>
              {meanings.slice(0, 5).map((m, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: i === 0 ? 20 : 15,
                    fontWeight: i === 0 ? 700 : 400,
                    color: i === 0 ? 'var(--color-ink-black)' : 'var(--text-softer)',
                    lineHeight: 1.4,
                    textAlign: 'center',
                    maxWidth: '100%',
                  }}
                >
                  {m}
                </p>
              ))}
            </div>

            <p
              className="font-mono"
              style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 14, letterSpacing: '0.06em' }}
            >
              tap to flip back ↺
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Session End Screen ─────────────────────────────────────────────────────────

function SessionEndScreen({
  correct,
  incorrect,
  seenCount,
  totalCount,
  hskLevel,
  sessionNumber,
  onNextSession,
  onBack,
}: {
  correct: VocabWord[]
  incorrect: VocabWord[]
  seenCount: number
  totalCount: number
  hskLevel: number
  sessionNumber: number
  onNextSession: () => void
  onBack: () => void
}) {
  const total = correct.length + incorrect.length
  const SHADOW = 'var(--card-shadow)'
  // Deduplicate: only show words not eventually answered correctly
  const reviewWords = incorrect.filter(w => !correct.find(c => c.id === w.id))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
      style={{ maxWidth: 400, margin: '0 auto' }}
    >
      {/* Score card */}
      <div
        style={{
          background: 'var(--card-bg)',
          borderRadius: 24,
          boxShadow: SHADOW,
          padding: '40px 32px 32px',
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        <p
          className="font-mono"
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          Session {sessionNumber} complete
        </p>
        <p
          style={{
            fontSize: '3rem',
            fontWeight: 900,
            color: 'var(--color-ink-black)',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            marginBottom: 8,
          }}
        >
          {correct.length}
          <span style={{ fontSize: '1.5rem', color: 'var(--text-faint)', fontWeight: 400 }}>
            {' '}/ {total}
          </span>
        </p>
        <p style={{ fontSize: 15, color: 'var(--text-softer)', marginBottom: 20 }}>
          {correct.length === total
            ? 'Perfect! Flawless session.'
            : `${reviewWords.length} word${reviewWords.length === 1 ? '' : 's'} still need work`}
        </p>
        <div
          style={{
            background: 'rgba(220,38,38,0.07)',
            borderRadius: 12,
            padding: '10px 16px',
            display: 'inline-block',
          }}
        >
          <p className="font-mono" style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            You&rsquo;ve seen {seenCount} / {totalCount} HSK {hskLevel} words
          </p>
        </div>
      </div>

      {/* Words still needing review */}
      {reviewWords.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p
            className="font-mono"
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Review these
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {reviewWords.map(w => (
              <div
                key={w.id}
                style={{
                  background: 'var(--card-bg)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  boxShadow: SHADOW,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span className="font-cjk" style={{ fontSize: 24, color: '#111111', lineHeight: 1 }}>
                  {w.simplified}
                </span>
                <span className="font-mono" style={{ fontSize: 11, color: '#dc2626' }}>
                  {w.pinyin}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            flex: 1, padding: '14px', borderRadius: 16,
            background: 'var(--color-paper-medium)', color: 'var(--color-ink-black)',
            fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          ← Back to quizzes
        </button>
        <button
          onClick={onNextSession}
          style={{
            flex: 1, padding: '14px', borderRadius: 16,
            background: 'var(--color-ink-black)', color: 'var(--color-paper-warm)',
            fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer',
            transition: 'background 200ms',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#dc2626')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-ink-black)')}
        >
          Next session →
        </button>
      </div>
    </motion.div>
  )
}

// ── Session Inner ──────────────────────────────────────────────────────────────

function FlashcardInner() {
  const params = useSearchParams()
  const router = useRouter()
  const prefersReduced = useReducedMotion()
  const hskLevel = Number(params.get('level')) || 1

  const [screen, setScreen] = useState<'loading' | 'session' | 'results'>('loading')
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null)
  const [allWords, setAllWords] = useState<VocabWord[]>([])
  const [queue, setQueue] = useState<VocabWordWithOptions[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [showPinyin, setShowPinyin] = useState(true)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [correctList, setCorrectList] = useState<VocabWord[]>([])
  const [incorrectList, setIncorrectList] = useState<VocabWord[]>([])
  const [seenCount, setSeenCount] = useState(0)
  const [sessionNumber, setSessionNumber] = useState(1)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  const queueRef = useRef<VocabWordWithOptions[]>([])
  const currentIdxRef = useRef(0)
  const notYetSetRef = useRef(new Set<number>())
  const correctListRef = useRef<VocabWord[]>([])
  const incorrectListRef = useRef<VocabWord[]>([])
  const firebaseUidRef = useRef<string>('anonymous')
  const allWordsRef = useRef<VocabWord[]>([])

  const cardControls = useAnimation()

  // ── Auth ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      const uid = user?.uid ?? 'anonymous'
      setFirebaseUid(uid)
      firebaseUidRef.current = uid
    })
    return unsub
  }, [])

  // ── Load session ─────────────────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    setScreen('loading')
    setIsFlipped(false)
    setSelectedOption(null)
    setIsAnswered(false)
    setCorrectList([])
    setIncorrectList([])
    correctListRef.current = []
    incorrectListRef.current = []
    notYetSetRef.current = new Set()
    setErrorMsg(null)

    try {
      const { data: words, error: wordsError } = await supabase
        .from('vocabulary')
        .select('id, simplified, pinyin, english')
        .eq('hsk_level', hskLevel)
        .limit(1000)

      if (wordsError || !words || words.length === 0) {
        throw new Error(wordsError?.message ?? 'No words found for this level')
      }

      const typedWords = words as VocabWord[]
      setAllWords(typedWords)
      allWordsRef.current = typedWords

      const uid = firebaseUidRef.current
      const historyMap = new Map<string, WordStats>()
      const seenSet = new Set<string>()

      if (uid !== 'anonymous') {
        const { data: history } = await supabase
          .from('quiz_history')
          .select('vocab_id, is_correct, created_at')
          .eq('firebase_uid', uid)
          .eq('quiz_type', 'flashcard')
          .in('vocab_id', typedWords.map(w => w.id))

        if (history) {
          for (const row of history) {
            const key = String(row.vocab_id)
            seenSet.add(key)
            const existing = historyMap.get(key) ?? { correctCount: 0, incorrectCount: 0, lastSeen: null }
            if (row.is_correct) existing.correctCount++
            else existing.incorrectCount++
            if (!existing.lastSeen || (row.created_at && row.created_at > existing.lastSeen)) {
              existing.lastSeen = row.created_at
            }
            historyMap.set(key, existing)
          }
        }
      }

      setSeenCount(seenSet.size)

      const prioritized = buildPriorityQueue(typedWords, historyMap)
      const session = prioritized.slice(0, SESSION_SIZE)

      // Attach MC options to each word using full pool as distractor source
      const sessionWithOptions: VocabWordWithOptions[] = session.map(word => ({
        ...word,
        correctMeaning: Array.isArray(word.english) ? word.english[0] : String(word.english),
        options: buildOptions(word, typedWords),
      }))

      queueRef.current = sessionWithOptions
      setQueue(sessionWithOptions)
      currentIdxRef.current = 0
      setCurrentIdx(0)

      cardControls.set(prefersReduced ? {} : { x: 0, opacity: 1, rotate: -1 })
      if (!prefersReduced) {
        await cardControls.start({ rotate: 0, transition: { duration: 0.3, ease: [0.25, 1, 0.5, 1] } })
      }
      setScreen('session')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load quiz')
    }
  }, [hskLevel, cardControls, prefersReduced])

  useEffect(() => {
    if (firebaseUid === null) return
    loadSession()
  }, [firebaseUid, loadSession])

  // ── Save history ─────────────────────────────────────────────────────────────

  const saveHistory = useCallback(async (correct: VocabWord[], incorrect: VocabWord[]) => {
    const uid = firebaseUidRef.current
    if (uid === 'anonymous') return
    const rows = [
      ...correct.map(w => ({ firebase_uid: uid, vocab_id: w.id, quiz_type: 'flashcard', is_correct: true })),
      ...incorrect.map(w => ({ firebase_uid: uid, vocab_id: w.id, quiz_type: 'flashcard', is_correct: false })),
    ]
    if (rows.length > 0) await supabase.from('quiz_history').insert(rows)
  }, [])

  // ── Advance to next card ──────────────────────────────────────────────────────

  const advance = useCallback(async (type: 'correct' | 'incorrect') => {
    if (isAnimating) return
    setIsAnimating(true)

    const word = queueRef.current[currentIdxRef.current]

    if (type === 'correct') {
      const updated = [...correctListRef.current, word]
      correctListRef.current = updated
      setCorrectList(updated)
    } else {
      const updated = [...incorrectListRef.current, word]
      incorrectListRef.current = updated
      setIncorrectList(updated)
      // Re-queue the word once for a second chance
      if (!notYetSetRef.current.has(word.id)) {
        notYetSetRef.current.add(word.id)
        const newQueue = [...queueRef.current, word]
        queueRef.current = newQueue
        setQueue(newQueue)
      }
    }

    // Animate card out
    if (!prefersReduced) {
      if (type === 'incorrect') {
        await cardControls.start({
          x: [-8, 8, -6, 6, -4, 4, 0],
          transition: { duration: 0.28, ease: 'linear' },
        })
        await cardControls.start({
          x: 280, opacity: 0,
          transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
        })
      } else {
        await cardControls.start({
          x: -280, opacity: 0,
          transition: { duration: 0.25, ease: [0.4, 0, 1, 1] },
        })
      }
    }

    const nextIdx = currentIdxRef.current + 1
    const isDone = nextIdx >= queueRef.current.length

    if (isDone) {
      await saveHistory(correctListRef.current, incorrectListRef.current)
      setIsFlipped(false)
      setSelectedOption(null)
      setIsAnswered(false)
      setScreen('results')
      setIsAnimating(false)
      return
    }

    // Advance to next card
    setIsFlipped(false)
    setSelectedOption(null)
    setIsAnswered(false)
    currentIdxRef.current = nextIdx
    setCurrentIdx(nextIdx)

    if (!prefersReduced) {
      cardControls.set({ x: 80, opacity: 0, rotate: -1 })
      await cardControls.start({
        x: 0, opacity: 1, rotate: 0,
        transition: { duration: 0.28, ease: [0, 0, 0.2, 1] },
      })
    }

    setIsAnimating(false)
  }, [isAnimating, cardControls, prefersReduced, saveHistory])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleToggleFlip() {
    if (!isAnimating) setIsFlipped(f => !f)
  }

  function handleSelect(opt: string) {
    if (isAnswered || isAnimating) return
    setSelectedOption(opt)
    setIsAnswered(true)
  }

  function handleNext() {
    if (!currentWord || !selectedOption || isAnimating) return
    const isCorrect = selectedOption === currentWord.correctMeaning
    advance(isCorrect ? 'correct' : 'incorrect')
  }

  async function handleNextSession() {
    setSessionNumber(n => n + 1)
    await loadSession()
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const currentWord = queue[currentIdx] ?? null
  const originalSessionSize = Math.min(SESSION_SIZE, allWordsRef.current.length > 0 ? SESSION_SIZE : SESSION_SIZE)
  const progressPct = originalSessionSize > 0 ? Math.min(currentIdx / originalSessionSize, 1) : 0
  const remaining = allWords.length - seenCount

  // ── Render ───────────────────────────────────────────────────────────────────

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

      {/* Header: back + pinyin toggle */}
      <div className="flex items-center justify-between mb-6">
        {screen !== 'results' ? (
          <button
            onClick={() => router.push('/dashboard/quizzes')}
            className="flex items-center gap-2 font-mono"
            style={{ fontSize: 13, color: 'var(--color-muted-text)', transition: 'color 150ms' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--color-ink-black)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--color-muted-text)')}
          >
            <ArrowLeft size={14} />
            Quizzes
          </button>
        ) : (
          <div />
        )}

        {screen === 'session' && (
          <button
            onClick={() => setShowPinyin(p => !p)}
            className="font-mono"
            style={{
              fontSize: 12,
              color: showPinyin ? '#dc2626' : 'var(--text-secondary)',
              background: showPinyin ? 'rgba(220,38,38,0.08)' : 'rgba(127,127,127,0.1)',
              padding: '6px 12px',
              borderRadius: 8,
              transition: 'color 150ms, background 150ms',
              letterSpacing: '0.04em',
              fontWeight: 600,
            }}
          >
            Pinyin {showPinyin ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      {/* ── Loading ── */}
      {screen === 'loading' && (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          {errorMsg ? (
            <div className="text-center">
              <p className="font-bold text-ink-black mb-2" style={{ fontSize: 16 }}>Failed to load</p>
              <p className="font-mono text-muted-text mb-6" style={{ fontSize: 13 }}>{errorMsg}</p>
              <button
                onClick={loadSession}
                className="px-6 py-3 rounded-2xl font-semibold"
                style={{ background: 'var(--color-ink-black)', color: 'var(--color-paper-warm)', fontSize: 15 }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div
                className="rounded-full border-2 animate-spin"
                style={{ width: 44, height: 44, borderColor: '#dc2626', borderTopColor: 'transparent' }}
              />
              <div className="text-center">
                <p className="font-bold text-ink-black" style={{ fontSize: 16 }}>Preparing your session…</p>
                <p className="font-mono text-muted-text mt-1" style={{ fontSize: 13 }}>Building your study queue</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Session ── */}
      {screen === 'session' && currentWord && (
        <>
          {/* Progress */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono whitespace-nowrap" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                HSK {hskLevel} · Flashcard · Session {sessionNumber}
              </span>
              <span className="font-mono whitespace-nowrap" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {Math.min(currentIdx + 1, originalSessionSize)} / {originalSessionSize}
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--color-brush-gray)', borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progressPct * 100}%`,
                  background: '#dc2626',
                  borderRadius: 99,
                  transition: 'width 350ms ease',
                }}
              />
            </div>
            {remaining > 0 && (
              <p className="font-mono mt-1.5" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {remaining} word{remaining === 1 ? '' : 's'} remaining in HSK {hskLevel}
              </p>
            )}
          </div>

          {/* Flip card */}
          <FlipCard
            word={currentWord}
            isFlipped={isFlipped}
            showPinyin={showPinyin}
            onToggleFlip={handleToggleFlip}
            controls={cardControls}
          />

          {/* MC options — always visible */}
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {currentWord.options.map(opt => (
              <OptionButton
                key={opt}
                label={opt}
                state={optionState(opt, currentWord.correctMeaning, selectedOption, isAnswered)}
                onClick={() => handleSelect(opt)}
              />
            ))}
          </div>

          {/* Next button — appears after answering */}
          <AnimatePresence>
            {isAnswered && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                style={{ marginTop: 16 }}
              >
                <button
                  onClick={handleNext}
                  disabled={isAnimating}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold"
                  style={{
                    padding: '14px',
                    fontSize: 15,
                    background: 'var(--color-ink-black)',
                    color: 'var(--color-paper-warm)',
                    border: 'none',
                    cursor: isAnimating ? 'default' : 'pointer',
                    transition: 'background 200ms',
                    opacity: isAnimating ? 0.6 : 1,
                  }}
                  onMouseEnter={e => {
                    if (!isAnimating) (e.currentTarget as HTMLElement).style.background = '#dc2626'
                  }}
                  onMouseLeave={e => {
                    if (!isAnimating) (e.currentTarget as HTMLElement).style.background = 'var(--color-ink-black)'
                  }}
                >
                  Next
                  <ArrowRight size={15} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── Results ── */}
      {screen === 'results' && (
        <SessionEndScreen
          correct={correctList}
          incorrect={incorrectList}
          seenCount={seenCount + correctList.filter(w => !incorrectList.find(x => x.id === w.id)).length}
          totalCount={allWords.length}
          hskLevel={hskLevel}
          sessionNumber={sessionNumber}
          onNextSession={handleNextSession}
          onBack={() => router.push('/dashboard/quizzes')}
        />
      )}

      </div>
    </main>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FlashcardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <div
            className="rounded-full border-2 animate-spin"
            style={{ width: 40, height: 40, borderColor: '#dc2626', borderTopColor: 'transparent' }}
          />
        </div>
      }
    >
      <FlashcardInner />
    </Suspense>
  )
}
