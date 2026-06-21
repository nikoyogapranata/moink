'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { createClient } from '@supabase/supabase-js'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Search, Grid3x3, List, X, Heart, ChevronRight, ChevronDown, RotateCcw } from 'lucide-react'
import { getRadicalMeaning } from '@/lib/radical-map'
import { getCharComponents } from '@/lib/character-components'

// ── Types ──────────────────────────────────────────────────────────────────────

type VocabWord = {
  id: string
  simplified: string
  pinyin: string
  english: string[]
  hsk_level: number
  radical: string
  radical_meaning: string
  part_of_speech: string[]
  components: { char: string; meaning: string }[] | null
  frequency: number
}

type RadicalGroup = {
  radical: string
  meaning: string
  words: VocabWord[]
}

type ViewMode = 'family' | 'grid'
type SortMode = 'frequency' | 'alpha' | 'hsk' | 'newest'

// ── Supabase ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Constants ──────────────────────────────────────────────────────────────────

const POS_LABELS: Record<string, string> = {
  n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', num: 'numeral',
  mw: 'measure word', conj: 'conjunction', prep: 'preposition',
  pron: 'pronoun', part: 'particle', int: 'interjection',
}

const EASE = [0.25, 1, 0.5, 1] as const
const STROKE_RADICALS = new Set(['一', '丨', '丶', '丷', '丿', '乙', '乚', '亅', '亠', '冂', '凵'])

// ── HSK chip ───────────────────────────────────────────────────────────────────

