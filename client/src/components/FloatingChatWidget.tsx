import { type FormEvent, useState } from "react"

import { submitChat } from "../api/chat"
import { ApiRequestError } from "../api/errors"

type FloatingChatWidgetProps = {
    accessToken: string
    onUnauthorized: () => void
}

type ChatMessage = {
    role: "user" | "assistant"
    text: string
}

export function FloatingChatWidget({ accessToken, onUnauthorized }: FloatingChatWidgetProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [question, setQuestion] = useState("")
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const trimmedQuestion = question.trim()
        if (!trimmedQuestion || isLoading) return

        setQuestion("")
        setError("")
        setIsLoading(true)
        setMessages((currentMessages) => [
            ...currentMessages,
            { role: "user", text: trimmedQuestion },
        ])

        try {
            const data = await submitChat(trimmedQuestion, accessToken)
            setMessages((currentMessages) => [
                ...currentMessages,
                { role: "assistant", text: data.text ?? "I could not generate a response." },
            ])
        } catch (error) {
            if (error instanceof ApiRequestError && error.status === 401) {
                onUnauthorized()
                return
            }

            setError("Something went wrong. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-3">
            {isOpen && (
                <section className="flex h-[30rem] w-[min(calc(100vw-2.5rem),22rem)] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow)]">
                    <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-left">
                        <div className="min-w-0 flex-1">
                            <h2 className="m-0 text-sm font-semibold text-[var(--text-h)]">Ask Shingo</h2>
                            <p className="m-0 mt-0.5 text-xs text-[var(--text)]">Quick research checks</p>
                        </div>
                        <button
                            type="button"
                            aria-label="Close chat"
                            onClick={() => setIsOpen(false)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-lg font-semibold text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
                        >
                            x
                        </button>
                    </header>

                    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                        {messages.length ? (
                            messages.map((message, index) => (
                                <div
                                    key={`${message.role}-${index}`}
                                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-left text-sm leading-6 ${
                                            message.role === "user"
                                                ? "bg-[var(--accent)] text-white"
                                                : "bg-[var(--social-bg)] text-[var(--text-h)]"
                                        }`}
                                    >
                                        {message.text}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="m-0 text-sm leading-6 text-[var(--text)]">
                                Ask a quick hybrid training question without leaving the page.
                            </p>
                        )}

                        {isLoading && (
                            <p className="m-0 text-sm font-medium text-[var(--accent)]">Reviewing...</p>
                        )}
                        {error && <p className="m-0 text-sm leading-6 text-red-700">{error}</p>}
                    </div>

                    <form onSubmit={handleSubmit} className="border-t border-[var(--border)] p-3">
                        <label htmlFor="floating-chat-question" className="sr-only">
                            Question
                        </label>
                        <div className="flex gap-2">
                            <input
                                id="floating-chat-question"
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                placeholder="Ask about training..."
                                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-h)] outline-none transition placeholder:text-[var(--text)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-bg)]"
                            />
                            <button
                                type="submit"
                                disabled={!question.trim() || isLoading}
                                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--social-bg)] disabled:text-[var(--text)]"
                            >
                                Ask
                            </button>
                        </div>
                    </form>
                </section>
            )}

            <button
                type="button"
                aria-label={isOpen ? "Close chat" : "Open chat"}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((open) => !open)}
                className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent)] text-white shadow-[var(--shadow)] transition hover:opacity-90"
            >
                <span className="relative h-6 w-7 rounded-full border-2 border-current">
                    <span className="absolute -bottom-1 left-3 h-2 w-2 rotate-45 border-b-2 border-r-2 border-current bg-[var(--accent)]" />
                </span>
            </button>
        </div>
    )
}
