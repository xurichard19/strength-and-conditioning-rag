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

type OnboardingPageProps = {
  profile: Profile
  onComplete: () => Promise<Profile>
  onSignOut: () => Promise<void>
  onUpdate: (update: ProfileUpdate) => Promise<Profile>
}

type AnswerField = keyof OnboardingAnswers

type AnswerOption = {
  value: string | number
  label: string
  description?: string
}

type Question = {
  field: AnswerField
  eyebrow: string
  title: string
  description: string
  options?: readonly AnswerOption[]
}

const questions: readonly Question[] = [
  {
    field: 'display_name',
    eyebrow: 'First, an introduction',
    title: 'What should we call you?',
    description: 'Your name keeps the experience personal. A first name is perfect.',
  },
  {
    field: 'primary_goal',
    eyebrow: 'Choose your direction',
    title: 'What are you primarily training for?',
    description: 'Pick the outcome that should lead when training priorities compete.',
    options: PRIMARY_GOALS,
  },
  {
    field: 'experience_level',
    eyebrow: 'Meet you where you are',
    title: 'How experienced are you with structured training?',
    description: 'This helps set the right level of complexity and progression.',
    options: EXPERIENCE_LEVELS,
  },
  {
    field: 'training_days_per_week',
    eyebrow: 'Build around real life',
    title: 'How many days can you normally train each week?',
    description: 'Choose a schedule you can sustain during a typical week.',
    options: TRAINING_DAYS.map((day) => ({
      value: day,
      label: `${day} days`,
    })),
  },
  {
    field: 'session_duration_minutes',
    eyebrow: 'Make every session fit',
    title: 'How much time do you usually have per session?',
    description: 'We will keep the work focused enough to fit this window.',
    options: SESSION_DURATIONS.map((minutes) => ({
      value: minutes,
      label: minutes === 90 ? '90+ minutes' : `${minutes} minutes`,
    })),
  },
  {
    field: 'equipment_access',
    eyebrow: 'Use what is available',
    title: 'What equipment can you regularly use?',
    description: 'Choose the setup you can count on most weeks.',
    options: EQUIPMENT_OPTIONS,
  },
]

const primaryGoalLabels = Object.fromEntries(
  PRIMARY_GOALS.map((option) => [option.value, option.label]),
) as Record<NonNullable<Profile['primary_goal']>, string>

const experienceLabels = Object.fromEntries(
  EXPERIENCE_LEVELS.map((option) => [option.value, option.label]),
) as Record<NonNullable<Profile['experience_level']>, string>

