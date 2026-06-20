'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Brain, Globe, TrendingUp, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const nav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Vocabulary', icon: BookOpen },
  { href: '/dashboard/quizzes', label: 'Quizzes', icon: Brain },
  { href: '/dashboard/culture', label: 'Culture', icon: Globe },
  { href: '/dashboard/progress', label: 'Progress', icon: TrendingUp },
  { href: '/dashboard/profile', label: 'Profile', icon: User },
]

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
      className={[
        'relative flex items-center gap-3 mx-2 pl-5 pr-4 py-[9px] rounded-lg text-sm font-medium overflow-hidden',
        active
          ? 'text-white bg-white/[0.07]'
          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]',
      ].join(' ')}
      style={{ transition: 'color 150ms, background-color 150ms' }}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-red-stamp rounded-r-full"
          aria-hidden="true"
        />
      )}
      <Icon size={17} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
      {label}
    </Link>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <div className="h-screen flex overflow-hidden">

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col w-[240px] flex-shrink-0 overflow-y-auto"
        style={{ background: '#111111' }}
      >
        {/* Logo */}
        <div className="px-5 pt-7 pb-6 flex-shrink-0">
          <Link
            href="/"
            className="text-xl font-extrabold tracking-tight text-white select-none hover:opacity-70"
            style={{ transition: 'opacity 150ms' }}
          >
            MOINK
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5" aria-label="Main">
          {nav.map(item => (
            <SidebarItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>

        {/* User */}
        <div
          className="px-4 py-4 flex-shrink-0 mx-2 mb-2 rounded-lg hover:bg-white/[0.04] cursor-pointer"
          style={{ transition: 'background-color 150ms' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-stamp flex items-center justify-center flex-shrink-0 select-none">
              <span className="text-white text-xs font-bold">N</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold leading-tight truncate">Niko</p>
              <p className="font-mono text-white/40 text-xs truncate">HSK 2</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Content + mobile tab bar ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: 'var(--color-paper-warm)' }}
        >
          {children}
        </main>

        {/* ── Mobile bottom tab bar ── */}
        <nav
          className="md:hidden flex-shrink-0 flex"
          style={{ background: '#111111', borderTop: '1px solid rgba(255,255,255,0.07)' }}
          aria-label="Main"
        >
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex-1 flex flex-col items-center justify-center gap-[3px] py-3',
                  active ? 'text-white' : 'text-white/38',
                ].join(' ')}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
                <span className="font-mono text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

    </div>
  )
}
