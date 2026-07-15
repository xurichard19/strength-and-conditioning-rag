import { type BaseSyntheticEvent, useState } from 'react'
import { ArrowLeft, KeyRound, LogIn, Send, UserPlus } from 'lucide-react'

import { Button, Panel } from './ui'

type AuthFormProps = {
  error: string
  isLoading: boolean
  message: string
  onClearFeedback: () => void
  onGoogleSignIn: () => Promise<void>
  onPasswordReset: (email: string) => Promise<void>
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
}

type AuthMode = 'sign-in' | 'sign-up' | 'reset-password'

export function AuthForm({
  error,
  isLoading,
  message,
  onClearFeedback,
  onGoogleSignIn,
  onPasswordReset,
  onSignIn,
  onSignUp,
}: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [password, setPassword] = useState('')
  const isSignIn = mode === 'sign-in'
  const isPasswordReset = mode === 'reset-password'

  const selectMode = (nextMode: AuthMode) => {
    if (mode === nextMode || isLoading) return
    setMode(nextMode)
    setPassword('')
    onClearFeedback()
  }

  const handleSubmit = async (event: BaseSyntheticEvent<SubmitEvent, HTMLFormElement>) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || isLoading) return

    if (isPasswordReset) await onPasswordReset(trimmedEmail)
    else if (password && isSignIn) await onSignIn(trimmedEmail, password)
    else if (password) await onSignUp(trimmedEmail, password)
  }

  const submitLabel = isPasswordReset ? 'Send reset link' : isSignIn ? 'Sign in' : 'Create account'
  const SubmitIcon = isPasswordReset ? Send : isSignIn ? LogIn : UserPlus

  return (
    <Panel raised className="p-5 sm:p-6">
      <div className="mb-6">
        <p className="page-eyebrow">Account access</p>
        <h2 className="text-2xl font-semibold text-[var(--text-h)]">
          {isPasswordReset ? 'Reset your password' : isSignIn ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="mt-2 text-sm leading-6">
          {isPasswordReset
            ? 'Enter your email and we will send recovery instructions.'
            : isSignIn
              ? 'Continue where you left off.'
              : 'Build a training profile in a few quick steps.'}
        </p>
      </div>

      {!isPasswordReset && (
        <div className="mb-6 grid grid-cols-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
          <button
            type="button"
            onClick={() => selectMode('sign-in')}
            disabled={isLoading}
            aria-pressed={isSignIn}
            className={`rounded px-3 py-2 text-sm font-semibold transition ${
              isSignIn ? 'bg-[var(--surface-raised)] text-[var(--text-h)] shadow-sm' : 'text-[var(--text)] hover:text-[var(--text-h)]'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => selectMode('sign-up')}
            disabled={isLoading}
            aria-pressed={!isSignIn}
            className={`rounded px-3 py-2 text-sm font-semibold transition ${
              !isSignIn ? 'bg-[var(--surface-raised)] text-[var(--text-h)] shadow-sm' : 'text-[var(--text)] hover:text-[var(--text-h)]'
            }`}
          >
            Create account
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <label>
          <span className="field-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="field-control px-3.5 py-3"
          />
        </label>

        {!isPasswordReset && (
          <label>
            <span className="field-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              className="field-control px-3.5 py-3"
            />
            <span className="mt-2 block text-xs text-[var(--text-muted)]">
              {isSignIn ? 'Use your account credentials.' : 'Use at least 6 characters.'}
            </span>
          </label>
        )}

        <Button
          type="submit"
          icon={SubmitIcon}
          disabled={!email.trim() || (!isPasswordReset && !password) || isLoading}
          className="mt-1 w-full"
        >
          {isLoading ? 'Working...' : submitLabel}
        </Button>
      </form>

      {isSignIn && (
        <button
          type="button"
          onClick={() => selectMode('reset-password')}
          disabled={isLoading}
          className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"
        >
          <KeyRound aria-hidden="true" size={15} />
          Forgot password?
        </button>
      )}

      {isPasswordReset ? (
        <button
          type="button"
          onClick={() => selectMode('sign-in')}
          disabled={isLoading}
          className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Return to sign in
        </button>
      ) : (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span>or continue with</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <Button variant="secondary" onClick={onGoogleSignIn} disabled={isLoading} className="w-full">
            <span aria-hidden="true" className="text-base font-bold">G</span>
            Google
          </Button>
        </>
      )}

      {message && <p className="feedback-success mt-4">{message}</p>}
      {error && <p role="alert" className="feedback-error mt-4">{error}</p>}
    </Panel>
  )
}
