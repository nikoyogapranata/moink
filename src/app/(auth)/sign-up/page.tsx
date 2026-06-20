'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
  getAdditionalUserInfo,
} from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { auth } from '@/lib/firebase'
import {
  upsertUser,
  generateUsername,
  findAvailableUsername,
  checkUsernameAvailable,
} from '@/lib/auth-helpers'

// ── Helpers ───────────────────────────────────────────────────────────────────

function firebaseMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
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

// ── Username field with live availability check ───────────────────────────────

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken'

function UsernameField({
  value,
  status,
  error,
  onChange,
  disabled,
}: {
  value: string
  status: UsernameStatus
  error?: string
  onChange: (val: string) => void
  disabled: boolean
}) {
  const borderClass =
    error || status === 'taken'
      ? 'border-red-stamp'
      : status === 'available'
      ? 'border-green-500'
      : 'border-brush-gray focus:border-ink-black'

  return (
    <div>
      <label className="block text-sm font-semibold text-ink-black mb-1.5">Username</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
          disabled={disabled}
          autoComplete="username"
          placeholder="yourhandle"
          className={[
            'w-full pl-4 pr-9 py-3 rounded-lg bg-paper-warm border text-ink-black text-sm',
            'placeholder:text-muted-text focus:outline-none focus:ring-0',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            borderClass,
          ].join(' ')}
          style={{ transition: 'border-color 150ms cubic-bezier(0.4,0,0.2,1)' }}
        />

        {/* Status icon */}
        {status === 'checking' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-text pointer-events-none">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" aria-label="Checking availability">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32 64" />
            </svg>
          </span>
        )}
        {status === 'available' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 pointer-events-none" aria-label="Available">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
        {status === 'taken' && !error && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-stamp pointer-events-none" aria-label="Taken">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-1.5 text-xs text-red-stamp font-mono max-w-none">{error}</p>
      ) : status === 'taken' ? (
        <p className="mt-1.5 text-xs text-red-stamp font-mono max-w-none">Username is already taken.</p>
      ) : status === 'available' ? (
        <p className="mt-1.5 text-xs text-green-600 font-mono max-w-none">Username is available.</p>
      ) : null}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FieldErrors = {
  fullName?: string
  username?: string
  email?: string
  password?: string
}

export default function SignUpPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // Debounced username availability check
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    const timer = setTimeout(async () => {
      const available = await checkUsernameAvailable(username)
      setUsernameStatus(available ? 'available' : 'taken')
    }, 500)
    return () => clearTimeout(timer)
  }, [username])

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const info = getAdditionalUserInfo(result)
      if (info?.isNewUser) {
        const base = generateUsername(result.user.displayName ?? 'user')
        const uname = await findAvailableUsername(base)
        await upsertUser(result.user, { full_name: result.user.displayName ?? '', username: uname })
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
    if (!fullName.trim()) errors.fullName = 'Full name is required.'
    if (!username) {
      errors.username = 'Username is required.'
    } else if (username.length < 3) {
      errors.username = 'Must be at least 3 characters.'
    } else if (usernameStatus === 'taken') {
      errors.username = 'Username is already taken.'
    } else if (usernameStatus === 'checking') {
      errors.username = 'Please wait for availability check.'
    }
    if (!email) errors.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email address.'
    if (!password) errors.password = 'Password is required.'
    else if (password.length < 6) errors.password = 'Must be at least 6 characters.'

    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }
    setFieldErrors({})
    setLoading(true)

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(credential.user, { displayName: fullName.trim() })
      await upsertUser(credential.user, { full_name: fullName.trim(), username })
      router.push('/dashboard')
    } catch (err) {
      setError(firebaseMessage((err as FirebaseError).code ?? ''))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="w-full max-w-[400px] rounded-2xl p-8 sm:p-10 my-6"
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
        Start learning.
      </h1>
      <p className="text-sm text-muted-text mb-8 max-w-none">
        Create your free account to get started.
      </p>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 h-11 px-4 rounded-lg border border-brush-gray bg-white text-sm font-semibold text-ink-black hover:bg-paper-warm disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ transition: 'background 150ms cubic-bezier(0.4,0,0.2,1)' }}
      >
        <GoogleIcon />
        Sign up with Google
      </button>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-brush-gray" />
        <span className="font-mono text-[11px] text-muted-text tracking-[0.12em] uppercase">or</span>
        <div className="flex-1 h-px bg-brush-gray" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Full name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={e => { setFullName(e.target.value); setFieldErrors(p => ({ ...p, fullName: undefined })) }}
          error={fieldErrors.fullName}
          placeholder="Your name"
          disabled={loading}
        />

        <UsernameField
          value={username}
          status={usernameStatus}
          error={fieldErrors.username}
          onChange={val => { setUsername(val); setFieldErrors(p => ({ ...p, username: undefined })) }}
          disabled={loading}
        />

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
          autoComplete="new-password"
          value={password}
          onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })) }}
          error={fieldErrors.password}
          placeholder="At least 6 characters"
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
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-text max-w-none">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="font-semibold text-ink-black underline underline-offset-2 hover:text-red-stamp"
          style={{ transition: 'color 150ms' }}
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
