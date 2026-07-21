import { type BaseSyntheticEvent, useState } from 'react'
import { KeyRound } from 'lucide-react'

import { Button, Panel } from './ui'

type UpdatePasswordFormProps = {
  error: string
  isLoading: boolean
  message: string
  onSubmit: (password: string) => Promise<void>
}

export function UpdatePasswordForm({ error, isLoading, message, onSubmit }: UpdatePasswordFormProps) {
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
    <Panel raised className="p-5 sm:p-6">
      <p className="page-eyebrow">Account security</p>
      <h2 className="text-2xl font-semibold">Choose a new password</h2>
      <p className="mt-2 text-sm leading-6">Use at least 6 characters and confirm it below.</p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <label>
          <span className="field-label">New password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="field-control px-3.5 py-3"
          />
        </label>
        <label>
          <span className="field-label">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="field-control px-3.5 py-3"
          />
        </label>
        <Button type="submit" icon={KeyRound} disabled={!password || !confirmPassword || isLoading} className="mt-1 w-full">
          {isLoading ? 'Updating...' : 'Update password'}
        </Button>
      </form>

      {(localError || error) && <p role="alert" className="feedback-error mt-4">{localError || error}</p>}
      {message && <p className="feedback-success mt-4">{message}</p>}
    </Panel>
  )
}
