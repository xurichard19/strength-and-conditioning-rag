import type { Source } from "../types"

type InlineMarkdownProps = {
    text: string
}

type MarkdownResponseProps = {
    content: string
}

type SourceListProps = {
    sources: Source[]
}

function InlineMarkdown({ text }: InlineMarkdownProps) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)

    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index}>{part.slice(2, -2)}</strong>
        }

        return <span key={index}>{part}</span>
    })
}

export function MarkdownResponse({ content }: MarkdownResponseProps) {
    const lines = content.split("\n").filter((line) => line.trim())

    return (
        <div className="space-y-4 leading-7 text-[var(--text-h)]">
            {lines.map((line, index) => {
                const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/)
                const bulletMatch = line.match(/^[-*]\s+(.*)$/)

                if (numberedMatch) {
                    return (
                        <div key={index} className="flex gap-3">
                            <span className="min-w-6 font-semibold text-[var(--accent)]">
                                {numberedMatch[1]}.
                            </span>
                            <p className="m-0">
                                <InlineMarkdown text={numberedMatch[2]} />
                            </p>
                        </div>
                    )
                }

                if (bulletMatch) {
                    return (
                        <div key={index} className="flex gap-3 pl-9">
                            <span className="text-[var(--accent)]">•</span>
                            <p className="m-0">
                                <InlineMarkdown text={bulletMatch[1]} />
                            </p>
                        </div>
                    )
                }

                return (
                    <p key={index} className="m-0">
                        <InlineMarkdown text={line} />
                    </p>
                )
            })}
        </div>
    )
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
                            {source.page !== null && source.page !== undefined && (
                                <span>• page {source.page}</span>
                            )}
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
