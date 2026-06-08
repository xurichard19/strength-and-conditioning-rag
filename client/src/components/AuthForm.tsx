import { type BaseSyntheticEvent, useState } from 'react'

type AuthFormProps = {
  error: string
  isLoading: boolean
  message: string
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

  const handleSubmit = async (event: BaseSyntheticEvent<SubmitEvent, HTMLFormElement>) => {
    event.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail || isLoading) return

    if (isPasswordReset) {
      await onPasswordReset(trimmedEmail)
      return
    }

    if (!password) return

    if (isSignIn) {
      await onSignIn(trimmedEmail, password)
    } else {
      await onSignUp(trimmedEmail, password)
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[var(--shadow)] sm:p-5">
      <div className="mb-5 flex rounded-md border border-[var(--border)] p-1">
        <button
          type="button"
          onClick={() => setMode('sign-in')}
          className={`flex-1 rounded px-3 py-2 text-sm font-semibold transition ${
            isSignIn
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-h)] hover:bg-[var(--social-bg)]'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('sign-up')}
          className={`flex-1 rounded px-3 py-2 text-sm font-semibold transition ${
            !isSignIn
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-h)] hover:bg-[var(--social-bg)]'
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium text-[var(--text-h)]">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
        />

        {!isPasswordReset && (
          <>
            <label htmlFor="password" className="text-sm font-medium text-[var(--text-h)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
            />
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text)]">
            {isPasswordReset
              ? 'We will send reset instructions if the account exists.'
              : isSignIn
                ? 'Use your account credentials.'
                : 'Use at least 6 characters.'}
          </p>
          <button
            type="submit"
            disabled={!email.trim() || (!isPasswordReset && !password) || isLoading}
            className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
          >
            {isLoading
              ? 'Working...'
              : isPasswordReset
                ? 'Send reset link'
                : isSignIn
                  ? 'Sign in'
                  : 'Create account'}
          </button>
        </div>
      </form>

      {isSignIn && (
        <button
          type="button"
          onClick={() => setMode('reset-password')}
          className="mt-4 text-sm font-semibold text-[var(--accent)]"
        >
          Forgot password?
        </button>
      )}

      {isPasswordReset ? (
        <button
          type="button"
          onClick={() => setMode('sign-in')}
          className="mt-4 text-sm font-semibold text-[var(--accent)]"
        >
          Return to sign in
        </button>
      ) : (
        <>
          <div className="my-5 flex items-center gap-3 text-sm text-[var(--text)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span>or</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={isLoading}
            className="w-full rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
          >
            Continue with Google
          </button>
        </>
      )}

      {message && <p className="mt-4 leading-7 text-[var(--accent)]">{message}</p>}
      {error && <p className="mt-4 leading-7 text-red-700">{error}</p>}
    </section>
  )
}
