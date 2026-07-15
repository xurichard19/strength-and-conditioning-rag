import { useEffect, useId, useRef, useState } from 'react'

import type { Source } from '../types/chat'

type SourceListProps = {
  sources: Source[]
}

export function SourceList({ sources }: SourceListProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    const trigger = triggerRef.current
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      trigger?.focus()
    }
  }, [isOpen])

  if (!sources.length) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`View ${sources.length} cited ${sources.length === 1 ? 'document' : 'documents'}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="View cited documents"
        onClick={() => setIsOpen(true)}
        className="relative grid h-9 w-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--social-bg)] text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-bg)]"
      >
        <span
          aria-hidden="true"
          className="relative block h-5 w-4 rounded-sm border-2 border-current"
        >
          <span className="absolute left-0.5 right-0.5 top-1 h-0.5 rounded-full bg-current" />
          <span className="absolute left-0.5 right-0.5 top-2 h-0.5 rounded-full bg-current" />
          <span className="absolute left-0.5 right-1 top-3 h-0.5 rounded-full bg-current" />
        </span>
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[0.625rem] font-bold leading-none text-white"
        >
          {sources.length > 9 ? '9+' : sources.length}
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false)
          }}
        >
          <section
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${panelId}-title`}
            className="flex max-h-[min(42rem,calc(100vh-3rem))] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] text-left shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-5 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Answer evidence
                </p>
                <h3
                  id={`${panelId}-title`}
                  className="m-0 mt-1 text-lg font-semibold text-[var(--text-h)]"
                >
                  Research sources
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium text-[var(--text)]">
                  {sources.length} {sources.length === 1 ? 'passage' : 'passages'}
                </span>
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close research sources"
                  onClick={() => setIsOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-md border border-[var(--border)] text-base font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)] hover:bg-[var(--social-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-bg)]"
                >
                  x
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
              {sources.map((source, index) => (
                <article
                  key={source.id ?? index}
                  className="grid gap-3 border-b border-[var(--border)] py-5 last:border-b-0 sm:grid-cols-[2.25rem_minmax(0,1fr)]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--accent-bg)] text-xs font-bold text-[var(--accent)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h4 className="m-0 break-words text-sm font-semibold leading-5 text-[var(--text-h)]">
                      {source.source ?? `Research excerpt ${index + 1}`}
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-[var(--text)]">
                      {source.page !== null && source.page !== undefined && (
                        <span>Page {source.page}</span>
                      )}
                      {source.id !== null && source.id !== undefined && (
                        <span>Document ID {source.id}</span>
                      )}
                    </div>
                    <p className="m-0 mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">
                      {source.text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
