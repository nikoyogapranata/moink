'use client'

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

// ── Mock data (replace with Supabase queries later) ───────────────────────────

const todayWord = {
  character: '学习',
  pinyin: 'xuéxí',
  meaning: 'to study; to learn',
  hsk: 2,
  components: [
    { char: '学', gloss: 'learn' },
    { char: '习', gloss: 'practice' },
  ],
}

const recentVocab = [
  { character: '朋友', pinyin: 'péngyou', meaning: 'friend', hsk: 1 },
  { character: '工作', pinyin: 'gōngzuò', meaning: 'work, job', hsk: 2 },
  { character: '时间', pinyin: 'shíjiān', meaning: 'time', hsk: 2 },
  { character: '问题', pinyin: 'wèntí', meaning: 'question', hsk: 2 },
  { character: '学生', pinyin: 'xuésheng', meaning: 'student', hsk: 1 },
]

const componentFamily = {
  radical: '女',
  gloss: 'woman',
  words: [
    { character: '她', pinyin: 'tā', meaning: 'she / her' },
    { character: '妈妈', pinyin: 'māma', meaning: 'mother' },
    { character: '姐姐', pinyin: 'jiějie', meaning: 'older sister' },
  ],
}

const streakData = [false, true, true, false, true, true, true]
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const currentStreak = 3

const upNextWords = [
  { character: '介绍', pinyin: 'jièshào', meaning: 'to introduce' },
  { character: '帮助', pinyin: 'bāngzhù', meaning: 'to help' },
  { character: '机会', pinyin: 'jīhuì', meaning: 'opportunity' },
]

