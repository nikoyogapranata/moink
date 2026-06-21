'use client'

import React from 'react'

// Matches the main CJK Unified Ideographs block (covers all HSK 1-4 characters)
function isCJK(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  )
}

type PinyinTextProps = {
  text: string
  // Space-separated pinyin syllables, one per CJK character in order.
  // Non-CJK chars (punctuation, spaces) are skipped in the syllable index.
  // e.g.  text="我去上学。" pinyinString="wǒ qù shàng xué"
  pinyinString?: string
  showPinyin?: boolean
  className?: string
  style?: React.CSSProperties
  rtColor?: string
}

export function PinyinText({
  text,
  pinyinString,
  showPinyin = true,
  className,
  style,
  rtColor = '#dc2626',
}: PinyinTextProps) {
  // When pinyin is off or no data provided, render plain text
  if (!showPinyin || !pinyinString?.trim()) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    )
  }

  const chars = Array.from(text)
  const syllables = pinyinString.trim().split(/\s+/)
  let si = 0

  return (
    <span
      className={className}
      style={{
        lineHeight: 2.4,
        display: 'inline',
        ...style,
      }}
    >
      {chars.map((char, i) => {
        if (isCJK(char)) {
          const syllable = syllables[si++] ?? ''
          return (
            <ruby key={i} style={{ rubyAlign: 'center' }}>
              {char}
              <rt
                style={{
                  fontSize: '0.52em',
                  color: rtColor,
                  letterSpacing: '0.01em',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                  // Fallback for browsers that don't support <ruby> well
                  display: 'block',
                }}
              >
                {syllable}
              </rt>
            </ruby>
          )
        }
        // Punctuation and spaces render as-is
        return <React.Fragment key={i}>{char}</React.Fragment>
      })}
    </span>
  )
}
