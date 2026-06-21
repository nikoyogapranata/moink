'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Zap, PenLine, BookOpen, ArrowRight } from 'lucide-react'

// ── Data ──────────────────────────────────────────────────────────────────────

const HSK_LEVELS = [
  { level: 1, count: 150, desc: 'Basics' },
  { level: 2, count: 147, desc: 'Elementary' },
  { level: 3, count: 298, desc: 'Intermediate' },
  { level: 4, count: 598, desc: 'Upper Intermediate' },
]

const QUIZ_MODES = [
  {
    id: 'flashcard',
    label: 'Flashcard',
    desc: 'Flip cards with spaced repetition',
    icon: Zap,
  },
  {
    id: 'fillblank',
    label: 'Fill in the Blank',
    desc: 'Complete sentences with missing words',
    icon: PenLine,
  },
  {
    id: 'reading',
    label: 'Reading',
    desc: 'Read passages and answer questions',
    icon: BookOpen,
  },
]

const CARD_SHADOW = 'var(--card-shadow)'

// ── Sub-components ────────────────────────────────────────────────────────────

function HskLevelCard({
  level,
  count,
  desc,
  selected,
  onClick,
}: {
  level: number
  count: number
  desc: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-3xl p-6 w-full"
      style={{
        background: selected ? 'var(--color-card-hover)' : 'var(--color-card)',
        boxShadow: CARD_SHADOW,
        border: `2px solid ${selected ? 'var(--color-red-stamp)' : 'transparent'}`,
        transition: 'border-color 200ms, background 200ms',
      }}
    >
      <span className="font-mono text-muted-text tracking-widest uppercase max-w-none" style={{ fontSize: 13 }}>
        HSK
      </span>
      <span
        className="font-black text-red-stamp leading-none block"
        style={{ fontSize: 80, lineHeight: 1 }}
      >
        {level}
      </span>
      <p className="font-mono text-muted-text mt-2 max-w-none" style={{ fontSize: 13 }}>
        {count} words · {desc}
      </p>
    </button>
  )
}

function QuizModeCard({
  id,
  label,
  desc,
  icon: Icon,
  selected,
  onClick,
}: {
  id: string
  label: string
  desc: string
  icon: React.ElementType
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 rounded-2xl px-5 py-4"
      style={{
        background: selected ? 'var(--color-card-hover)' : 'var(--color-card)',
        boxShadow: CARD_SHADOW,
        border: `2px solid ${selected ? 'var(--color-red-stamp)' : 'transparent'}`,
        transition: 'border-color 200ms, background 200ms',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: selected ? 'var(--color-red-stamp)' : 'var(--color-paper-warm)',
          transition: 'background 200ms',
        }}
      >
        <Icon size={18} color={selected ? '#FFFFFF' : 'var(--color-ink-soft)'} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold text-ink-black max-w-none" style={{ fontSize: 15 }}>{label}</p>
        <p className="font-mono text-muted-text mt-0.5 max-w-none" style={{ fontSize: 13 }}>{desc}</p>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            className="w-5 h-5 rounded-full bg-red-stamp flex items-center justify-center flex-shrink-0"
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
              <path
                d="M1 4L3.5 6.5L9 1"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuizzesPage() {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [selectedMode, setSelectedMode] = useState<string | null>(null)
  const prefersReduced = useReducedMotion()
  const router = useRouter()

  const selectedLevelData = HSK_LEVELS.find(l => l.level === selectedLevel)
  const canStart = selectedLevel !== null && selectedMode !== null
  const ease = [0.25, 1, 0.5, 1] as const

  function handleStart() {
    if (!canStart) return
    router.push(`/dashboard/quizzes/${selectedMode}?level=${selectedLevel}`)
  }

  function handleLevelSelect(level: number) {
    setSelectedLevel(level)
    if (selectedLevel !== level) setSelectedMode(null)
  }

  return (
    <div className="max-w-[600px] mx-auto px-6 py-10 lg:py-14 pb-20">

      {/* Header */}
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="mb-8"
      >
        <p className="font-mono text-muted-text tracking-[0.08em] uppercase mb-2 max-w-none" style={{ fontSize: 13 }}>
          Quizzes
        </p>
        <h1
          className="font-black text-ink-black"
          style={{ fontSize: '2.5rem', letterSpacing: '-0.04em', lineHeight: 1.05 }}
        >
          What are you studying?
        </h1>
      </motion.div>

      {/* Step 1 — HSK Level grid */}
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease }}
      >
        <div className="grid grid-cols-2 gap-4">
          {HSK_LEVELS.map(({ level, count, desc }) => (
            <HskLevelCard
              key={level}
              level={level}
              count={count}
              desc={desc}
              selected={selectedLevel === level}
              onClick={() => handleLevelSelect(level)}
            />
          ))}
        </div>
      </motion.div>

      {/* Step 2 — Quiz modes */}
      <AnimatePresence>
        {selectedLevel !== null && (
          <motion.div
            key="mode-step"
            initial={prefersReduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4, ease }}
            className="mt-8"
          >
            <p className="font-mono text-muted-text tracking-[0.06em] mb-4 max-w-none" style={{ fontSize: 13 }}>
              Quizzing from{' '}
              <span className="text-ink-soft font-medium">{selectedLevelData?.count} HSK {selectedLevel}</span>{' '}
              words
            </p>

            <div className="space-y-3">
              {QUIZ_MODES.map(({ id, label, desc, icon }) => (
                <QuizModeCard
                  key={id}
                  id={id}
                  label={label}
                  desc={desc}
                  icon={icon}
                  selected={selectedMode === id}
                  onClick={() => setSelectedMode(id)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 3 — Start button */}
      <AnimatePresence>
        {canStart && (
          <motion.div
            key="start-btn"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease }}
            className="mt-6"
          >
            <button
              onClick={handleStart}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold"
              style={{
                fontSize: 15,
                background: 'var(--color-ink-black)',
                color: 'var(--color-paper-warm)',
                transition: 'background 200ms cubic-bezier(0.25,1,0.5,1)',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--color-red-stamp)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--color-ink-black)'
              }}
            >
              Start quiz
              <ArrowRight size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
