import type { Source } from '../types/query'

type SourceListProps = {
  sources: Source[]
}

export function SourceList({ sources }: SourceListProps) {
  if (!sources.length) return null

  return (
    <div className="mt-8 border-t border-[var(--border)] pt-5">
      <h3 className="m-0 text-base font-semibold text-[var(--text-h)]">Sources</h3>
      <div className="mt-4 space-y-4">
        {sources.map((source, index) => (
          <article
            key={source.id ?? index}
            className="rounded-md border border-[var(--border)] bg-[var(--social-bg)] p-4"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text-h)]">
              <span>Chunk {index + 1}</span>
              {source.source && <span>• {source.source}</span>}
              {source.page !== null && source.page !== undefined && <span>• page {source.page}</span>}
              {source.id && <span>• id {source.id}</span>}
            </div>
            <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">
              {source.text}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
