import { useEffect, useId, useRef, useState } from 'react'
import { BookOpenText, FileText, X } from 'lucide-react'

import type { Source } from '../types'

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
        className="icon-button relative"
      >
        <FileText aria-hidden="true" size={18} />
        <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded bg-[var(--accent)] px-1 text-[0.625rem] font-bold leading-none text-[#160a20]">
          {sources.length > 9 ? '9+' : sources.length}
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false)
          }}
        >
          <section
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${panelId}-title`}
            className="panel panel-raised flex max-h-[min(44rem,calc(100vh-3rem))] w-full max-w-3xl flex-col overflow-hidden text-left"
          >
            <header className="flex shrink-0 items-center justify-between gap-5 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--accent-bg)] text-[var(--accent)]">
                  <BookOpenText aria-hidden="true" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="page-eyebrow mb-0">Answer evidence</p>
                  <h3 id={`${panelId}-title`} className="mt-1 text-lg font-semibold">Sources</h3>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs font-medium text-[var(--text-muted)] sm:inline">
                  {sources.length} {sources.length === 1 ? 'passage' : 'passages'}
                </span>
                <button ref={closeButtonRef} type="button" aria-label="Close research sources" title="Close research sources" onClick={() => setIsOpen(false)} className="icon-button">
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
              {sources.map((source, index) => (
                <article key={source.doi ?? source.url ?? index} className="grid gap-3 border-b border-[var(--border)] py-5 last:border-b-0 sm:grid-cols-[2.25rem_minmax(0,1fr)]">
                  <span className="font-mono text-xs font-bold text-[var(--accent)]">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <h4 className="break-words text-sm font-semibold leading-5">{source.title ?? `${source.source_type === 'research' ? 'Research' : 'Web'} source ${index + 1}`}</h4>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-[var(--text-muted)]">
                      <span className="capitalize">{source.source_type}</span>
                      {source.doi && (
                        <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer" className="break-all text-[var(--accent)] hover:underline">
                          DOI {source.doi}
                        </a>
                      )}
                      {source.url && (
                        <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-[var(--accent)] hover:underline">
                          Open source
                        </a>
                      )}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">{source.content}</p>
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
