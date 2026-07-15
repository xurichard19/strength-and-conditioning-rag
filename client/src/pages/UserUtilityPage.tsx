import {
  Bookmark,
  CircleHelp,
  History,
  MessageSquareText,
  Search,
  Settings,
} from 'lucide-react'

import { Button, EmptyState, PageHeader, Panel } from '../components/ui'
import type { Page } from '../types'

type UtilityPage = Extract<Page, 'saved' | 'activity' | 'help'>

type UserUtilityPageProps = {
  page: UtilityPage
  onNavigate: (page: Page) => void
}

const pageDetails = {
  saved: {
    eyebrow: 'Your library',
    icon: Bookmark,
    title: 'Saved research',
    description: 'Keep useful evidence and training answers close at hand.',
  },
  activity: {
    eyebrow: 'Account history',
    icon: History,
    title: 'Activity',
    description: 'Review the questions, plans, and account actions you have made in Arcel.',
  },
  help: {
    eyebrow: 'Support',
    icon: CircleHelp,
    title: 'Help & support',
    description: 'Find answers and get assistance with your account or training workspace.',
  },
} satisfies Record<UtilityPage, {
  eyebrow: string
  icon: typeof Bookmark
  title: string
  description: string
}>

export function UserUtilityPage({ page, onNavigate }: UserUtilityPageProps) {
  const details = pageDetails[page]

  return (
    <main className="app-page app-page-narrow">
      <PageHeader
        eyebrow={details.eyebrow}
        icon={details.icon}
        title={details.title}
        description={details.description}
      />

      {page === 'saved' && (
        <Panel>
          <EmptyState
            icon={Bookmark}
            title="Your library is ready"
            description="Saved research answers and source documents will appear here once bookmarking is available."
          />
          <div className="flex justify-center border-t border-[var(--border)] p-4">
            <Button icon={Search} onClick={() => onNavigate('chat')}>Explore research</Button>
          </div>
        </Panel>
      )}

      {page === 'activity' && (
        <Panel>
          <EmptyState
            icon={History}
            title="No recent activity"
            description="Your research questions, generated plans, and important account events will be collected here."
          />
          <div className="flex justify-center border-t border-[var(--border)] p-4">
            <Button icon={MessageSquareText} onClick={() => onNavigate('chat')}>Ask a question</Button>
          </div>
        </Panel>
      )}

      {page === 'help' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onNavigate('about')}
            className="panel panel-interactive min-h-44 p-5 text-left"
          >
            <CircleHelp aria-hidden="true" size={21} className="text-[var(--accent)]" />
            <h2 className="mt-8 text-lg font-semibold text-[var(--text-h)]">About Arcel</h2>
            <p className="mt-2 text-sm leading-6">Learn how the research assistant works and which technologies power it.</p>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="panel panel-interactive min-h-44 p-5 text-left"
          >
            <Settings aria-hidden="true" size={21} className="text-[var(--accent)]" />
            <h2 className="mt-8 text-lg font-semibold text-[var(--text-h)]">Account help</h2>
            <p className="mt-2 text-sm leading-6">Review your account details and training profile settings.</p>
          </button>
          <Panel className="p-5 sm:col-span-2">
            <p className="text-sm font-semibold text-[var(--text-h)]">Contact support</p>
            <p className="mt-2 text-sm leading-6">Direct support and feedback tools will be available here in a future update.</p>
          </Panel>
        </div>
      )}
    </main>
  )
}
