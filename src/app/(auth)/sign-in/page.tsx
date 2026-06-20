'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  getAdditionalUserInfo,
} from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { auth } from '@/lib/firebase'
import { upsertUser, generateUsername, findAvailableUsername } from '@/lib/auth-helpers'

// ── Helpers ───────────────────────────────────────────────────────────────────

function firebaseMessage(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

// ── Primitives ────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

type FieldProps = { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>

function Field({ label, error, ...props }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink-black mb-1.5">{label}</label>
      <input
        {...props}
        className={[
          'w-full px-4 py-3 rounded-lg bg-paper-warm border text-ink-black text-sm',
          'placeholder:text-muted-text focus:outline-none focus:ring-0',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          error ? 'border-red-stamp' : 'border-brush-gray focus:border-ink-black',
        ].join(' ')}
        style={{ transition: 'border-color 150ms cubic-bezier(0.4,0,0.2,1)' }}
      />
      {error && <p className="mt-1.5 text-xs text-red-stamp font-mono max-w-none">{error}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FieldErrors = { email?: string; password?: string }

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const info = getAdditionalUserInfo(result)
      if (info?.isNewUser) {
        const base = generateUsername(result.user.displayName ?? 'user')
        const username = await findAvailableUsername(base)
        await upsertUser(result.user, { full_name: result.user.displayName ?? '', username })
      } else {
        await upsertUser(result.user)
      }
      router.push('/dashboard')
    } catch (err) {
      const code = (err as FirebaseError).code ?? ''
      if (code !== 'auth/popup-closed-by-user') setError(firebaseMessage(code))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const errors: FieldErrors = {}
    if (!email) errors.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email address.'
    if (!password) errors.password = 'Password is required.'
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }

    setFieldErrors({})
    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      await upsertUser(credential.user)
      router.push('/dashboard')
    } catch (err) {
      setError(firebaseMessage((err as FirebaseError).code ?? ''))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="w-full max-w-[400px] rounded-2xl p-8 sm:p-10 my-auto"
      style={{ background: '#FFFFFF', boxShadow: 'var(--shadow-flashcard)' }}
    >
      <Link
        href="/"
        className="text-2xl font-extrabold tracking-tight text-red-stamp mb-8 block select-none hover:opacity-75"
        style={{ transition: 'opacity 150ms' }}
      >
        MOINK
      </Link>

      <h1
        className="font-black text-ink-black mb-1"
        style={{ fontSize: '1.5rem', lineHeight: 1.15, letterSpacing: '-0.03em' }}
      >
        Welcome back.
      </h1>
      <p className="text-sm text-muted-text mb-8 max-w-none">
        Sign in to continue your study session.
      </p>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 h-11 px-4 rounded-lg border border-brush-gray bg-white text-sm font-semibold text-ink-black hover:bg-paper-warm disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)' }}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-brush-gray" />
        <span className="font-mono text-[11px] text-muted-text tracking-[0.12em] uppercase">or</span>
        <div className="flex-1 h-px bg-brush-gray" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })) }}
          error={fieldErrors.email}
          placeholder="you@example.com"
          disabled={loading}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })) }}
          error={fieldErrors.password}
          placeholder="••••••••"
          disabled={loading}
        />

        {error && (
          <div className="rounded-lg border border-red-stamp/20 bg-red-stamp/5 px-4 py-3">
            <p className="text-sm text-red-stamp max-w-none">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg bg-ink-black text-paper-warm text-sm font-bold hover:bg-red-stamp disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          style={{ transition: 'background 180ms cubic-bezier(0.25,1,0.5,1)' }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-text max-w-none">
        New to Moink?{' '}
        <Link
          href="/sign-up"
          className="font-semibold text-ink-black underline underline-offset-2 hover:text-red-stamp"
          style={{ transition: 'color 150ms' }}
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}
