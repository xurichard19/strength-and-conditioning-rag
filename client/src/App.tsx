import { type FormEvent, useState } from 'react'
import './App.css'
import { submitQuery } from './api/query'
import { MarkdownResponse } from './components/MarkdownResponse'
import { SourceList } from './components/SourceList'
import type { Source } from './types/query'

function App() {
    const [question, setQuestion] = useState('')
    const [response, setResponse] = useState('')
    const [sources, setSources] = useState<Source[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const trimmedQuestion = question.trim()
        if (!trimmedQuestion || isLoading) return

        setIsLoading(true)
        setError('')
        setSources([])

        try {
            const data = await submitQuery(trimmedQuestion)
            setResponse(data.text ?? '')
            setSources(data.sources ?? [])
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[var(--bg)] px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
            <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center">
                <header className="mb-8">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
                        Strength & conditioning research assistant
                    </p>
                    <h1 className="m-0 text-5xl font-semibold tracking-normal text-[var(--text-h)] sm:text-6xl">
                        Shingo
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-h)]">
                        Ask a training question and get an evidence-backed answer from the document library.
                    </p>
                </header>

                <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[var(--shadow)] sm:p-5">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                        <label htmlFor="question" className="text-sm font-medium text-[var(--text-h)]">
                            Question
                        </label>
                        <textarea
                            id="question"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="How should I progress plyometric volume during the season?"
                            className="min-h-28 resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-base leading-6 text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
                        />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-[var(--text)]">
                                Uses retrieval plus reranking before generating an answer.
                            </p>
                            <button
                                type="submit"
                                disabled={!question.trim() || isLoading}
                                className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
                            >
                                {isLoading ? 'Thinking...' : 'Ask'}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="mt-5 min-h-40 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
                    <div className="mb-3 flex items-center justify-between gap-4">
                        <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">Answer</h2>
                        {isLoading && (
                            <span className="text-sm font-medium text-[var(--accent)]">Searching documents</span>
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
                            Your response will appear here after you ask a question.
                        </p>
                    )}
                </section>
            </main>
        </div>
    )
}

export default App