const cultureSpotlight = {
  category: 'FESTIVAL',
  title: 'Mid-Autumn Festival',
  description: 'The moon is fullest and families gather — learn the words that fill the night.',
  characters: '中秋',
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const CARD_SHADOW = '0 4px 32px rgba(0,0,0,0.06)'

function HskBadge({ level }: { level: number }) {
  return (
    <span className="font-mono text-[10px] font-medium px-2 py-[3px] rounded-full bg-red-stamp text-white select-none">
      HSK {level}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs font-medium text-muted-text tracking-[0.08em] uppercase mb-4 max-w-none">
      {children}
    </p>
  )
}

// ── Zone 1 components ─────────────────────────────────────────────────────────

function FeaturedWordCard() {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col h-full min-h-[200px]"
      style={{ background: 'var(--color-paper-warm)' }}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="font-mono text-[10px] text-muted-text tracking-widest uppercase max-w-none">
          Today&apos;s word
        </span>
        <HskBadge level={todayWord.hsk} />
      </div>

      <div className="flex-1 flex items-center justify-center py-4">
        <span
          className="font-cjk leading-none text-ink-black select-none"
          style={{ fontSize: '4.5rem' }}
        >
          {todayWord.character}
        </span>
      </div>

      <div className="text-center">
        <p className="font-mono text-sm text-muted-text max-w-none">{todayWord.pinyin}</p>
        <p className="text-sm font-semibold text-ink-black mt-0.5 max-w-none">{todayWord.meaning}</p>
      </div>

      <div className="flex gap-1.5 justify-center mt-3 flex-wrap">
        {todayWord.components.map(c => (
          <span
            key={c.char}
            className="font-mono text-[11px] px-2.5 py-1 rounded-full text-ink-soft"
            style={{ background: 'var(--color-paper-medium)', border: '1px solid var(--color-brush-gray)' }}
          >
            {c.char} {c.gloss}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Zone 2 — Left column ──────────────────────────────────────────────────────

function RecentVocabSection() {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Recent vocabulary</SectionLabel>
        <Link
          href="/dashboard/vocabulary"
          className="font-mono text-[11px] text-muted-text hover:text-ink-black flex items-center gap-1 max-w-none"
          style={{ transition: 'color 150ms' }}
        >
          See all <ArrowRight size={11} />
        </Link>
      </div>

      <div className="overflow-x-auto -mx-6 px-6" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-3 pb-1" style={{ width: 'max-content' }}>
          {recentVocab.map(word => (
            <div
              key={word.character}
              className="flex-shrink-0 w-[108px] rounded-2xl p-4 cursor-pointer hover:-translate-y-0.5 transition-transform duration-200"
              style={{ background: 'var(--color-paper-warm)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
            >
              <p
                className="font-cjk text-[2rem] text-ink-black leading-none text-center select-none"
              >
                {word.character}
              </p>
              <p className="font-mono text-[11px] text-muted-text text-center mt-1.5 max-w-none">
                {word.pinyin}
              </p>
              <p className="text-xs font-medium text-ink-soft text-center mt-0.5 max-w-none line-clamp-1">
                {word.meaning}
              </p>
              <div className="flex justify-center mt-2.5">
                <HskBadge level={word.hsk} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ComponentFamilySection() {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}
    >
      <SectionLabel>Component family</SectionLabel>

      {/* Radical header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-paper-warm)' }}
        >
          <span className="font-cjk text-2xl text-ink-black leading-none select-none">
            {componentFamily.radical}
          </span>
        </div>
        <div>
          <p className="font-mono text-xs text-muted-text max-w-none">
            {componentFamily.radical} · {componentFamily.gloss}
          </p>
          <p className="text-sm font-semibold text-ink-black mt-0.5 max-w-none">
            Words sharing this component
          </p>
        </div>
      </div>

      {/* SVG connector tree */}
      <svg
        viewBox="0 0 300 36"
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: 36 }}
        aria-hidden="true"
      >
        <line x1="150" y1="0" x2="150" y2="16" stroke="var(--color-brush-gray)" strokeWidth="1.5" />
        <line x1="50" y1="16" x2="250" y2="16" stroke="var(--color-brush-gray)" strokeWidth="1.5" />
        <line x1="50" y1="16" x2="50" y2="36" stroke="var(--color-brush-gray)" strokeWidth="1.5" />
        <line x1="150" y1="16" x2="150" y2="36" stroke="var(--color-brush-gray)" strokeWidth="1.5" />
        <line x1="250" y1="16" x2="250" y2="36" stroke="var(--color-brush-gray)" strokeWidth="1.5" />
        <circle cx="50" cy="34" r="3" fill="var(--color-brush-gray)" />
        <circle cx="150" cy="34" r="3" fill="var(--color-brush-gray)" />
        <circle cx="250" cy="34" r="3" fill="var(--color-brush-gray)" />
      </svg>

      {/* Word cards */}
      <div className="grid grid-cols-3 gap-3 mt-1">
        {componentFamily.words.map(word => (
          <div
            key={word.character}
            className="rounded-xl p-3 text-center cursor-pointer hover:bg-paper-medium"
            style={{ background: 'var(--color-paper-warm)', transition: 'background 150ms' }}
          >
            <p className="font-cjk text-2xl text-ink-black leading-none select-none">
              {word.character}
            </p>
            <p className="font-mono text-[10px] text-muted-text mt-1 max-w-none">
              {word.pinyin}
            </p>
            <p className="text-[11px] font-medium text-ink-soft mt-0.5 max-w-none line-clamp-1">
              {word.meaning}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Zone 2 — Right column ─────────────────────────────────────────────────────

function StreakSection() {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}
    >
      <SectionLabel>7-day activity</SectionLabel>

      <div className="flex items-baseline gap-1.5 mb-5">
        <span
          className="font-black text-ink-black"
          style={{ fontSize: '2.5rem', lineHeight: 1, letterSpacing: '-0.04em' }}
        >
          {currentStreak}
        </span>
        <span className="text-sm font-medium text-muted-text">day streak</span>
      </div>

      <div className="flex items-end justify-between">
        {streakData.map((studied, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div
              className={[
                'w-7 h-7 rounded-full',
                studied
                  ? 'bg-red-stamp'
                  : 'border-2',
              ].join(' ')}
              style={studied ? {} : { borderColor: 'var(--color-brush-gray)' }}
            />
            <span className="font-mono text-[10px] text-muted-text">{DAYS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpNextSection() {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center justify-between mb-1">
        <SectionLabel>Up next in HSK 2</SectionLabel>
      </div>

      <ul className="space-y-1" role="list">
        {upNextWords.map((word, i) => (
          <li key={i}>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-paper-warm cursor-pointer group"
              style={{ transition: 'background 150ms' }}
            >
              <span className="font-cjk text-2xl text-ink-black leading-none w-10 text-center flex-shrink-0 select-none">
                {word.character}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-muted-text max-w-none">{word.pinyin}</p>
                <p className="text-sm font-medium text-ink-soft truncate max-w-none">{word.meaning}</p>
              </div>
              <ArrowRight
                size={14}
                className="text-muted-text group-hover:text-ink-black flex-shrink-0"
                style={{ transition: 'color 150ms' }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-brush-gray)' }}>
        <Link
          href="/dashboard/vocabulary"
          className="flex items-center justify-between text-sm font-semibold text-ink-black hover:text-red-stamp max-w-none"
          style={{ transition: 'color 150ms' }}
        >
          View full HSK 2 vocabulary
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}

// ── Zone 3 ────────────────────────────────────────────────────────────────────

function CultureSpotlight() {
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{ background: '#111111', boxShadow: CARD_SHADOW }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center">
        {/* Content */}
        <div className="flex-1 p-8 lg:p-10">
          <span className="font-mono text-xs text-red-stamp tracking-[0.14em] uppercase max-w-none">
            {cultureSpotlight.category}
          </span>
          <h2
            className="text-white mt-2 mb-2 font-black max-w-none"
            style={{ fontSize: '1.4rem', lineHeight: 1.2, letterSpacing: '-0.025em' }}
          >
            {cultureSpotlight.title}
          </h2>
          <p className="text-sm text-white/55 mb-7 max-w-none">
            {cultureSpotlight.description}
          </p>
          <Link
            href="/dashboard/culture"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border text-white text-sm font-semibold hover:bg-white/[0.08]"
            style={{
              borderColor: 'rgba(255,255,255,0.28)',
              transition: 'background 150ms, border-color 150ms',
            }}
          >
            Explore
            <ArrowRight size={14} />
          </Link>
        </div>

        {/* Decorative characters */}
        <div
          className="px-8 pb-8 lg:p-10 lg:pl-0 flex items-center justify-center select-none pointer-events-none"
          aria-hidden="true"
        >
          <span
            className="font-cjk leading-none"
            style={{
              fontSize: 'clamp(5rem, 8vw, 9rem)',
              color: 'rgba(255,255,255,0.12)',
            }}
          >
            {cultureSpotlight.characters}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const prefersReduced = useReducedMotion()

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const zone = (delay: number) =>
    prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: [0.25, 1, 0.5, 1] as const },
        }

  return (
    <div className="max-w-[1080px] mx-auto px-6 py-8 lg:px-8 lg:py-10 pb-12">

      {/* ── Zone 1: Pick up where you left off ── */}
      <motion.div {...zone(0)}>
        <div
          className="rounded-3xl p-6 lg:p-8"
          style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-6 lg:gap-8">

            {/* Left — greeting */}
            <div className="flex flex-col justify-between gap-6">
              <div>
                <p className="font-mono text-xs text-muted-text tracking-[0.08em] uppercase mb-3 max-w-none">
                  Pick up where you left off
                </p>
                <h1
                  className="font-black text-ink-black"
                  style={{ fontSize: '2rem', lineHeight: 1.1, letterSpacing: '-0.035em' }}
                >
                  {greeting}, Niko.
                </h1>
                <p className="text-sm text-muted-text mt-2 max-w-none">
                  HSK 2 &middot; 12 words this week
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Link
                  href="/dashboard/vocabulary"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-ink-black text-paper-warm text-sm font-bold hover:bg-red-stamp self-start"
                  style={{ transition: 'background 180ms cubic-bezier(0.25,1,0.5,1)' }}
                >
                  Continue HSK 2
                  <ArrowRight size={14} />
                </Link>
                <span className="text-sm text-muted-text max-w-none">
                  Next: 介绍 &middot; to introduce
                </span>
              </div>
            </div>

            {/* Right — today's word */}
            <FeaturedWordCard />
          </div>
        </div>
      </motion.div>

      {/* ── Zone 2: Two-column ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

        {/* Left column */}
        <motion.div className="space-y-6" {...zone(0.12)}>
          <RecentVocabSection />
          <ComponentFamilySection />
        </motion.div>

        {/* Right column */}
        <motion.div className="space-y-6" {...zone(0.2)}>
          <StreakSection />
          <UpNextSection />
        </motion.div>

      </div>

      {/* ── Zone 3: Culture spotlight ── */}
      <motion.div className="mt-6" {...zone(0.28)}>
        <CultureSpotlight />
      </motion.div>

    </div>
  )
}
