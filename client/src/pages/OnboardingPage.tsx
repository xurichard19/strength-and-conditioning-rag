import { type FormEvent, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, LogOut, Sparkles } from 'lucide-react'

import { BrandMark } from '../components/BrandMark'
import { Button, Panel } from '../components/ui'
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

type OnboardingPageProps = {
  profile: Profile
  onComplete: () => Promise<Profile>
  onSignOut: () => Promise<void>
  onUpdate: (update: ProfileUpdate) => Promise<Profile>
}

type AnswerField = keyof OnboardingAnswers
type AnswerOption = { value: string | number; label: string; description?: string }
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
    options: TRAINING_DAY_OPTIONS,
  },
  {
    field: 'session_duration_minutes',
    eyebrow: 'Make every session fit',
    title: 'How much time do you usually have per session?',
    description: 'We will keep the work focused enough to fit this window.',
    options: SESSION_DURATION_OPTIONS,
  },
  {
    field: 'equipment_access',
    eyebrow: 'Use what is available',
    title: 'What equipment can you regularly use?',
    description: 'Choose the setup you can count on most weeks.',
    options: EQUIPMENT_OPTIONS,
  },
]

const profileLabels = Object.fromEntries(
  [...PRIMARY_GOALS, ...EXPERIENCE_LEVELS, ...EQUIPMENT_OPTIONS].map(({ value, label }) => [value, label]),
) as Record<string, string>

function hasAnswer(profile: Profile, field: AnswerField) {
  const value = profile[field]
  return typeof value === 'string' ? value.trim().length > 0 : value !== null
}

function getInitialStep(profile: Profile) {
  const firstUnansweredQuestion = questions.findIndex((question) => !hasAnswer(profile, question.field))
  if (firstUnansweredQuestion === -1) return questions.length
  return questions.some((question) => hasAnswer(profile, question.field)) ? firstUnansweredQuestion : -1
}