function HskChip({ level }: { level: number }) {
  return (
    <span
      className="font-mono text-[9px] font-semibold px-1.5 py-[2px] rounded-full select-none"
      style={{ background: 'var(--color-paper-medium)', color: 'var(--color-muted-text)' }}
    >
      HSK {level}
    </span>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="w-44 flex-shrink-0 rounded-2xl p-4 animate-pulse"
      style={{ background: 'var(--color-card-hover)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="h-2 w-10 rounded-full mb-5" style={{ background: 'var(--color-border)' }} />
      <div className="h-12 w-10 rounded mb-2" style={{ background: 'var(--color-border)' }} />
      <div className="h-2 w-16 rounded-full mb-2" style={{ background: 'var(--color-border)' }} />
      <div className="h-2 w-24 rounded-full" style={{ background: 'var(--color-border)' }} />
    </div>
  )
}

function SkeletonGroup() {
  return (
    <div className="mb-12">
      <div className="flex items-center gap-4 mb-5">
        <div className="w-0.5 h-10 rounded-full animate-pulse" style={{ background: 'var(--color-border)' }} />
        <div className="space-y-1.5">
          <div className="h-3 w-20 rounded-full animate-pulse" style={{ background: 'var(--color-border)' }} />
          <div className="h-2 w-16 rounded-full animate-pulse" style={{ background: 'var(--color-border)' }} />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}

// ── Vocab card ─────────────────────────────────────────────────────────────────

function VocabCard({
  word,
  onSelect,
  isBookmarked,
  delay = 0,
}: {
  word: VocabWord
  onSelect: (word: VocabWord) => void
  isBookmarked: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: EASE }}
      whileHover={{
        y: -2,
        boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
        transition: { duration: 0.15, ease: EASE },
      }}
      onClick={() => onSelect(word)}
      className="relative w-44 flex-shrink-0 rounded-2xl p-4 cursor-pointer"
      style={{ background: 'var(--color-card)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="absolute top-3 right-3">
        <HskChip level={word.hsk_level} />
      </div>

      <p
        className="font-cjk text-ink-black leading-none mt-5 mb-2 select-none max-w-none"
        style={{ fontSize: '3rem' }}
      >
        {word.simplified}
      </p>

      <p className="font-mono text-xs text-muted-text mb-1 max-w-none">
        {word.pinyin}
      </p>

      <p className="text-sm text-ink-soft line-clamp-2 max-w-none">
        {word.english[0]}
      </p>

      {isBookmarked && (
        <div className="absolute bottom-3 right-3">
          <Heart size={9} fill="var(--color-red-stamp)" className="text-red-stamp" />
        </div>
      )}
    </motion.div>
  )
}

// ── Grid card ──────────────────────────────────────────────────────────────────

function GridCard({
  word,
  onSelect,
  isBookmarked,
  delay = 0,
}: {
  word: VocabWord
  onSelect: (word: VocabWord) => void
  isBookmarked: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: EASE }}
      whileHover={{
        y: -2,
        boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
        transition: { duration: 0.15, ease: EASE },
      }}
      onClick={() => onSelect(word)}
      className="relative rounded-2xl p-4 cursor-pointer w-full"
      style={{ background: 'var(--color-card)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="absolute top-3 right-3">
        <HskChip level={word.hsk_level} />
      </div>

      <p
        className="font-cjk text-ink-black leading-none mt-5 mb-2 select-none max-w-none"
        style={{ fontSize: '3rem' }}
      >
        {word.simplified}
      </p>

      <p className="font-mono text-xs text-muted-text mb-1 max-w-none">{word.pinyin}</p>
      <p className="text-sm text-ink-soft line-clamp-2 max-w-none">{word.english[0]}</p>

      {isBookmarked && (
        <div className="absolute bottom-3 right-3">
          <Heart size={9} fill="var(--color-red-stamp)" className="text-red-stamp" />
        </div>
      )}
    </motion.div>
  )
}

// ── Radical family section ─────────────────────────────────────────────────────

function RadicalGroupSection({
  group,
  index,
  onSelectWord,
  bookmarkedIds,
}: {
  group: RadicalGroup
  index: number
  onSelectWord: (word: VocabWord) => void
  bookmarkedIds: Set<string>
}) {
  const delay = Math.min(index * 0.05, 0.25)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
      className="mb-12"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex-shrink-0 self-stretch rounded-full"
          style={{ width: 2, background: 'var(--color-red-stamp)' }}
          aria-hidden="true"
        />
        <span
          className="font-cjk text-red-stamp leading-none select-none flex-shrink-0"
          style={{ fontSize: '3rem' }}
          aria-label={`Radical: ${group.radical}`}
        >
          {group.radical}
        </span>
        <div>
          <p className="text-sm font-bold text-ink-black max-w-none capitalize leading-tight">
            {group.meaning}
          </p>
          <p className="font-mono text-[11px] text-muted-text max-w-none">
            {group.words.length} word{group.words.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Horizontal scroll */}
      <div
        className="no-scrollbar overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div className="flex flex-row gap-4 pb-4" style={{ width: 'max-content' }}>
          {group.words.map((word, i) => (
            <VocabCard
              key={word.id}
              word={word}
              onSelect={onSelectWord}
              isBookmarked={bookmarkedIds.has(word.id)}
              delay={Math.min(i * 0.03, 0.18)}
            />
          ))}
        </div>
      </div>
    </motion.section>
  )
}

// ── Hanzi Writer ───────────────────────────────────────────────────────────────

function HanziWriterDisplay({ character, size = 160, replayTrigger = 0 }: { character: string; size?: number; replayTrigger?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    el.innerHTML = ''
    let cancelled = false

    import('hanzi-writer').then(mod => {
      if (cancelled || !el) return
      const HanziWriter = mod.default
      const writer = HanziWriter.create(el, character, {
        width: size, height: size, padding: 10,
        showOutline: true,
        strokeColor: '#111111',
        outlineColor: '#d4c5b5',
        strokeAnimationSpeed: 1.2,
        delayBetweenStrokes: 80,
      })
      writer.animateCharacter()
    }).catch(() => {
      if (!el) return
      el.innerHTML = `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-family:Noto Serif SC,serif;font-size:6rem;color:#111">${character}</div>`
    })

    return () => { cancelled = true }
  }, [character, size, replayTrigger])

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      aria-label={`Stroke order for ${character}`}
    />
  )
}

// ── Word detail modal ──────────────────────────────────────────────────────────

