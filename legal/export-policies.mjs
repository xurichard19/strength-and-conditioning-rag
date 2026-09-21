import { writeFile } from 'node:fs/promises'
import { legalContent } from '../client/src/pages/legal-content.ts'

// Node 24 strips the content module's TypeScript types. Keep review copies in sync.
for (const [page, content] of Object.entries(legalContent)) {
  const blocks = [
    `# ${content.title}`,
    `> ${content.status}`,
    content.updated,
    content.summary,
    ...content.sections.flatMap(section => [
      `## ${section.heading}`,
      section.body,
      section.bullets?.map(bullet => `- ${bullet}`).join('\n'),
      section.links?.map(link => {
        const target = link.href.startsWith('/') ? `./${link.href.slice(1)}.md` : link.href
        return `- [${link.label}](${target})`
      }).join('\n'),
    ]),
  ]
  await writeFile(new URL(`./${page}.md`, import.meta.url), `${blocks.filter(Boolean).join('\n\n')}\n`)
}
