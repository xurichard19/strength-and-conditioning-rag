import { type FormEvent, useMemo, useState } from 'react'

import {
  EQUIPMENT_OPTIONS,
  EXPERIENCE_LEVELS,
  PRIMARY_GOALS,
  SESSION_DURATIONS,
  TRAINING_DAYS,
  type OnboardingAnswers,
  type Profile,
  type ProfileUpdate,
} from '../types/profile'

type SettingsPageProps = {
  profile: Profile
  userEmail?: string | null
  onUpdate: (update: ProfileUpdate) => Promise<Profile>
}

type Feedback = {
  type: 'error' | 'success'
  message: string
} | null

const controlClass =
  'mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3 text-base text-[var(--text-h)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)] disabled:cursor-default disabled:text-[var(--text-h)] disabled:opacity-90'
const selectClass = `${controlClass} disabled:appearance-none`

function profileAnswers(profile: Profile): OnboardingAnswers {
  return {
    display_name: profile.display_name,
    primary_goal: profile.primary_goal,
    experience_level: profile.experience_level,
    training_days_per_week: profile.training_days_per_week,
    session_duration_minutes: profile.session_duration_minutes,
    equipment_access: profile.equipment_access,
  }
}

export function SettingsPage({ profile, userEmail, onUpdate }: SettingsPageProps) {
  const [draft, setDraft] = useState<OnboardingAnswers>(() => profileAnswers(profile))
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = useMemo(
    () =>
      draft.display_name !== profile.display_name ||
      draft.primary_goal !== profile.primary_goal ||
      draft.experience_level !== profile.experience_level ||
      draft.training_days_per_week !== profile.training_days_per_week ||
      draft.session_duration_minutes !== profile.session_duration_minutes ||
      draft.equipment_access !== profile.equipment_access,
    [draft, profile],
  )

  const updateField = <Field extends keyof OnboardingAnswers,>(
    field: Field,
    value: OnboardingAnswers[Field],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setFeedback(null)
  }

  const discardChanges = () => {
    setDraft(profileAnswers(profile))
    setFeedback(null)
    setIsEditing(false)
  }

  const editProfile = () => {
    setDraft(profileAnswers(profile))
    setFeedback(null)
    setIsEditing(true)
  }

  const saveChanges = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isEditing || !isDirty || isSaving) return

    const displayName = draft.display_name?.trim() ?? ''
    if (!displayName) {
      setFeedback({ type: 'error', message: 'Enter the name you would like us to use.' })
      return
    }

    const update: ProfileUpdate = {}
    if (displayName !== profile.display_name) update.display_name = displayName
    if (draft.primary_goal !== profile.primary_goal && draft.primary_goal) {
      update.primary_goal = draft.primary_goal
    }
    if (draft.experience_level !== profile.experience_level && draft.experience_level) {
      update.experience_level = draft.experience_level
    }
    if (
      draft.training_days_per_week !== profile.training_days_per_week &&
      draft.training_days_per_week
    ) {
      update.training_days_per_week = draft.training_days_per_week
    }
    if (
      draft.session_duration_minutes !== profile.session_duration_minutes &&
      draft.session_duration_minutes
    ) {
      update.session_duration_minutes = draft.session_duration_minutes
    }
    if (draft.equipment_access !== profile.equipment_access && draft.equipment_access) {
      update.equipment_access = draft.equipment_access
    }

    if (Object.keys(update).length === 0) {
      setDraft(profileAnswers(profile))
      setFeedback({ type: 'success', message: 'Your profile is already up to date.' })
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    setFeedback(null)

    try {
      const updatedProfile = await onUpdate(update)
      setDraft(profileAnswers(updatedProfile))
      setFeedback({ type: 'success', message: 'Your profile has been updated.' })
      setIsEditing(false)
    } catch (saveError) {
      setFeedback({
        type: 'error',
        message: saveError instanceof Error ? saveError.message : 'Could not update your profile.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-4.25rem)] max-w-5xl px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Account
        </p>
        <h1 className="m-0 text-4xl font-semibold tracking-normal text-[var(--text-h)] sm:text-5xl">
          Settings
        </h1>
        <p className="mt-3 max-w-2xl leading-7">
          Keep your training profile current so recommendations stay aligned with your goals and schedule.
        </p>
      </header>

      <form onSubmit={(event) => void saveChanges(event)} className="grid gap-5">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)] sm:p-6">
          <div>
            <h2 className="m-0 text-xl font-semibold text-[var(--text-h)]">Personal details</h2>
            <p className="mt-1 text-sm leading-6">The information associated with your account.</p>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="display-name" className="text-sm font-semibold text-[var(--text-h)]">
                Display name
              </label>
              <input
                id="display-name"
                type="text"
                value={draft.display_name ?? ''}
                onChange={(event) => updateField('display_name', event.target.value)}
                maxLength={60}
                autoComplete="given-name"
                required
                disabled={!isEditing || isSaving}
                aria-describedby="display-name-help"
                className={controlClass}
              />
              <p id="display-name-help" className="mt-2 text-sm leading-5">
                The name Arcel uses when speaking with you.
              </p>
            </div>

            <div>
              <label htmlFor="email" className="text-sm font-semibold text-[var(--text-h)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={userEmail ?? ''}
                disabled
                className={`${controlClass} bg-[var(--social-bg)]`}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)] sm:p-6">
          <div>
            <h2 className="m-0 text-xl font-semibold text-[var(--text-h)]">Training profile</h2>
            <p className="mt-1 text-sm leading-6">Update any answer as your training needs change.</p>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="primary-goal" className="text-sm font-semibold text-[var(--text-h)]">
                Primary goal
              </label>
              <select
                id="primary-goal"
                value={draft.primary_goal ?? ''}
                onChange={(event) =>
                  updateField(
                    'primary_goal',
                    event.target.value as NonNullable<OnboardingAnswers['primary_goal']>,
                  )
                }
                required
                disabled={!isEditing || isSaving}
                className={selectClass}
              >
                <option value="" disabled>Select your primary goal</option>
                {PRIMARY_GOALS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="experience-level" className="text-sm font-semibold text-[var(--text-h)]">
                Experience level
              </label>
              <select
                id="experience-level"
                value={draft.experience_level ?? ''}
                onChange={(event) =>
                  updateField(
                    'experience_level',
                    event.target.value as NonNullable<OnboardingAnswers['experience_level']>,
                  )
                }
                required
                disabled={!isEditing || isSaving}
                className={selectClass}
              >
                <option value="" disabled>Select your experience</option>
                {EXPERIENCE_LEVELS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="training-days" className="text-sm font-semibold text-[var(--text-h)]">
                Training days per week
              </label>
              <select
                id="training-days"
                value={draft.training_days_per_week ?? ''}
                onChange={(event) =>
                  updateField(
                    'training_days_per_week',
                    Number(event.target.value) as NonNullable<
                      OnboardingAnswers['training_days_per_week']
                    >,
                  )
                }
                required
                disabled={!isEditing || isSaving}
                className={selectClass}
              >
                <option value="" disabled>Select days per week</option>
                {TRAINING_DAYS.map((days) => (
                  <option key={days} value={days}>{days} days</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="session-duration" className="text-sm font-semibold text-[var(--text-h)]">
                Session duration
              </label>
              <select
                id="session-duration"
                value={draft.session_duration_minutes ?? ''}
                onChange={(event) =>
                  updateField(
                    'session_duration_minutes',
                    Number(event.target.value) as NonNullable<
                      OnboardingAnswers['session_duration_minutes']
                    >,
                  )
                }
                required
                disabled={!isEditing || isSaving}
                className={selectClass}
              >
                <option value="" disabled>Select session duration</option>
                {SESSION_DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 90 ? '90+ minutes' : `${minutes} minutes`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="equipment-access" className="text-sm font-semibold text-[var(--text-h)]">
                Equipment access
              </label>
              <select
                id="equipment-access"
                value={draft.equipment_access ?? ''}
                onChange={(event) =>
                  updateField(
                    'equipment_access',
                    event.target.value as NonNullable<OnboardingAnswers['equipment_access']>,
                  )
                }
                required
                disabled={!isEditing || isSaving}
                className={selectClass}
              >
                <option value="" disabled>Select your equipment</option>
                {EQUIPMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--social-bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="min-h-5 text-sm font-medium">
            {feedback && (
              <p role={feedback.type === 'error' ? 'alert' : 'status'} className={feedback.type === 'error' ? 'text-red-700' : 'text-emerald-700'}>
                {feedback.message}
              </p>
            )}
          </div>

          {isEditing ? (
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={discardChanges}
                disabled={isSaving}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-5 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Discard changes
              </button>
              <button
                type="submit"
                disabled={!isDirty || isSaving}
                className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={editProfile}
              className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Edit profile
            </button>
          )}
        </div>
      </form>
    </main>
  )
}
