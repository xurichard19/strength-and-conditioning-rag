import './App.css'

import { useEffect, useState } from 'react'

import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { AppFooter } from './components/AppFooter'
import { AppNav } from './components/AppNav'
import { AppShell } from './components/AppShell'
import { AuthForm } from './components/AuthForm'
import { FloatingChatWidget } from './components/FloatingChatWidget'
import { UpdatePasswordForm } from './components/UpdatePasswordForm'
import { CalendarPage } from './pages/CalendarPage'
import { ChatPage } from './pages/ChatPage'
import { HomePage } from './pages/HomePage'
import { InfoPage } from './pages/InfoPage'
import { PlanPage } from './pages/PlanPage'
import { SettingsPage } from './pages/SettingsPage'
import { getPageFromPath, getPathForPage, isInfoPage } from './routing'
import type { Page } from './types'

function AppContent() {
  const auth = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>(() => getPageFromPath(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getPageFromPath(window.location.pathname))
      window.scrollTo({ top: 0 })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (page: Page) => {
    const nextPath = getPathForPage(page)

    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }

    setCurrentPage(page)
    window.scrollTo({ top: 0 })
  }

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
      {auth.isPasswordRecovery && !isInfoPage(currentPage) ? (
        <div className="flex min-h-screen flex-col bg-[var(--bg)]">
          <div className="flex-1">
            <AppShell>
              <UpdatePasswordForm
                error={auth.error}
                isLoading={auth.isSubmitting}
                message={auth.message}
                onSubmit={auth.updatePassword}
              />
            </AppShell>
          </div>
          <AppFooter onNavigate={navigate} />
        </div>
      ) : auth.session ? (
        <div className="flex min-h-screen flex-col bg-[var(--bg)]">
          <AppNav
            currentPage={currentPage}
            userEmail={auth.session.user.email}
            onNavigate={navigate}
            onSignOut={() => {
              void auth.signOut()
            }}
          />
          <div className="flex-1">
            {currentPage === 'home' && <HomePage onNavigate={navigate} />}
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
            {currentPage === 'calendar' && <CalendarPage />}
            {currentPage === 'settings' && <SettingsPage userEmail={auth.session.user.email} />}
            {isInfoPage(currentPage) && <InfoPage page={currentPage} />}
          </div>
          <AppFooter onNavigate={navigate} />
          <FloatingChatWidget
            accessToken={auth.session.access_token}
            onUnauthorized={auth.handleUnauthorized}
          />
        </div>
      ) : (
        <div className="flex min-h-screen flex-col bg-[var(--bg)]">
          <AppNav
            currentPage={currentPage}
            onNavigate={navigate}
            onLogin={() => navigate('home')}
          />
          <div className="flex-1">
            {isInfoPage(currentPage) ? (
              <InfoPage page={currentPage} />
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
          </div>
          <AppFooter onNavigate={navigate} />
        </div>
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
