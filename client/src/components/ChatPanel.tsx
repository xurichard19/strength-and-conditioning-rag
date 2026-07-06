import { type BaseSyntheticEvent, useState } from 'react'

import { submitChat } from '../api/chat'
import { ApiRequestError } from '../api/errors'
import type { Source } from '../types/chat'
import { MarkdownResponse } from './MarkdownResponse'
import { SourceList } from './SourceList'

type ChatPanelProps = {
  accessToken: string
  onUnauthorized: () => void
}

export function ChatPanel({ accessToken, onUnauthorized }: ChatPanelProps) {
  const [question, setQuestion] = useState('')
  const [response, setResponse] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: BaseSyntheticEvent<SubmitEvent, HTMLFormElement>) => {
    event.preventDefault()

    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isLoading) return

    setIsLoading(true)
    setError('')
    setResponse('')
    setSources([])

    try {
      await submitChat(trimmedQuestion, accessToken, {
        onText: (delta) => setResponse((currentResponse) => currentResponse + delta),
        onSources: setSources,
      })
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        onUnauthorized()
        return
      }

      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[var(--shadow)] sm:p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="question" className="text-sm font-medium text-[var(--text-h)]">
            Research question
          </label>
          <textarea
            id="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="How should I place threshold runs around heavy lower-body strength work?"
            className="min-h-28 resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--text)]">
              Retrieves and reranks research excerpts before generating an answer.
            </p>
            <button
              type="submit"
              disabled={!question.trim() || isLoading}
              className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
            >
              {isLoading ? 'Reviewing...' : 'Ask'}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-5 min-h-40 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">Answer</h2>
          {isLoading && (
            <span className="text-sm font-medium text-[var(--accent)]">Searching research</span>
          )}
        </div>

        {error ? (
          <p className="leading-7 text-red-700">{error}</p>
        ) : response ? (
          <>
            <MarkdownResponse content={response} />
            <SourceList sources={sources} />
          </>
        ) : (
          <p className="leading-7 text-[var(--text)]">
            Your research-backed insight will appear here after you ask a question.
          </p>
        )}
      </section>
    </>
  )
}
