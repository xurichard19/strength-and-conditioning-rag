import './App.css'

import { useEffect, useState } from 'react'

import { completeOnboarding, getProfile, updateProfile } from './api/profile'
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
import { OnboardingPage } from './pages/OnboardingPage'
import { PlanPage } from './pages/PlanPage'
import { SettingsPage } from './pages/SettingsPage'
import { getPageFromPath, getPathForPage, isInfoPage } from './routing'
import type { Page } from './types'
import type { Profile, ProfileAccess, ProfileUpdate } from './types/profile'

function AppContent() {
  const auth = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>(() => getPageFromPath(window.location.pathname))
  const [loadedProfile, setLoadedProfile] = useState<{ profile: Profile; userId: string } | null>(null)
  const [profileFailure, setProfileFailure] = useState<{ message: string; userId: string } | null>(null)
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0)

  const sessionUserId = auth.session?.user.id
  const sessionAccessToken = auth.session?.access_token
  const profile = loadedProfile && loadedProfile.userId === sessionUserId ? loadedProfile.profile : null
  const profileError =
    profileFailure && profileFailure.userId === sessionUserId ? profileFailure.message : ''

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getPageFromPath(window.location.pathname))
      window.scrollTo({ top: 0 })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!sessionUserId || !sessionAccessToken) {
      return
    }

    let isCurrent = true
    const access: ProfileAccess = {
      userId: sessionUserId,
      accessToken: sessionAccessToken,
    }

    void getProfile(access)
      .then((loadedProfile) => {
        if (!isCurrent) return
        setLoadedProfile({ profile: loadedProfile, userId: sessionUserId })
        setProfileFailure(null)
      })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        setProfileFailure({
          message: loadError instanceof Error ? loadError.message : 'Could not load your profile.',
          userId: sessionUserId,
        })
      })
      .finally(() => {
        if (isCurrent) setIsProfileLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [profileLoadAttempt, sessionAccessToken, sessionUserId])

  useEffect(() => {
    if (
      !auth.session ||
      auth.isPasswordRecovery ||
      isInfoPage(currentPage) ||
      isProfileLoading ||
      !profile
    ) {
      return
    }

    const nextPage: Page | null = !profile.onboarding_completed_at
      ? currentPage === 'onboarding'
        ? null
        : 'onboarding'
      : currentPage === 'onboarding'
        ? 'home'
        : null

    if (!nextPage) return

    window.history.replaceState(null, '', getPathForPage(nextPage))
    window.scrollTo({ top: 0 })
  }, [auth.isPasswordRecovery, auth.session, currentPage, isProfileLoading, profile])

  const navigate = (page: Page) => {
    const nextPath = getPathForPage(page)

    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }

    setCurrentPage(page)
    window.scrollTo({ top: 0 })
  }

  const getProfileAccess = (): ProfileAccess => {
    if (!auth.session) throw new Error('Your session expired. Please sign in again.')

    return {
      userId: auth.session.user.id,
      accessToken: auth.session.access_token,
    }
  }

  const handleProfileUpdate = async (update: ProfileUpdate) => {
    const access = getProfileAccess()
    const updatedProfile = await updateProfile(access, update)
    setLoadedProfile({ profile: updatedProfile, userId: access.userId })
    return updatedProfile
  }

  const handleOnboardingComplete = async () => {
    const access = getProfileAccess()
    const completedProfile = await completeOnboarding(access)
    setLoadedProfile({ profile: completedProfile, userId: access.userId })
    navigate('home')
    return completedProfile
  }

  const isPublicInfoPage = isInfoPage(currentPage)
  const isProfilePending = !profileError && (isProfileLoading || profile === null)
  const renderedPage = currentPage === 'onboarding' ? 'home' : currentPage

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
      ) : auth.session && !isPublicInfoPage && isProfilePending ? (
        <AppShell>
          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
            <p className="leading-7 text-[var(--text-h)]">Loading your profile...</p>
          </section>
        </AppShell>
      ) : auth.session && !isPublicInfoPage && profileError ? (
        <AppShell>
          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
            <h2 className="m-0 text-xl font-semibold text-[var(--text-h)]">Profile unavailable</h2>
            <p role="alert" className="mt-3 leading-7 text-red-700">
              {profileError}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setProfileFailure(null)
                  setIsProfileLoading(true)
                  setProfileLoadAttempt((attempt) => attempt + 1)
                }}
                className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => void auth.signOut()}
                className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-h)] transition hover:border-[var(--accent-border)]"
              >
                Sign out
              </button>
            </div>
          </section>
        </AppShell>
      ) : auth.session && !isPublicInfoPage && profile && !profile.onboarding_completed_at ? (
        <OnboardingPage
          key={auth.session.user.id}
          profile={profile}
          onComplete={handleOnboardingComplete}
          onSignOut={auth.signOut}
          onUpdate={handleProfileUpdate}
        />
      ) : auth.session ? (
        <div className="flex min-h-screen flex-col bg-[var(--bg)]">
          <AppNav
            currentPage={renderedPage}
            userEmail={auth.session.user.email}
            onNavigate={navigate}
            onSignOut={() => {
              void auth.signOut()
            }}
          />
          <div className="flex-1">
            {renderedPage === 'home' && <HomePage onNavigate={navigate} />}
            {renderedPage === 'chat' && (
              <ChatPage
                accessToken={auth.session.access_token}
                onUnauthorized={auth.handleUnauthorized}
              />
            )}
            {renderedPage === 'plan' && (
              <PlanPage
                accessToken={auth.session.access_token}
                onUnauthorized={auth.handleUnauthorized}
              />
            )}
            {renderedPage === 'calendar' && (
              <CalendarPage
                accessToken={auth.session.access_token}
                onUnauthorized={auth.handleUnauthorized}
              />
            )}
            {renderedPage === 'settings' && <SettingsPage userEmail={auth.session.user.email} />}
            {isInfoPage(renderedPage) && <InfoPage page={renderedPage} />}
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
