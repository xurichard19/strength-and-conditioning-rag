type MarkdownResponseProps = {
  content: string
}

function InlineMarkdown({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>
  ))
}

export function MarkdownResponse({ content }: MarkdownResponseProps) {
  const lines = content.split('\n').filter((line) => line.trim())

  return (
    <div className="space-y-4 text-[0.96rem] leading-7 text-[var(--text-h)]">
      {lines.map((line, index) => {
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/)
        const bulletMatch = line.match(/^[-*]\s+(.*)$/)

        if (numberedMatch) {
          return (
            <div key={index} className="flex gap-3">
              <span className="min-w-6 font-semibold text-[var(--accent)]">{numberedMatch[1]}.</span>
              <p><InlineMarkdown text={numberedMatch[2]} /></p>
            </div>
          )
        }

        if (bulletMatch) {
          return (
            <div key={index} className="flex gap-3 pl-2 sm:pl-5">
              <span aria-hidden="true" className="text-[var(--accent)]">{"\u2022"}</span>
              <p><InlineMarkdown text={bulletMatch[1]} /></p>
            </div>
          )
        }

        return <p key={index}><InlineMarkdown text={line} /></p>
      })}
    </div>
  )
}
