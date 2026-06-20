import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex">

      {/* ── Left brand panel — desktop only ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-shrink-0 flex-col relative overflow-hidden"
        style={{ background: '#111111' }}
        aria-hidden="true"
      >
        <div className="absolute top-8 left-8 z-10">
          <Link
            href="/"
            className="text-xl font-extrabold tracking-tight text-white select-none hover:opacity-75"
            style={{ transition: 'opacity 150ms' }}
          >
            MOINK
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <span
            className="font-cjk leading-none select-none"
            style={{ fontSize: 'clamp(10rem, 16vw, 18rem)', color: 'rgba(255,255,255,0.55)' }}
          >
            学
          </span>
        </div>

        <div className="absolute bottom-8 left-8">
          <p
            className="font-mono text-xs tracking-[0.14em] uppercase max-w-none"
            style={{ color: 'rgba(255,255,255,0.30)' }}
          >
            Learn the characters that stick.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 bg-paper-warm flex items-center justify-center p-6 lg:p-12 overflow-y-auto min-h-0">
        {children}
      </div>

    </div>
  )
}
