import { type FormEvent, useState } from 'react'
import { MessageCircle, Send, Sparkles, X } from 'lucide-react'

import { submitChat } from '../api/chat'
import { ApiRequestError } from '../api/errors'
import { IconButton } from './ui'

type FloatingChatWidgetProps = {
  accessToken: string
  onUnauthorized: () => void
}

type ChatMessage = { role: 'user' | 'assistant'; text: string }

export function FloatingChatWidget({ accessToken, onUnauthorized }: FloatingChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const appendAssistantText = (delta: string) => {
    setMessages((currentMessages) => {
      const nextMessages = [...currentMessages]
      const lastMessage = nextMessages[nextMessages.length - 1]
      if (lastMessage?.role === 'assistant') {
        nextMessages[nextMessages.length - 1] = { ...lastMessage, text: lastMessage.text + delta }
      }
      return nextMessages
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isLoading) return

    setQuestion('')
    setError('')
    setIsLoading(true)
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: 'user', text: trimmedQuestion },
      { role: 'assistant', text: '' },
    ])

    try {
      await submitChat(trimmedQuestion, accessToken, { onText: appendAssistantText })
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        onUnauthorized()
        return
      }
      setMessages((currentMessages) => currentMessages.slice(0, -1))
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      {isOpen && (
        <section className="panel panel-raised flex h-[32rem] w-[min(calc(100vw-2rem),23rem)] flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-left">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--accent-bg)] text-[var(--accent)]">
                <Sparkles aria-hidden="true" size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Ask Arcel</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Quick research check</p>
              </div>
            </div>
            <IconButton icon={X} label="Close chat" onClick={() => setIsOpen(false)} />
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length ? messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-left text-sm leading-6 ${
                  message.role === 'user'
                    ? 'bg-[var(--accent)] text-[#160a20]'
                    : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-h)]'
                }`}>
                  {message.text || 'Reviewing...'}
                </div>
              </div>
            )) : (
              <div className="empty-state min-h-full px-3">
                <MessageCircle aria-hidden="true" size={24} className="mb-3 text-[var(--accent)]" />
                <p className="text-sm leading-6">Ask a quick training question without leaving this page.</p>
              </div>
            )}
            {error && <p role="alert" className="feedback-error">{error}</p>}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <label htmlFor="floating-chat-question" className="sr-only">Question</label>
            <div className="flex gap-2">
              <input
                id="floating-chat-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about training..."
                className="field-control min-w-0 flex-1 px-3 py-2 text-sm"
              />
              <button type="submit" disabled={!question.trim() || isLoading} aria-label="Send question" title="Send question" className="icon-button border-[var(--accent)] bg-[var(--accent)] text-[#160a20] hover:bg-[#c384f5] hover:text-[#160a20] disabled:opacity-40">
                <Send aria-hidden="true" size={17} />
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="grid h-13 w-13 place-items-center rounded-md border border-[var(--accent)] bg-[var(--accent)] text-[#160a20] shadow-[var(--shadow)] transition hover:-translate-y-1 hover:bg-[#c384f5]"
      >
        {isOpen ? <X aria-hidden="true" size={21} /> : <MessageCircle aria-hidden="true" size={22} />}
      </button>
    </div>
  )
}
