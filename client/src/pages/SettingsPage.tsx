import { type FormEvent, useMemo, useState } from 'react'
import { Activity, Pencil, Save, Settings, Undo2, UserRound } from 'lucide-react'

import { Button, PageHeader, Panel } from '../components/ui'
import {
  EQUIPMENT_OPTIONS,
  EXPERIENCE_LEVELS,
  PRIMARY_GOALS,
  SESSION_DURATION_OPTIONS,
  TRAINING_DAY_OPTIONS,
  type OnboardingAnswers,
  type Profile,
  type ProfileUpdate,
} from '../types/profile'

type SettingsPageProps = {
  profile: Profile
  userEmail?: string | null
  onUpdate: (update: ProfileUpdate) => Promise<Profile>
}

type Feedback = { type: 'error' | 'success'; message: string } | null
type SelectOption = { label: string; value: string | number }

type ProfileSelectProps = {
  disabled: boolean
  id: string
  label: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder: string
  value: string | number | null
}

function ProfileSelect({ disabled, id, label, onChange, options, placeholder, value }: ProfileSelectProps) {
  return (
    <label htmlFor={id}>
      <span className="field-label">{label}</span>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        required
        disabled={disabled}
        className="field-control px-3.5 py-3 disabled:appearance-none"
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

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
    () => (Object.keys(draft) as Array<keyof OnboardingAnswers>).some((field) => draft[field] !== profile[field]),
    [draft, profile],
  )

  const updateField = <Field extends keyof OnboardingAnswers>(field: Field, value: OnboardingAnswers[Field]) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setFeedback(null)
  }

  const discardChanges = () => {
    setDraft(profileAnswers(profile))
    setFeedback(null)
    setIsEditing(false)
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
    if (draft.primary_goal !== profile.primary_goal && draft.primary_goal) update.primary_goal = draft.primary_goal
    if (draft.experience_level !== profile.experience_level && draft.experience_level) update.experience_level = draft.experience_level
    if (draft.training_days_per_week !== profile.training_days_per_week && draft.training_days_per_week) update.training_days_per_week = draft.training_days_per_week
    if (draft.session_duration_minutes !== profile.session_duration_minutes && draft.session_duration_minutes) update.session_duration_minutes = draft.session_duration_minutes
    if (draft.equipment_access !== profile.equipment_access && draft.equipment_access) update.equipment_access = draft.equipment_access

    if (Object.keys(update).length === 0) {
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

  const controlsDisabled = !isEditing || isSaving

  return (
    <main className="app-page app-page-narrow">
      <PageHeader
        eyebrow="Account"
        icon={Settings}
        title="Training profile"
        description="Keep the stable parts of your training context current. Arcel uses these details when shaping recommendations and plans."
        actions={!isEditing && (
          <Button icon={Pencil} onClick={() => {
            setDraft(profileAnswers(profile))
            setFeedback(null)
            setIsEditing(true)
          }}>
            Edit profile
          </Button>
        )}
      />

      <form onSubmit={(event) => void saveChanges(event)} className="grid gap-5">
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <UserRound aria-hidden="true" size={18} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-base font-semibold">Personal details</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">The information associated with your account.</p>
            </div>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <label htmlFor="display-name">
              <span className="field-label">Display name</span>
              <input
                id="display-name"
                type="text"
                value={draft.display_name ?? ''}
                onChange={(event) => updateField('display_name', event.target.value)}
                maxLength={60}
                autoComplete="given-name"
                required
                disabled={controlsDisabled}
                className="field-control px-3.5 py-3"
              />
              <span className="mt-2 block text-xs text-[var(--text-muted)]">The name Arcel uses when speaking with you.</span>
            </label>
            <label htmlFor="email">
              <span className="field-label">Email</span>
              <input
                id="email"
                type="email"
                value={userEmail ?? ''}
                disabled
                className="field-control px-3.5 py-3"
              />
            </label>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <Activity aria-hidden="true" size={18} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-base font-semibold">Training context</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Update these as your needs, schedule, or access change.</p>
            </div>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <ProfileSelect
                id="primary-goal"
                label="Primary goal"
                value={draft.primary_goal}
                options={PRIMARY_GOALS}
                placeholder="Select your primary goal"
                disabled={controlsDisabled}
                onChange={(value) => updateField('primary_goal', value as NonNullable<OnboardingAnswers['primary_goal']>)}
              />
            </div>
            <ProfileSelect
              id="experience-level"
              label="Experience level"
              value={draft.experience_level}
              options={EXPERIENCE_LEVELS}
              placeholder="Select your experience"
              disabled={controlsDisabled}
              onChange={(value) => updateField('experience_level', value as NonNullable<OnboardingAnswers['experience_level']>)}
            />
            <ProfileSelect
              id="training-days"
              label="Training days per week"
              value={draft.training_days_per_week}
              options={TRAINING_DAY_OPTIONS}
              placeholder="Select days per week"
              disabled={controlsDisabled}
              onChange={(value) => updateField('training_days_per_week', Number(value) as NonNullable<OnboardingAnswers['training_days_per_week']>)}
            />
            <ProfileSelect
              id="session-duration"
              label="Session duration"
              value={draft.session_duration_minutes}
              options={SESSION_DURATION_OPTIONS}
              placeholder="Select session duration"
              disabled={controlsDisabled}
              onChange={(value) => updateField('session_duration_minutes', Number(value) as NonNullable<OnboardingAnswers['session_duration_minutes']>)}
            />
            <ProfileSelect
              id="equipment-access"
              label="Equipment access"
              value={draft.equipment_access}
              options={EQUIPMENT_OPTIONS}
              placeholder="Select your equipment"
              disabled={controlsDisabled}
              onChange={(value) => updateField('equipment_access', value as NonNullable<OnboardingAnswers['equipment_access']>)}
            />
          </div>
        </Panel>

        {(feedback || isEditing) && (
          <div className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite" className="min-h-5">
              {feedback && (
                <p role={feedback.type === 'error' ? 'alert' : 'status'} className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
                  {feedback.message}
                </p>
              )}
            </div>
            {isEditing && (
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="secondary" icon={Undo2} onClick={discardChanges} disabled={isSaving}>Discard</Button>
                <Button type="submit" icon={Save} disabled={!isDirty || isSaving}>{isSaving ? 'Saving...' : 'Save changes'}</Button>
              </div>
            )}
          </div>
        )}
      </form>
    </main>
  )
}
