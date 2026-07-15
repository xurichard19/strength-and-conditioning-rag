import { type FormEvent, useState } from 'react'
import { BookOpenCheck, MessageSquareText, Search, Send } from 'lucide-react'

import { submitChat } from '../api/chat'
import { ApiRequestError } from '../api/errors'
import { MarkdownResponse } from '../components/MarkdownResponse'
import { SourceList } from '../components/SourceList'
import { Button, EmptyState, PageHeader, Panel } from '../components/ui'
import type { Source } from '../types'

type ChatPageProps = {
  accessToken: string
  onUnauthorized: () => void
}

const promptSuggestions = [
  'How should I place intervals around heavy lower-body lifting?',
  'What is a sensible weekly strength volume for endurance athletes?',
  'How can I improve recovery between concurrent training sessions?',
]

export function ChatPage({ accessToken, onUnauthorized }: ChatPageProps) {
  const [question, setQuestion] = useState('')
  const [submittedQuestion, setSubmittedQuestion] = useState('')
  const [response, setResponse] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isLoading) return

    setSubmittedQuestion(trimmedQuestion)
    setIsLoading(true)
    setError('')
    setResponse('')
    setSources([])

    try {
      await submitChat(trimmedQuestion, accessToken, {
        onText: (delta) => setResponse((currentResponse) => currentResponse + delta),
        onSources: setSources,
      })
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        onUnauthorized()
        return
      }
      setError('Something went wrong while generating the answer. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app-page app-page-narrow flex flex-col">
      <PageHeader
        eyebrow="Research assistant"
        icon={BookOpenCheck}
        title="Ask the training literature."
        description="Get a focused answer, then open the source drawer to inspect the exact research excerpts behind it."
      />

      <Panel raised className="flex h-[clamp(34rem,calc(100dvh-18rem),46rem)] flex-none flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--accent-bg)] text-[var(--accent)]">
              <MessageSquareText aria-hidden="true" size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Research answer</h2>
              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {submittedQuestion || 'Ready for your question'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isLoading && (
              <span className="loading-pulse hidden text-xs font-semibold text-[var(--accent)] sm:inline">
                Searching and synthesizing
              </span>
            )}
            <SourceList sources={sources} />
          </div>
        </div>

        <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-8">
          {error ? (
            <p role="alert" className="feedback-error">{error}</p>
          ) : response ? (
            <MarkdownResponse content={response} />
          ) : isLoading ? (
            <div className="space-y-3" aria-label="Generating answer">
              <div className="loading-pulse h-4 w-3/4 rounded bg-[var(--surface-raised)]" />
              <div className="loading-pulse h-4 w-full rounded bg-[var(--surface-raised)]" />
              <div className="loading-pulse h-4 w-5/6 rounded bg-[var(--surface-raised)]" />
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="Start with a specific decision"
              description="The more concrete the training question, the more useful the retrieved evidence will be."
            />
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:p-5">
          {!submittedQuestion && (
            <div className="mb-3 flex flex-wrap gap-2">
              {promptSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuestion(suggestion)}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs font-medium text-[var(--text)] transition hover:border-[var(--accent-border)] hover:text-[var(--text-h)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <label htmlFor="research-question" className="sr-only">Research question</label>
            <textarea
              id="research-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a focused question about training..."
              rows={2}
              className="field-control min-h-[3.25rem] flex-1 resize-none px-3.5 py-3 text-sm leading-6"
            />
            <Button type="submit" icon={Send} disabled={!question.trim() || isLoading} className="h-[3.25rem] px-4">
              <span className="hidden sm:inline">Ask Arcel</span>
            </Button>
          </form>
        </div>
      </Panel>
    </main>
  )
}