const equipmentLabels = Object.fromEntries(
  EQUIPMENT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<NonNullable<Profile['equipment_access']>, string>

function hasAnswer(profile: Profile, field: AnswerField) {
  const value = profile[field]
  return typeof value === 'string' ? value.trim().length > 0 : value !== null
}

function getInitialStep(profile: Profile) {
  const firstUnansweredQuestion = questions.findIndex((question) => !hasAnswer(profile, question.field))
  if (firstUnansweredQuestion === -1) return questions.length

  const hasStarted = questions.some((question) => hasAnswer(profile, question.field))
  return hasStarted ? firstUnansweredQuestion : -1
}

export function OnboardingPage({
  profile,
  onComplete,
  onSignOut,
  onUpdate,
}: OnboardingPageProps) {
  const [answers, setAnswers] = useState<Profile>(profile)
  const [currentStep, setCurrentStep] = useState(() => getInitialStep(profile))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const currentQuestion = currentStep >= 0 ? questions[currentStep] : undefined
  const isWelcome = currentStep === -1
  const isSummary = currentStep === questions.length

  const selectedValue = currentQuestion ? answers[currentQuestion.field] : null
  const progress = isSummary ? 100 : currentStep >= 0 ? ((currentStep + 1) / questions.length) * 100 : 0

  const summaryItems = useMemo(() => {
    if (
      !answers.primary_goal ||
      !answers.experience_level ||
      !answers.training_days_per_week ||
      !answers.session_duration_minutes ||
      !answers.equipment_access
    ) {
      return []
    }

    return [
      { label: 'Primary goal', value: primaryGoalLabels[answers.primary_goal] },
      { label: 'Experience', value: experienceLabels[answers.experience_level] },
      { label: 'Training week', value: `${answers.training_days_per_week} days` },
      {
        label: 'Session length',
        value:
          answers.session_duration_minutes === 90
            ? '90+ minutes'
            : `${answers.session_duration_minutes} minutes`,
      },
      { label: 'Equipment', value: equipmentLabels[answers.equipment_access] },
    ]
  }, [answers])

  const selectAnswer = (field: AnswerField, value: string | number) => {
    setAnswers((current) => ({ ...current, [field]: value }) as Profile)
    setError('')
  }

  const saveCurrentAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentQuestion || isSaving) return

    let value = answers[currentQuestion.field]
    if (currentQuestion.field === 'display_name' && typeof value === 'string') {
      value = value.trim()
    }

    if (value === null || value === '') {
      setError('Choose an answer before continuing.')
      return
    }

    if (currentQuestion.field === 'display_name' && String(value).length > 60) {
      setError('Use 60 characters or fewer.')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const updatedProfile = await onUpdate({
        [currentQuestion.field]: value,
      } as ProfileUpdate)
      setAnswers(updatedProfile)
      setCurrentStep((step) => Math.min(step + 1, questions.length))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save that answer.')
    } finally {
      setIsSaving(false)
    }
  }

  const enterArcel = async () => {
    if (isSaving) return

    setIsSaving(true)
    setError('')
    try {
      await onComplete()
    } catch (completionError) {
      setError(
        completionError instanceof Error
          ? completionError.message
          : 'Could not finish onboarding.',
      )
      setIsSaving(false)
    }
  }

  const goBack = () => {
    if (isSaving) return
    setError('')
    setCurrentStep((step) => Math.max(-1, step - 1))
  }

  return (
    <main className="onboarding-page relative min-h-screen overflow-hidden bg-[var(--bg)] text-left text-[var(--text)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,var(--accent-bg),transparent_34%),radial-gradient(circle_at_90%_85%,var(--accent-bg),transparent_30%)]" />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <span className="text-lg font-semibold tracking-tight text-[var(--text-h)]">Arcel</span>
        <button
          type="button"
          onClick={() => void onSignOut()}
          disabled={isSaving}
          className="rounded-full border border-[var(--border)] bg-[var(--bg)]/80 px-4 py-2 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sign out
        </button>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl items-center px-5 pb-10 sm:px-8">
        <section className="w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg)]/90 shadow-[var(--shadow)] backdrop-blur-sm">
          {!isWelcome && (
            <div className="h-1.5 bg-[var(--social-bg)]" aria-hidden="true">
              <div
                className="h-full rounded-r-full bg-[var(--accent)] transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div key={currentStep} className="onboarding-step p-6 sm:p-10 lg:p-14">
            {isWelcome ? (
              <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                    Your training, in context
                  </p>
                  <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-[var(--text-h)] sm:text-6xl">
                    Let’s build around the way you actually train.
                  </h1>
                  <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--text)] sm:text-lg sm:leading-8">
                    Six quick answers give Arcel the context to shape realistic training decisions around your goals, time, and equipment.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(0)}
                    className="mt-8 rounded-full bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                  >
                    Get started
                  </button>
                </div>

                <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-bg)] p-6">
                  <p className="text-5xl font-semibold tracking-[-0.05em] text-[var(--accent)]">6</p>
                  <p className="mt-3 font-semibold text-[var(--text-h)]">focused questions</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text)]">
                    One at a time. Your progress is saved after every answer.
                  </p>
                </div>
              </div>
            ) : isSummary ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Your starting point
                </p>
                <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.035em] text-[var(--text-h)] sm:text-5xl">
                  You’re set, {answers.display_name}.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text)]">
                  Here is the training context you gave us. You can go back to adjust anything before entering Arcel.
                </p>

                <dl className="mt-8 grid gap-3 sm:grid-cols-2">
                  {summaryItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--social-bg)] p-5"
                    >
                      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text)]">
                        {item.label}
                      </dt>
                      <dd className="m-0 mt-2 font-semibold text-[var(--text-h)]">{item.value}</dd>
                    </div>
                  ))}
                </dl>

                {error && (
                  <p role="alert" className="mt-5 text-sm font-medium text-red-700">
                    {error}
                  </p>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={isSaving}
                    className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void enterArcel()}
                    disabled={isSaving}
                    className="rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSaving ? 'Finishing…' : 'Enter Arcel'}
                  </button>
                </div>
              </div>
            ) : currentQuestion ? (
              <form onSubmit={(event) => void saveCurrentAnswer(event)}>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                    {currentQuestion.eyebrow}
                  </p>
                  <span className="shrink-0 text-sm font-semibold text-[var(--text)]">
                    {currentStep + 1} of {questions.length}
                  </span>
                </div>

                <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text-h)] sm:text-5xl">
                  {currentQuestion.title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text)]">
                  {currentQuestion.description}
                </p>

                {currentQuestion.field === 'display_name' ? (
                  <div className="mt-8">
                    <label htmlFor="display-name" className="sr-only">
                      Display name
                    </label>
                    <input
                      id="display-name"
                      type="text"
                      value={typeof selectedValue === 'string' ? selectedValue : ''}
                      onChange={(event) => selectAnswer('display_name', event.target.value)}
                      maxLength={60}
                      autoComplete="given-name"
                      autoFocus
                      placeholder="Your name"
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-5 py-4 text-xl font-semibold text-[var(--text-h)] outline-none transition placeholder:font-normal placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)] sm:max-w-xl"
                    />
                    <p className="mt-2 text-sm text-[var(--text)]">
                      {typeof selectedValue === 'string' ? selectedValue.length : 0}/60
                    </p>
                  </div>
                ) : (
                  <fieldset className="mt-8">
                    <legend className="sr-only">{currentQuestion.title}</legend>
                    <div
                      className={`grid gap-3 ${
                        currentQuestion.options && currentQuestion.options.length > 4
                          ? 'sm:grid-cols-2'
                          : 'sm:grid-cols-2 lg:grid-cols-3'
                      }`}
                    >
                      {currentQuestion.options?.map((option) => {
                        const isSelected = selectedValue === option.value
                        return (
                          <label
                            key={option.value}
                            className={`cursor-pointer rounded-2xl border p-4 transition focus-within:ring-4 focus-within:ring-[var(--accent-bg)] ${
                              isSelected
                                ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                                : 'border-[var(--border)] bg-[var(--bg)] hover:-translate-y-0.5 hover:border-[var(--accent-border)]'
                            }`}
                          >
                            <input
                              type="radio"
                              name={currentQuestion.field}
                              value={option.value}
                              checked={isSelected}
                              onChange={() => selectAnswer(currentQuestion.field, option.value)}
                              className="sr-only"
                            />
                            <span className="flex items-start justify-between gap-4">
                              <span>
                                <span className="block font-semibold text-[var(--text-h)]">
                                  {option.label}
                                </span>
                                {option.description && (
                                  <span className="mt-1 block text-sm leading-5 text-[var(--text)]">
                                    {option.description}
                                  </span>
                                )}
                              </span>
                              <span
                                aria-hidden="true"
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                  isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent)]'
                                    : 'border-[var(--border)]'
                                }`}
                              >
                                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                )}

                {error && (
                  <p role="alert" className="mt-5 text-sm font-medium text-red-700">
                    {error}
                  </p>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={isSaving}
                    className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || selectedValue === null || selectedValue === ''}
                    className="rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : currentStep === questions.length - 1 ? 'Review' : 'Next'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
