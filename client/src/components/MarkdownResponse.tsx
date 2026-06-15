import { InlineMarkdown } from './InlineMarkdown'

type MarkdownResponseProps = {
  content: string
}

export function MarkdownResponse({ content }: MarkdownResponseProps) {
  const lines = content.split('\n').filter((line) => line.trim())

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
