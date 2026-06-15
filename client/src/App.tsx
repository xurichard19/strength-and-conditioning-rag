import './App.css'

import { useState } from 'react'

import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { AppNav } from './components/AppNav'
import { AppShell } from './components/AppShell'
import { AuthForm } from './components/AuthForm'
import { UpdatePasswordForm } from './components/UpdatePasswordForm'
import { ChatPage } from './pages/ChatPage'
import { HomePage } from './pages/HomePage'
import { PlanPage } from './pages/PlanPage'
import type { Page } from './types'

function AppContent() {
  const auth = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>('home')

  if (auth.isLoading) {
    return (
      <AppShell>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
          <p className="leading-7 text-[var(--text-h)]">Checking authentication...</p>
        </section>
      </AppShell>
    )
  }

  return (
    <>
      {auth.isPasswordRecovery ? (
        <AppShell>
          <UpdatePasswordForm
            error={auth.error}
            isLoading={auth.isSubmitting}
            message={auth.message}
            onSubmit={auth.updatePassword}
          />
        </AppShell>
      ) : auth.session ? (
        <div className="min-h-screen bg-[var(--bg)]">
          <AppNav currentPage={currentPage} onNavigate={setCurrentPage} />
          <div className="mx-auto flex max-w-5xl justify-end px-4 pt-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text)]">
              <span>{auth.session.user.email}</span>
              <button
                type="button"
                onClick={auth.signOut}
                className="rounded-md border border-[var(--border)] px-4 py-2 font-semibold text-[var(--text-h)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Sign out
              </button>
            </div>
          </div>
          {currentPage === 'home' && <HomePage onNavigate={setCurrentPage} />}
          {currentPage === 'chat' && (
            <ChatPage
              accessToken={auth.session.access_token}
              onUnauthorized={auth.handleUnauthorized}
            />
          )}
          {currentPage === 'plan' && (
            <PlanPage
              accessToken={auth.session.access_token}
              onUnauthorized={auth.handleUnauthorized}
            />
          )}
        </div>
      ) : (
        <AppShell>
          <AuthForm
            error={auth.error}
            isLoading={auth.isSubmitting}
            message={auth.message}
            onClearFeedback={auth.clearFeedback}
            onGoogleSignIn={auth.signInWithGoogle}
            onPasswordReset={auth.requestPasswordReset}
            onSignIn={auth.signIn}
            onSignUp={auth.signUp}
          />
        </AppShell>
      )}
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
