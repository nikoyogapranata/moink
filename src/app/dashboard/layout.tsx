'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Brain, Globe, TrendingUp, User, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { LucideIcon } from 'lucide-react'

const mainNav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Vocabulary', icon: BookOpen },
  { href: '/dashboard/quizzes', label: 'Quizzes', icon: Brain },
  { href: '/dashboard/culture', label: 'Culture', icon: Globe },
]

const secondaryNav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard/progress', label: 'Progress', icon: TrendingUp },
  { href: '/dashboard/profile', label: 'Profile', icon: User },
]

const allNav = [...mainNav, ...secondaryNav]

function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
}) {
  return (
    <Link
      href={href}
      className="relative flex items-center gap-3 overflow-hidden"
      style={{
        margin: '1px 8px',
        padding: '12px 16px',
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 500,
        color: active ? '#ffffff' : 'rgba(255,255,255,0.45)',
        background: active ? 'rgba(220,38,38,0.08)' : 'transparent',
        transition: 'color 150ms, background-color 150ms',
        textDecoration: 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'
          ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'
          ;(e.currentTarget as HTMLElement).style.background = 'transparent'
        }
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            background: '#dc2626',
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}
      <Icon size={20} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
      {label}
    </Link>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div style={{ height: 36 }} />
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors w-full text-sm"
    >
      {isDark ? (
        <Sun size={16} strokeWidth={1.75} />
      ) : (
        <Moon size={16} strokeWidth={1.75} />
      )}
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <div className="h-screen flex overflow-hidden">

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0 overflow-y-auto"
        style={{ width: 220, background: '#111111' }}
      >
        {/* Wordmark */}
        <div style={{ padding: '28px 16px 20px' }}>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 select-none"
            style={{ transition: 'opacity 150ms' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.7')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>🐼</span>
            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>
              MOINK
            </span>
          </Link>
        </div>

        {/* Main nav */}
        <nav className="space-y-0" aria-label="Main">
          {mainNav.map(item => (
            <SidebarItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>

        {/* Divider */}
        <div aria-hidden="true" style={{ margin: '12px 16px', height: 1, background: 'rgba(255,255,255,0.08)' }} />

        {/* Secondary nav */}
        <nav className="space-y-0" aria-label="Secondary">
          {secondaryNav.map(item => (
            <SidebarItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Divider above user */}
        <div aria-hidden="true" style={{ margin: '0 16px 0', height: 1, background: 'rgba(255,255,255,0.08)' }} />

        {/* User section */}
        <div
          style={{
            margin: '0 8px 12px',
            padding: '12px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0 rounded-full select-none"
              style={{ width: 36, height: 36, background: '#dc2626' }}
            >
              <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 700 }}>N</span>
            </div>
            <div className="min-w-0">
              <p className="truncate" style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                Niko
              </p>
              <p className="truncate font-mono" style={{ color: '#dc2626', fontSize: 13 }}>
                HSK 2
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Content + mobile tab bar ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <main
          className="flex-1 overflow-y-auto w-full"
          style={{ background: 'var(--color-bg)' }}
        >
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          className="md:hidden flex-shrink-0 flex"
          style={{ background: '#111111', borderTop: '1px solid rgba(255,255,255,0.07)' }}
          aria-label="Main"
        >
          {allNav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] py-3"
                style={{ color: active ? '#ffffff' : 'rgba(255,255,255,0.38)' }}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
                <span className="font-mono" style={{ fontSize: 10, fontWeight: 500 }}>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

    </div>
  )
}
