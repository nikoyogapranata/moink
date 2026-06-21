'use client'

import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// ── Data ─────────────────────────────────────────────────────────────────────

const vocabCards = [
  {
    char: '你',
    pinyin: 'nǐ',
    meaning: 'you',
    hsk: 1,
    components: [
      { char: '亻', label: 'person' },
      { char: '尔', label: 'you (archaic)' },
    ],
  },
  {
    char: '好',
    pinyin: 'hǎo',
    meaning: 'good',
    hsk: 1,
    components: [
      { char: '女', label: 'woman' },
      { char: '子', label: 'child' },
    ],
  },
  {
    char: '学',
    pinyin: 'xué',
    meaning: 'to learn',
    hsk: 1,
    components: [{ char: '子', label: 'child / seed' }],
  },
]

const features = [
  {
    num: '01',
    bgChar: '女',
    title: 'Component similarity grouping',
    body: 'Words sharing a radical are studied together. Learn 妈, 好, and 她 in one session — they all carry 女 (woman). Connections form faster than through rote memorisation.',
  },
  {
    num: '02',
    bgChar: '级',
    title: 'HSK 1–4 progression',
    body: 'Structured from first greetings to everyday conversation. Each level builds on the last so you always know where you stand and what comes next.',
  },
  {
    num: '03',
    bgChar: '旅',
    title: 'Chinese culture & context',
    body: 'Vocabulary connects to destinations, food, and festivals. Learning 旅行 (travel) unlocks a cluster of related words and a culture section where they come alive.',
  },
]

const cultureItems = [
  {
    char: '旅行',
    pinyin: 'lǚ xíng',
    label: 'Destinations',
    desc: 'Places that put your vocabulary to work.',
  },
  {
    char: '美食',
    pinyin: 'měi shí',
    label: 'Food',
    desc: 'Menus, ingredients, dinner conversation.',
  },
  {
    char: '节日',
    pinyin: 'jié rì',
    label: 'Festivals',
    desc: "Traditions that give the language its texture.",
  },
]

type HeroComponent =
  | { char: string; label: string; accent?: boolean }
  | { sep: true }

const heroComponents: HeroComponent[] = [
  { char: '爫', label: 'hands' },
  { sep: true },
  { char: '冖', label: 'cover' },
  { sep: true },
  { char: '子', label: 'child', accent: true },
]

// ── Motion helpers ────────────────────────────────────────────────────────────

