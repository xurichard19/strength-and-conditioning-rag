import { useEffect, useId, useRef, useState } from 'react'

import type { Source } from '../types/chat'

type SourceListProps = {
  sources: Source[]
}

export function SourceList({ sources }: SourceListProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  if (!sources.length) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="View cited documents"
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="View cited documents"
        onClick={() => setIsOpen((open) => !open)}
        className="grid h-9 w-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--social-bg)] text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-bg)]"
      >
        <span
          aria-hidden="true"
          className="relative block h-5 w-4 rounded-sm border-2 border-current"
        >
          <span className="absolute left-0.5 right-0.5 top-1 h-0.5 rounded-full bg-current" />
          <span className="absolute left-0.5 right-0.5 top-2 h-0.5 rounded-full bg-current" />
          <span className="absolute left-0.5 right-1 top-3 h-0.5 rounded-full bg-current" />
        </span>
      </button>

      {isOpen && (
        <section
          id={panelId}
          aria-label="Cited documents"
          className="absolute right-0 top-11 z-20 w-[min(32rem,calc(100vw-3rem))] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] text-left shadow-[var(--shadow)]"
        >
          <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
            <div>
              <h3 className="m-0 text-sm font-semibold text-[var(--text-h)]">Cited documents</h3>
              <p className="mt-0.5 text-xs text-[var(--text)]">
                {sources.length} research {sources.length === 1 ? 'excerpt' : 'excerpts'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close cited documents"
              onClick={() => setIsOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-lg text-[var(--text-h)] transition hover:bg-[var(--social-bg)]"
            >
              x
            </button>
          </header>

          <div className="max-h-80 overflow-y-auto px-4">
            {sources.map((source, index) => (
              <article
                key={source.id ?? index}
                className="border-b border-[var(--border)] py-4 last:border-b-0"
              >
                <div className="mb-2 text-xs font-semibold leading-5 text-[var(--text-h)]">
                  <p className="m-0 break-all">{source.source ?? `Research excerpt ${index + 1}`}</p>
                  <p className="m-0 mt-0.5 text-[var(--text)]">
                    Chunk {index + 1}
                    {source.page !== null && source.page !== undefined ? ` / page ${source.page}` : ''}
                    {source.id !== null && source.id !== undefined ? ` / id ${source.id}` : ''}
                  </p>
                </div>
                <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">
                  {source.text}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