function WordDetailModal({
  word,
  isBookmarked,
  onClose,
  onBookmarkToggle,
  onFilterByRadical,
}: {
  word: VocabWord
  isBookmarked: boolean
  onClose: () => void
  onBookmarkToggle: (wordId: string) => void
  onFilterByRadical: (radical: string) => void
}) {
  const prefersReduced = useReducedMotion()
  const [bookmarked, setBookmarked] = useState(isBookmarked)
  const [replayTrigger, setReplayTrigger] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleBookmark = () => {
    setBookmarked(b => !b)
    onBookmarkToggle(word.id)
  }

  const displayChar = word.simplified[0]

  const components: { char: string; meaning: string }[] =
    (word.components && word.components.length > 0)
      ? word.components
      : getCharComponents(displayChar)
        ?? (word.radical
          ? [{ char: word.radical, meaning: getRadicalMeaning(word.radical) || 'radical' }]
          : [])

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={prefersReduced ? {} : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={prefersReduced ? {} : { opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
        style={{
          background: 'var(--color-card)',
          borderRadius: '1.5rem',
          width: '100%',
          maxWidth: '52rem',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Details: ${word.simplified}`}
      >
        {/* ── Header bar ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-brush-gray)',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ color: 'var(--color-muted-text)', transition: 'background 150ms, color 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-paper-medium)'; e.currentTarget.style.color = 'var(--color-ink-black)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-muted-text)' }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
          <button
            onClick={handleBookmark}
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ transition: 'background 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-paper-medium)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <Heart
              size={16}
              fill={bookmarked ? 'var(--color-red-stamp)' : 'none'}
              style={{ color: bookmarked ? 'var(--color-red-stamp)' : 'var(--color-muted-text)', transition: 'color 150ms, fill 150ms' }}
            />
          </button>
        </div>

        {/* ── Body: left content + right panel ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Left: character, POS, meanings — scrollable */}
          <div
            className="no-scrollbar"
            style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}
          >
            {/* Character hero */}
            <div style={{ marginBottom: '1.25rem' }}>
              <p className="font-cjk text-ink-black leading-none select-none max-w-none" style={{ fontSize: '5.5rem' }}>
                {word.simplified}
              </p>
              <p className="font-mono text-muted-text mt-2 max-w-none" style={{ fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                {word.pinyin}
              </p>
            </div>

            {/* POS chip */}
            {word.part_of_speech?.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <span
                  className="font-mono text-[11px] font-medium px-3 py-1 rounded-full"
                  style={{ background: 'var(--color-paper-medium)', color: 'var(--color-ink-soft)', border: '1px solid var(--color-brush-gray)' }}
                >
                  {POS_LABELS[word.part_of_speech[0]] ?? word.part_of_speech[0]}
                </span>
              </div>
            )}

            {/* Meanings */}
            <section>
              <p className="font-mono text-[10px] text-muted-text tracking-[0.08em] uppercase max-w-none" style={{ marginBottom: '0.75rem' }}>
                Meanings
              </p>
              <ul className="space-y-1.5">
                {word.english.map((meaning, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="font-mono text-[10px] text-muted-text mt-0.5 flex-shrink-0 tabular-nums">{i + 1}.</span>
                    <span className="text-sm font-medium text-ink-black max-w-none">{meaning}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Right: components, family, stroke order — scrolls only if needed */}
          <div
            className="no-scrollbar"
            style={{
              width: '340px',
              flexShrink: 0,
              borderLeft: '1px solid var(--color-brush-gray)',
              background: 'var(--color-paper-medium)',
              borderRadius: '0 1.5rem 1.5rem 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              padding: '1.75rem',
              overflowY: 'auto',
            }}
          >
            {/* Components */}
            {components.length > 0 && (
              <section>
                <p className="font-mono text-[10px] text-muted-text tracking-[0.08em] uppercase max-w-none" style={{ marginBottom: '0.75rem' }}>
                  Components
                </p>
                <div className="flex flex-wrap gap-2">
                  {components.map((comp, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: 'var(--color-card)', border: '1px solid var(--color-brush-gray)' }}
                    >
                      <span className="font-cjk text-ink-black leading-none" style={{ fontSize: '1.6rem' }}>{comp.char}</span>
                      <span className="font-mono text-[11px] text-muted-text">{comp.meaning}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Radical family link */}
            {word.radical && (
              <section>
                <p className="font-mono text-[10px] text-muted-text tracking-[0.08em] uppercase max-w-none" style={{ marginBottom: '0.75rem' }}>
                  Radical family
                </p>
                <button
                  onClick={() => { onFilterByRadical(word.radical); onClose() }}
                  className="group flex items-center gap-3 py-3 px-4 w-full rounded-xl text-left"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-brush-gray)', transition: 'border-color 150ms' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-ink-black)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-brush-gray)')}
                >
                  <span className="font-cjk text-red-stamp leading-none flex-shrink-0" style={{ fontSize: '2rem' }}>{word.radical}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-ink-black max-w-none">{word.radical} family</span>
                    <span className="font-mono text-[11px] text-muted-text max-w-none">Browse all words →</span>
                  </span>
                  <ChevronRight
                    size={14}
                    className="text-muted-text flex-shrink-0 group-hover:translate-x-0.5"
                    style={{ transition: 'transform 150ms' }}
                  />
                </button>
              </section>
            )}

            {/* Stroke order */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p className="font-mono text-[10px] text-muted-text tracking-[0.08em] uppercase max-w-none">
                Stroke order
              </p>
              <div style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-brush-gray)',
                borderRadius: '0.75rem',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <HanziWriterDisplay character={displayChar} size={240} replayTrigger={replayTrigger} />
              </div>
              <button
                onClick={() => setReplayTrigger(t => t + 1)}
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg font-mono text-[11px]"
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-brush-gray)',
                  color: 'var(--color-ink-soft)',
                  cursor: 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-ink-black)'; e.currentTarget.style.color = 'var(--color-ink-black)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-brush-gray)'; e.currentTarget.style.color = 'var(--color-ink-soft)' }}
              >
                <RotateCcw size={12} />
                Replay
              </button>
              {word.simplified.length > 1 && (
                <p className="font-mono text-[10px] text-muted-text text-center max-w-none">
                  First character only
                </p>
              )}
            </section>
          </div>

        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptySearch({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <span className="font-cjk select-none" style={{ fontSize: '4rem', opacity: 0.18, color: 'var(--color-ink-black)' }} aria-hidden="true">
        找不到
      </span>
      <p className="text-sm font-bold text-ink-black max-w-none">No words found</p>
      <p className="font-mono text-xs text-muted-text max-w-none">
        zhǎo bù dào{query ? ` · "${query}"` : ''}
      </p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VocabularyPage() {
  const prefersReduced = useReducedMotion()

  const [hskLevel, setHskLevel] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('family')
  const [sortMode, setSortMode] = useState<SortMode>('frequency')
  const [words, setWords] = useState<VocabWord[]>([])
  const [lastFetchedHsk, setLastFetchedHsk] = useState<number | null>(null)
  const [selectedWord, setSelectedWord] = useState<VocabWord | null>(null)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null)
  const [radicalFilter, setRadicalFilter] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const loading = lastFetchedHsk !== hskLevel

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => { setFirebaseUid(user?.uid ?? null) })
    return unsub
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vocabulary')
      .select('*')
      .eq('hsk_level', hskLevel)
      .order('frequency', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          setWords((data as VocabWord[]) ?? [])
          setLastFetchedHsk(hskLevel)
        }
      })
    return () => { cancelled = true }
  }, [hskLevel])

  useEffect(() => {
    if (!firebaseUid) return
    supabase
      .from('bookmarks')
      .select('word_id')
      .eq('firebase_uid', firebaseUid)
      .then(({ data }) => {
        if (data) setBookmarkedIds(new Set(data.map(b => b.word_id as string)))
      })
  }, [firebaseUid])

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return words.filter(w => {
      const matchesSearch = !q || (
        w.simplified.includes(searchQuery.trim()) ||
        w.pinyin.toLowerCase().includes(q) ||
        w.english.some(m => m.toLowerCase().includes(q))
      )
      const matchesRadical = !radicalFilter || w.radical === radicalFilter
      return matchesSearch && matchesRadical
    })
  }, [words, searchQuery, radicalFilter])

  const sortedWords = useMemo(() => {
    const arr = [...filteredWords]
    switch (sortMode) {
      case 'frequency': return arr.sort((a, b) => (a.frequency ?? Infinity) - (b.frequency ?? Infinity))
      case 'alpha':     return arr.sort((a, b) => a.simplified.localeCompare(b.simplified, 'zh'))
      case 'hsk':       return arr.sort((a, b) => a.hsk_level - b.hsk_level)
      case 'newest':    return arr.sort((a, b) => Number(b.id) - Number(a.id))
    }
  }, [filteredWords, sortMode])

  const radicalGroups = useMemo<RadicalGroup[]>(() => {
    const map = new Map<string, RadicalGroup>()
    for (const word of sortedWords) {
      const key = word.radical || '其'
      if (!map.has(key)) {
        map.set(key, {
          radical: word.radical || '其',
          meaning: word.radical_meaning || getRadicalMeaning(word.radical) || 'other',
          words: [],
        })
      }
      map.get(key)!.words.push(word)
    }
    return Array.from(map.values())
      .filter(g => g.words.length >= 2 && !STROKE_RADICALS.has(g.radical))
      .sort((a, b) => b.words.length - a.words.length)
  }, [sortedWords])

  const handleBookmarkToggle = useCallback(async (wordId: string) => {
    if (!firebaseUid) return
    setBookmarkedIds(prev => {
      const next = new Set(prev)
      if (next.has(wordId)) {
        next.delete(wordId)
        supabase.from('bookmarks').delete().match({ firebase_uid: firebaseUid, word_id: wordId }).then(() => {})
      } else {
        next.add(wordId)
        supabase.from('bookmarks').insert({ firebase_uid: firebaseUid, word_id: wordId }).then(() => {})
      }
      return next
    })
  }, [firebaseUid])

  const handleFilterByRadical = useCallback((radical: string) => {
    setRadicalFilter(radical)
    setViewMode('family')
  }, [])

  const handleHskChange = (level: number) => {
    setHskLevel(level)
    setRadicalFilter(null)
    setSearchQuery('')
    setSearchOpen(false)
  }

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    if (q) setRadicalFilter(null)
  }

  const openSearch = () => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 30)
  }

  const blurSearch = () => {
    if (!searchQuery) setSearchOpen(false)
  }

  const fadeIn = prefersReduced
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: EASE } }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-20">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <motion.div {...fadeIn} className="mb-8">

        {/* Row 1: Title + View toggle */}
        <div className="flex items-center justify-between mb-4">
          <h1
            className="font-black text-ink-black"
            style={{ fontSize: '1.875rem', letterSpacing: '-0.04em', lineHeight: 1.1 }}
          >
            Vocabulary
          </h1>

          {/* View toggle */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg"
            style={{ background: 'var(--color-paper-medium)' }}
            role="group"
            aria-label="View mode"
          >
            {([
              { mode: 'family' as ViewMode, Icon: List, label: 'Family' },
              { mode: 'grid' as ViewMode, Icon: Grid3x3, label: 'Grid' },
            ]).map(({ mode, Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-label={label + ' view'}
                aria-pressed={viewMode === mode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold"
                style={{
                  background: viewMode === mode ? 'var(--color-card)' : 'transparent',
                  color: viewMode === mode ? 'var(--color-ink-black)' : 'var(--color-muted-text)',
                  boxShadow: viewMode === mode ? '0 1px 4px rgba(0,0,0,0.09)' : 'none',
                  transition: 'background 150ms, color 150ms, box-shadow 150ms',
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: HSK chips | search | sort — 3-column layout */}
        <div className="flex items-center gap-3">

          {/* Left: HSK chips + active radical badge */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {[1, 2, 3, 4].map(level => (
              <button
                key={level}
                onClick={() => handleHskChange(level)}
                className="font-mono text-[11px] font-semibold px-3 py-1.5 rounded-full cursor-pointer"
                style={{
                  background: hskLevel === level ? 'var(--color-red-stamp)' : 'var(--color-paper-medium)',
                  color: hskLevel === level ? '#fff' : 'var(--color-ink-soft)',
                  boxShadow: hskLevel === level ? '0 2px 8px rgba(220,38,38,0.25)' : 'none',
                  transition: 'background 150ms, color 150ms, box-shadow 150ms',
                }}
              >
                {level}
              </button>
            ))}

            <AnimatePresence>
              {radicalFilter && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setRadicalFilter(null)}
                  className="flex items-center gap-1.5 font-mono text-[11px] font-medium px-2.5 py-1.5 rounded-full"
                  style={{
                    background: 'var(--color-paper-highlight)',
                    color: 'var(--color-ink-soft)',
                    border: '1px solid var(--color-brush-gray)',
                  }}
                >
                  <span className="font-cjk text-red-stamp" style={{ fontSize: '0.9rem', lineHeight: 1 }}>
                    {radicalFilter}
                  </span>
                  <X size={9} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Middle: Expandable search */}
          <div className="flex-1 flex justify-center">
            <motion.div
              animate={{ width: searchOpen || searchQuery ? 220 : 36 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="relative flex items-center rounded-full overflow-hidden"
              style={{ height: 36, background: 'var(--color-paper-medium)' }}
            >
              <button
                onClick={openSearch}
                className="absolute left-0 top-0 flex items-center justify-center flex-shrink-0 z-10"
                style={{ width: 36, height: 36, color: 'var(--color-muted-text)' }}
                aria-label="Search"
                tabIndex={searchOpen ? -1 : 0}
              >
                <Search size={14} />
              </button>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={blurSearch}
                placeholder="Search…"
                className="font-sans text-sm text-ink-black placeholder:text-muted-text"
                style={{
                  position: 'absolute',
                  left: 36,
                  right: 10,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  opacity: searchOpen || searchQuery ? 1 : 0,
                  transition: 'opacity 150ms',
                }}
                aria-label="Search vocabulary"
              />
            </motion.div>
          </div>

          {/* Right: Sort */}
          <div className="relative flex items-center flex-shrink-0">
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="font-mono text-[11px] cursor-pointer pr-4"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
                color: 'var(--color-ink-soft)',
              } as React.CSSProperties}
              aria-label="Sort order"
            >
              <option value="frequency">Frequency</option>
              <option value="alpha">A–Z</option>
              <option value="hsk">HSK Level</option>
              <option value="newest">Newest</option>
            </select>
            <ChevronDown
              size={11}
              className="absolute right-0 pointer-events-none"
              style={{ color: 'var(--color-muted-text)' }}
            />
          </div>

        </div>
      </motion.div>

      {/* ── Word count meta ──────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {!loading && (
          <motion.p
            key={`${hskLevel}-${searchQuery}-${radicalFilter}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="font-mono text-[11px] text-muted-text mb-8 max-w-none"
          >
            {sortedWords.length} word{sortedWords.length !== 1 ? 's' : ''}
            {' · '}HSK {hskLevel}
            {radicalFilter ? ` · ${radicalFilter} family` : ''}
            {searchQuery ? ` · "${searchQuery}"` : ''}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonGroup key={i} />)}
        </div>
      ) : sortedWords.length === 0 ? (
        <EmptySearch query={searchQuery} />
      ) : viewMode === 'family' ? (
        <div>
          {radicalGroups.map((group, i) => (
            <RadicalGroupSection
              key={group.radical}
              group={group}
              index={i}
              onSelectWord={setSelectedWord}
              bookmarkedIds={bookmarkedIds}
            />
          ))}
        </div>
      ) : (
        <motion.div
          key="grid"
          initial={prefersReduced ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          style={{ columns: '176px', gap: '16px' }}
        >
          {sortedWords.map((word, i) => (
            <div key={word.id} style={{ breakInside: 'avoid', marginBottom: '16px' }}>
              <GridCard
                word={word}
                onSelect={setSelectedWord}
                isBookmarked={bookmarkedIds.has(word.id)}
                delay={Math.min(i * 0.012, 0.12)}
              />
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedWord && (
          <WordDetailModal
            key={selectedWord.id}
            word={selectedWord}
            isBookmarked={bookmarkedIds.has(selectedWord.id)}
            onClose={() => setSelectedWord(null)}
            onBookmarkToggle={handleBookmarkToggle}
            onFilterByRadical={handleFilterByRadical}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
