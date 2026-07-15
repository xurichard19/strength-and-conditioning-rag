import { useEffect, useRef, useState } from 'react'
import {
  Bookmark,
  CalendarDays,
  CircleHelp,
  Dumbbell,
  Home,
  History,
  LogIn,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'

import userIcon from '../assets/user-icon.png'
import { classes } from '../lib/classes'
import type { Page } from '../types'
import { BrandMark } from './BrandMark'
import { IconButton } from './ui'

type AppNavProps = {
  currentPage: Page
  userEmail?: string | null
  onNavigate: (page: Page) => void
  onLogin?: () => void
  onSignOut?: () => void
}

type NavItem = {
  icon: LucideIcon
  label: string
  page: Page
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', page: 'home' },
  { icon: MessageSquareText, label: 'Research', page: 'chat' },
  { icon: Dumbbell, label: 'Plan', page: 'plan' },
  { icon: CalendarDays, label: 'Calendar', page: 'calendar' },
]

export function AppNav({ currentPage, userEmail, onNavigate, onLogin, onSignOut }: AppNavProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const isAuthenticated = Boolean(onSignOut)

  useEffect(() => {
    if (!isUserMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isUserMenuOpen])

  const navigate = (page: Page) => {
    onNavigate(page)
    setIsMobileMenuOpen(false)
    setIsUserMenuOpen(false)
  }

  const handleSignOut = () => {
    setIsMobileMenuOpen(false)
    setIsUserMenuOpen(false)
    onSignOut?.()
  }

  const renderNavItem = ({ icon: Icon, label, page }: NavItem, mobile = false) => {
    const isActive = currentPage === page

    return (
      <button
        key={page}
        type="button"
        onClick={() => navigate(page)}
        aria-current={isActive ? 'page' : undefined}
        className={classes(
          'flex items-center gap-2 rounded-md text-sm font-semibold transition',
          mobile ? 'w-full px-3 py-3 text-left' : 'px-3 py-2',
          isActive
            ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
            : 'text-[var(--text)] hover:bg-[var(--surface)] hover:text-[var(--text-h)]',
        )}
      >
        <Icon aria-hidden="true" size={17} strokeWidth={2} />
        {label}
      </button>
    )
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:rgba(13,14,18,0.92)] px-4 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-5">
        <button
          type="button"
          onClick={() => navigate('home')}
          className="group flex items-center gap-2.5 text-left"
          aria-label="Go to Arcel home"
        >
          <BrandMark />
          <span className="text-base font-semibold text-[var(--text-h)]">Arcel</span>
        </button>

        {isAuthenticated && (
          <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => renderNavItem(item))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              aria-label="Open user menu"
              aria-expanded={isUserMenuOpen}
              onClick={() => setIsUserMenuOpen((open) => !open)}
              className={classes(
                'grid h-10 w-10 place-items-center overflow-hidden rounded-md border bg-[var(--surface)] transition',
                isUserMenuOpen
                  ? 'border-[var(--accent-border)] ring-4 ring-[var(--accent-bg)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              )}
            >
              <img src={userIcon} alt="" className="user-icon-image h-7 w-7 object-cover" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2 text-left shadow-[var(--shadow)]">
                {userEmail && (
                  <div className="border-b border-[var(--border)] px-3 py-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">Signed in as</p>
                    <p className="mt-1 truncate text-sm font-medium text-[var(--text-h)]">{userEmail}</p>
                  </div>
                )}
                {isAuthenticated ? (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => navigate('saved')}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]"
                    >
                      <Bookmark aria-hidden="true" size={17} />
                      Saved research
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('activity')}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]"
                    >
                      <History aria-hidden="true" size={17} />
                      Activity
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('settings')}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]"
                    >
                      <Settings aria-hidden="true" size={17} />
                      Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('help')}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]"
                    >
                      <CircleHelp aria-hidden="true" size={17} />
                      Help &amp; support
                    </button>
                    <div className="my-2 border-t border-[var(--border)]" />
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                    >
                      <LogOut aria-hidden="true" size={17} />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onLogin?.()}
                    className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]"
                  >
                    <LogIn aria-hidden="true" size={17} />
                    Log in
                  </button>
                )}
              </div>
            )}
          </div>

          {isAuthenticated && (
            <div className="md:hidden">
              <IconButton
                icon={isMobileMenuOpen ? X : Menu}
                label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen((open) => !open)}
              />
            </div>
          )}
        </div>
      </div>

      {isAuthenticated && isMobileMenuOpen && (
        <nav aria-label="Mobile navigation" className="mx-auto grid max-w-7xl gap-1 border-t border-[var(--border)] py-3 md:hidden">
          {navItems.map((item) => renderNavItem(item, true))}
          {renderNavItem({ icon: Settings, label: 'Settings', page: 'settings' }, true)}
        </nav>
      )}
    </header>
  )
}
