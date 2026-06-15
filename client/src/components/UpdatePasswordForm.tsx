import { type BaseSyntheticEvent, useState } from 'react'

type UpdatePasswordFormProps = {
  error: string
  isLoading: boolean
  message: string
  onSubmit: (password: string) => Promise<void>
}

export function UpdatePasswordForm({
  error,
  isLoading,
  message,
  onSubmit,
}: UpdatePasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState('')

  const handleSubmit = async (event: BaseSyntheticEvent<SubmitEvent, HTMLFormElement>) => {
    event.preventDefault()

    if (isLoading) return

    if (password !== confirmPassword) {
      setLocalError('Passwords must match.')
      return
    }

    setLocalError('')
    await onSubmit(password)
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[var(--shadow)] sm:p-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="new-password" className="text-sm font-medium text-[var(--text-h)]">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
        />

        <label htmlFor="confirm-password" className="text-sm font-medium text-[var(--text-h)]">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text)]">Use at least 6 characters.</p>
          <button
            type="submit"
            disabled={!password || !confirmPassword || isLoading}
            className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
          >
            {isLoading ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </form>

      {(localError || error) && <p className="mt-4 leading-7 text-red-700">{localError || error}</p>}
      {message && <p className="mt-4 leading-7 text-[var(--accent)]">{message}</p>}
    </section>
  )
}
