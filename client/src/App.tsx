import { type ReactNode, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import './App.css'

import { AuthForm } from './components/AuthForm'
import { QueryPanel } from './components/QueryPanel'
import { supabase } from './lib/supabase'

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center">
        <header className="mb-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
            Strength & conditioning research assistant
          </p>
          <h1 className="m-0 text-5xl font-semibold tracking-normal text-[var(--text-h)] sm:text-6xl">
            Shingo
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-h)]">
            Ask a training question and get an evidence-backed answer from the document library.
          </p>
        </header>

        {children}
      </main>
    </div>
  )
}

function App() {
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadSession = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession()

        if (!currentSession) {
          if (isMounted) setSession(null)
          return
        }

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (error || !user) {
          await supabase.auth.signOut()
          if (isMounted) setSession(null)
          return
        }

        if (isMounted) setSession(currentSession)
      } catch (error) {
        if (isMounted) {
          setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
        }
      } finally {
        if (isMounted) setIsAuthLoading(false)
      }
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSignIn = async (email: string, password: string) => {
    setIsAuthSubmitting(true)
    setAuthError('')
    setAuthMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not sign in.')
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleSignUp = async (email: string, password: string) => {
    setIsAuthSubmitting(true)
    setAuthError('')
    setAuthMessage('')

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })

      if (error) throw error

      if (!data.session) {
        setAuthMessage(
          'If this email is eligible, a confirmation link will arrive shortly. If you already have an account, sign in.',
        )
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not create your account.')
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsAuthSubmitting(true)
    setAuthError('')
    setAuthMessage('')

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) throw error
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not start Google sign-in.')
      setIsAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  if (isAuthLoading) {
    return (
      <AppShell>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
          <p className="leading-7 text-[var(--text-h)]">Checking authentication...</p>
        </section>
      </AppShell>
    )
  }

  return (
    <AppShell>
      {session ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text)]">
            <span>{session.user.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-[var(--border)] px-4 py-2 font-semibold text-[var(--text-h)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Sign out
            </button>
          </div>
          <QueryPanel accessToken={session.access_token} />
        </>
      ) : (
        <AuthForm
          error={authError}
          isLoading={isAuthSubmitting}
          message={authMessage}
          onGoogleSignIn={handleGoogleSignIn}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
      )}
    </AppShell>
  )
}

export default App