export function OnboardingPage({ profile, onComplete, onSignOut, onUpdate }: OnboardingPageProps) {
  const [answers, setAnswers] = useState<Profile>(profile)
  const [currentStep, setCurrentStep] = useState(() => getInitialStep(profile))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const currentQuestion = currentStep >= 0 ? questions[currentStep] : undefined
  const isWelcome = currentStep === -1
  const isSummary = currentStep === questions.length
  const selectedValue = currentQuestion ? answers[currentQuestion.field] : null
  const progress = isSummary ? 100 : currentStep >= 0 ? ((currentStep + 1) / questions.length) * 100 : 0

  const summaryItems = answers.primary_goal && answers.experience_level && answers.training_days_per_week
    && answers.session_duration_minutes && answers.equipment_access
    ? [
      { label: 'Primary goal', value: profileLabels[answers.primary_goal] },
      { label: 'Experience', value: profileLabels[answers.experience_level] },
      { label: 'Training week', value: `${answers.training_days_per_week} days` },
      { label: 'Session length', value: answers.session_duration_minutes === 90 ? '90+ minutes' : `${answers.session_duration_minutes} minutes` },
      { label: 'Equipment', value: profileLabels[answers.equipment_access] },
    ]
    : []

  const selectAnswer = (field: AnswerField, value: string | number) => {
    setAnswers((current) => ({ ...current, [field]: value }) as Profile)
    setError('')
  }

  const saveCurrentAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentQuestion || isSaving) return
    let value = answers[currentQuestion.field]
    if (currentQuestion.field === 'display_name' && typeof value === 'string') value = value.trim()
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
      const updatedProfile = await onUpdate({ [currentQuestion.field]: value } as ProfileUpdate)
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
      setError(completionError instanceof Error ? completionError.message : 'Could not finish onboarding.')
      setIsSaving(false)
    }
  }

  const goBack = () => {
    if (isSaving) return
    setError('')
    setCurrentStep((step) => Math.max(-1, step - 1))
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-left text-[var(--text)]">
      <header className="border-b border-[var(--border)] px-4 sm:px-6">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-semibold text-[var(--text-h)]">Arcel</span>
          </div>
          <Button variant="ghost" icon={LogOut} onClick={() => void onSignOut()} disabled={isSaving}>Sign out</Button>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6">
        <Panel raised className="w-full overflow-hidden">
          {!isWelcome && (
            <div className="border-b border-[var(--border)] px-5 py-4 sm:px-8">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                <span className="text-[var(--text-h)]">Profile setup</span>
                <span className="text-[var(--accent)]">{isSummary ? 'Review' : `${currentStep + 1} of ${questions.length}`}</span>
              </div>
              <div className="h-1 overflow-hidden rounded bg-[var(--surface-muted)]">
                <div className="h-full rounded bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div key={currentStep} className="onboarding-step p-6 sm:p-10 lg:p-12">
            {isWelcome ? (
              <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div>
                  <p className="page-eyebrow"><Sparkles aria-hidden="true" size={14} /> Your training, in context</p>
                  <h1 className="page-title mt-3 max-w-2xl">Build around the way you actually train.</h1>
                  <p className="page-description">Six focused answers give Arcel the context to shape realistic decisions around your goals, time, experience, and equipment.</p>
                  <Button icon={ArrowRight} onClick={() => setCurrentStep(0)} className="mt-7">Get started</Button>
                </div>
                <aside className="border-l-2 border-[var(--accent)] pl-5">
                  <p className="text-4xl font-semibold text-[var(--accent)]">6</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-h)]">focused questions</p>
                  <p className="mt-2 text-xs leading-5">Progress saves after each answer.</p>
                </aside>
              </div>
            ) : isSummary ? (
              <div>
                <p className="page-eyebrow">Your starting point</p>
                <h1 className="page-title mt-3">You are set, {answers.display_name}.</h1>
                <p className="page-description">Review the context below. You can go back to adjust the last answer before entering Arcel.</p>
                <dl className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)] sm:grid sm:grid-cols-2 sm:divide-y-0">
                  {summaryItems.map((item) => (
                    <div key={item.label} className="py-4 sm:border-b sm:border-[var(--border)] sm:px-4 sm:first:pl-0">
                      <dt className="text-xs font-semibold text-[var(--text-muted)]">{item.label}</dt>
                      <dd className="m-0 mt-1 text-sm font-semibold text-[var(--text-h)]">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                {error && <p role="alert" className="feedback-error mt-5">{error}</p>}
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="secondary" icon={ChevronLeft} onClick={goBack} disabled={isSaving}>Back</Button>
                  <Button icon={ArrowRight} onClick={() => void enterArcel()} disabled={isSaving}>{isSaving ? 'Finishing...' : 'Enter Arcel'}</Button>
                </div>
              </div>
            ) : currentQuestion ? (
              <form onSubmit={(event) => void saveCurrentAnswer(event)}>
                <p className="page-eyebrow">{currentQuestion.eyebrow}</p>
                <h1 className="page-title mt-3 max-w-3xl">{currentQuestion.title}</h1>
                <p className="page-description">{currentQuestion.description}</p>

                {currentQuestion.field === 'display_name' ? (
                  <div className="mt-8 max-w-xl">
                    <label htmlFor="display-name" className="field-label">Display name</label>
                    <input
                      id="display-name"
                      type="text"
                      value={typeof selectedValue === 'string' ? selectedValue : ''}
                      onChange={(event) => selectAnswer('display_name', event.target.value)}
                      maxLength={60}
                      autoComplete="given-name"
                      autoFocus
                      placeholder="Your name"
                      className="field-control px-4 py-3.5 text-lg font-semibold"
                    />
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{typeof selectedValue === 'string' ? selectedValue.length : 0}/60</p>
                  </div>
                ) : (
                  <fieldset className="mt-8">
                    <legend className="sr-only">{currentQuestion.title}</legend>
                    <div className={`grid gap-3 ${currentQuestion.options && currentQuestion.options.length > 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                      {currentQuestion.options?.map((option) => {
                        const isSelected = selectedValue === option.value
                        return (
                          <label key={option.value} className={`panel panel-interactive relative cursor-pointer p-4 ${isSelected ? 'border-[var(--accent)] bg-[var(--accent-bg)]' : ''}`}>
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
                                <span className="block text-sm font-semibold text-[var(--text-h)]">{option.label}</span>
                                {option.description && <span className="mt-1 block text-xs leading-5 text-[var(--text)]">{option.description}</span>}
                              </span>
                              <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)] text-[#160a20]' : 'border-[var(--border-strong)]'}`}>
                                {isSelected && <Check size={13} strokeWidth={3} />}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                )}

                {error && <p role="alert" className="feedback-error mt-5">{error}</p>}
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="secondary" icon={ChevronLeft} onClick={goBack} disabled={isSaving}>Back</Button>
                  <Button type="submit" icon={ArrowRight} disabled={isSaving || selectedValue === null || selectedValue === ''}>
                    {isSaving ? 'Saving...' : currentStep === questions.length - 1 ? 'Review' : 'Next'}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </Panel>
      </div>
    </main>
  )
}