function useAnim() {
  const reduced = useReducedMotion()
  const ease: [number, number, number, number] = [0.25, 1, 0.5, 1]

  const hero = (delay = 0) => ({
    initial: reduced ? {} : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: reduced ? { duration: 0 } : { duration: 0.55, delay, ease },
  })

  const scaleUp = (delay = 0) => ({
    initial: reduced ? {} : { opacity: 0, scale: 0.88 },
    animate: { opacity: 1, scale: 1 },
    transition: reduced ? { duration: 0 } : { duration: 0.5, delay, ease },
  })

  const inView = (delay = 0) => ({
    initial: reduced ? {} : { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-40px' },
    transition: reduced ? { duration: 0 } : { duration: 0.5, delay, ease },
  })

  return { hero, scaleUp, inView }
}

// ── Mascot ────────────────────────────────────────────────────────────────────

function Mascot() {
  return (
    <div
      className="w-56 h-56 rounded-full bg-paper-highlight flex items-center justify-center select-none mx-auto"
      role="img"
      aria-label="Moink the red panda mascot"
      style={{
        fontSize: '5rem',
        boxShadow:
          '0 0 0 12px rgba(220,38,38,0.08), 0 0 0 24px rgba(220,38,38,0.04)',
      }}
    >
      🐼
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function NavThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return <div style={{ width: 36, height: 36 }} />

  const isDark = resolvedTheme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brush-gray dark:border-white/10 text-ink-black dark:text-[#f0ece8] hover:bg-paper-medium dark:hover:bg-white/8"
      style={{ transition: 'background 150ms', flexShrink: 0 }}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
    </button>
  )
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-paper-warm dark:bg-[#0f0f0f] border-b border-brush-gray dark:border-white/8">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="text-xl font-extrabold tracking-tight text-red-stamp select-none">
          MOINK
        </span>
        <div className="flex items-center gap-3">
          <NavThemeToggle />
          <Link
            href="/sign-in"
            className="hidden sm:inline-flex h-9 items-center px-4 rounded-lg border border-brush-gray dark:border-white/10 text-sm font-semibold text-ink-black dark:text-[#f0ece8] hover:bg-paper-medium dark:hover:bg-white/8"
            style={{ transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)' }}
          >
            Sign in
          </Link>
          <Link
            href="/start"
            className="inline-flex h-9 items-center px-4 rounded-lg bg-ink-black dark:bg-[#f0ece8] text-paper-warm dark:text-[#0f0f0f] text-sm font-bold hover:bg-red-stamp dark:hover:bg-red-stamp dark:hover:text-white"
            style={{ transition: 'background 180ms cubic-bezier(0.25,1,0.5,1)' }}
          >
            Start learning
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({ anim }: { anim: ReturnType<typeof useAnim> }) {
  return (
    <section className="bg-paper-warm dark:bg-[#0f0f0f] px-6 py-32">
      <div className="max-w-3xl mx-auto text-center">

        <motion.div {...anim.scaleUp(0)} className="mb-10">
          <Mascot />
        </motion.div>

        <motion.h1
          {...anim.hero(0.07)}
          className="text-[2.875rem] sm:text-[3.875rem] lg:text-[4.75rem] font-black leading-[1.05] text-ink-black mb-5"
          style={{ letterSpacing: '-0.04em' }}
        >
          Every character is built from pieces.
        </motion.h1>

        <motion.p
          {...anim.hero(0.14)}
          className="text-[1.625rem] sm:text-[2rem] font-bold text-red-stamp mb-7"
        >
          Learn the pieces.
        </motion.p>

        <motion.p
          {...anim.hero(0.2)}
          className="text-base text-ink-soft leading-relaxed mb-10 max-w-[40ch] mx-auto"
        >
          Moink groups vocabulary by shared radicals so patterns click into place.
          Structured by HSK level, grounded in real Chinese culture.
        </motion.p>

        <motion.div {...anim.hero(0.26)}>
          <Link
            href="/start"
            className="inline-flex h-12 items-center px-8 rounded-lg bg-ink-black text-paper-warm text-base font-bold hover:bg-red-stamp"
            style={{ transition: 'background 180ms cubic-bezier(0.25,1,0.5,1)' }}
          >
            Start learning free
          </Link>
        </motion.div>

        <motion.p
          {...anim.hero(0.31)}
          className="font-mono text-[11px] text-muted-text tracking-[0.18em] mt-5"
        >
          HSK 1–4 · Free · No fluff
        </motion.p>

        {/* Character breakdown card */}
        <div className="mt-16 mx-auto max-w-[22rem]" style={{ transform: 'rotate(-3deg)' }}>
          <motion.div
            {...anim.hero(0.38)}
            className="rounded-3xl p-8 sm:p-10"
            style={{
              background: 'var(--card-bg)',
              boxShadow: '0 16px 48px rgba(150,90,30,0.18), 0 4px 12px rgba(150,90,30,0.10)',
              borderTop: '4px solid #dc2626',
            }}
          >
            <div
              className="font-cjk leading-none select-none mb-3"
              style={{ fontSize: '6rem', color: '#1a1008' }}
            >
              学
            </div>

            <div className="font-mono text-sm text-muted-text tracking-[0.18em] mb-8">
              xué · to learn
            </div>

            <div className="flex items-end justify-center gap-4 mb-5">
              {heroComponents.map((item, i) =>
                'sep' in item ? (
                  <span key={i} className="text-muted-text text-xl pb-2">+</span>
                ) : (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div
                      className={`font-cjk leading-none ${
                        item.accent ? 'text-red-stamp' : 'text-ink-soft'
                      }`}
                      style={{ fontSize: '2.25rem' }}
                    >
                      {item.char}
                    </div>
                    <span
                      className={`font-mono text-[9px] tracking-wide ${
                        item.accent ? 'text-red-stamp' : 'text-muted-text'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                )
              )}
            </div>

            <p className="font-mono text-[10px] text-muted-text">
              子 appears in 42 HSK words
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────

function Features({ anim }: { anim: ReturnType<typeof useAnim> }) {
  return (
    <section className="dark:bg-[#1a1a1a]" style={{ background: '#FFFFFF' }}>
      <div className="max-w-6xl mx-auto px-6 py-32">

        <motion.div {...anim.inView(0)} className="mb-12 text-center">
          <p className="font-mono text-[10px] text-muted-text tracking-[0.18em] uppercase mb-3">
            How it works
          </p>
          <h2
            className="text-[1.875rem] sm:text-[2.5rem] font-black text-ink-black"
            style={{ letterSpacing: '-0.03em' }}
          >
            Built for the way characters work.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.num}
              {...anim.inView(i * 0.09)}
              className="rounded-[20px] p-8 border border-brush-gray dark:border-white/8"
              style={{
                background: 'var(--card-bg)',
                boxShadow: 'var(--shadow-card)',
                borderTop: '3px solid #dc2626',
              }}
            >
              <span className="font-mono text-xs text-muted-text mb-4 block">{f.num}</span>
              <h3 className="text-xl font-bold text-ink-black mb-3 leading-snug">
                {f.title}
              </h3>
              <p className="text-ink-soft text-sm leading-relaxed max-w-none">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Vocab preview ─────────────────────────────────────────────────────────────

function VocabPreview({ anim }: { anim: ReturnType<typeof useAnim> }) {
  return (
    <section className="bg-paper-warm dark:bg-[#0f0f0f]">
      <div className="max-w-6xl mx-auto px-6 py-32">

        <motion.div {...anim.inView(0)} className="mb-12">
          <p className="font-mono text-[10px] text-muted-text tracking-[0.18em] uppercase mb-3">
            A look inside
          </p>
          <h2
            className="text-[1.875rem] sm:text-[2.5rem] font-black text-ink-black mb-3"
            style={{ letterSpacing: '-0.03em' }}
          >
            Vocabulary cards, not flashcards.
          </h2>
          <p className="text-ink-soft text-sm leading-relaxed max-w-[44ch]">
            Each card shows the character, its components, and what they mean.
            You see why it looks the way it does.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {vocabCards.map((card, i) => (
            <motion.div
              key={card.char}
              {...anim.inView(0.07 + i * 0.09)}
              className="rounded-3xl p-6 relative"
              style={{
                background: 'var(--card-bg)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              }}
            >
              {/* HSK badge */}
              <span className="absolute top-5 right-5 font-mono text-[11px] font-bold tracking-wide bg-red-stamp text-white px-3 py-1 rounded-pill">
                HSK {card.hsk}
              </span>

              {/* Character */}
              <div
                className="font-cjk leading-none mb-3 select-none"
                style={{ fontSize: '6rem', color: '#1a1008' }}
              >
                {card.char}
              </div>

              {/* Pinyin */}
              <div className="font-mono text-sm text-muted-text tracking-wide mb-1">
                {card.pinyin}
              </div>

              {/* Meaning */}
              <div className="text-ink-soft text-base font-medium mb-5">{card.meaning}</div>

              {/* Component breakdown */}
              <div className="pt-4 border-t border-brush-gray flex gap-2 flex-wrap">
                {card.components.map((c) => (
                  <span
                    key={`${card.char}-${c.char}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                    style={{ background: '#FFF0E0', border: '1px solid #F5C4A0' }}
                  >
                    <span className="font-cjk text-base text-ink-soft leading-none">{c.char}</span>
                    <span className="font-mono text-[9px] text-muted-text tracking-wide">{c.label}</span>
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Culture teaser ────────────────────────────────────────────────────────────

function CultureTeaser({ anim }: { anim: ReturnType<typeof useAnim> }) {
  return (
    <section style={{ background: '#111111' }}>
      <div className="max-w-6xl mx-auto px-6 py-32">

        <motion.div {...anim.inView(0)} className="mb-12">
          <p className="font-mono text-[10px] text-white/40 tracking-[0.18em] uppercase mb-3">
            Culture & context
          </p>
          <h2
            className="text-[1.875rem] sm:text-[2.5rem] font-black text-white leading-snug max-w-[22ch]"
            style={{ letterSpacing: '-0.03em' }}
          >
            Words are more memorable when they come from somewhere real.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
          {cultureItems.map((item, i) => (
            <motion.div
              key={item.char}
              {...anim.inView(0.07 + i * 0.09)}
              className="rounded-2xl p-6 bg-white/6 border border-white/10"
            >
              <div
                className="font-cjk leading-none mb-3 select-none text-white"
                style={{ fontSize: '3.25rem' }}
              >
                {item.char}
              </div>
              <div className="font-mono text-[11px] text-white/50 tracking-wide mb-2">
                {item.pinyin}
              </div>
              <div className="font-mono text-[10px] font-bold text-red-stamp tracking-[0.14em] uppercase mb-3">
                {item.label}
              </div>
              <p className="text-sm text-white/60 leading-relaxed max-w-none">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...anim.inView(0.32)}>
          <Link
            href="/start"
            className="inline-flex h-11 items-center px-6 rounded-lg bg-red-stamp text-white text-sm font-bold hover:opacity-90"
            style={{ transition: 'opacity 180ms cubic-bezier(0.25,1,0.5,1)' }}
          >
            Start with HSK 1
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  const links = [
    { label: 'Sign in', href: '/sign-in' },
    { label: 'About', href: '/about' },
    { label: 'Privacy', href: '/privacy' },
  ]

  return (
    <footer style={{ background: '#111111' }}>
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="text-base font-extrabold tracking-tight text-white">MOINK</div>
          <div className="font-mono text-[10px] mt-1 tracking-wide text-white/40">
            Chinese for HSK 1–4. No fluff.
          </div>
        </div>
        <nav className="flex gap-6">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-white/60 hover:text-white"
              style={{ transition: 'color 150ms cubic-bezier(0.4,0,0.2,1)' }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const anim = useAnim()

  return (
    <div className="min-h-screen bg-paper-warm text-ink-black">
      <Nav />
      <main>
        <Hero anim={anim} />
        <Features anim={anim} />
        <VocabPreview anim={anim} />
        <CultureTeaser anim={anim} />
      </main>
      <Footer />
    </div>
  )
}
