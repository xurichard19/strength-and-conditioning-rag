import './App.css'

import { useEffect, useState } from 'react'

import { ApiRequestError } from './api/errors'
import { completeOnboarding, getProfile, updateProfile } from './api/profile'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { AppFooter } from './components/AppFooter'
import { AppNav } from './components/AppNav'
import { AppShell } from './components/AppShell'
import { AuthForm } from './components/AuthForm'
import { FloatingChatWidget } from './components/FloatingChatWidget'
import { UpdatePasswordForm } from './components/UpdatePasswordForm'
import { Button, Panel } from './components/ui'
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
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0)

  const sessionUserId = auth.session?.user.id
  const sessionAccessToken = auth.session?.access_token
  const handleUnauthorized = auth.handleUnauthorized
  const profile = loadedProfile && loadedProfile.userId === sessionUserId ? loadedProfile.profile : null
  const hasUsableProfile = Boolean(profile)
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
        if (loadError instanceof ApiRequestError && loadError.status === 401) {
          handleUnauthorized()
          return
        }
        setProfileFailure({
          message: loadError instanceof Error ? loadError.message : 'Could not load your profile.',
          userId: sessionUserId,
        })
      })

    return () => {
      isCurrent = false
    }
  }, [handleUnauthorized, profileLoadAttempt, sessionAccessToken, sessionUserId])

  useEffect(() => {
    if (
      !auth.session ||
      auth.isPasswordRecovery ||
      isInfoPage(currentPage) ||
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
  }, [auth.isPasswordRecovery, auth.session, currentPage, profile])

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
    try {
      const updatedProfile = await updateProfile(access, update)
      setLoadedProfile({ profile: updatedProfile, userId: access.userId })
      return updatedProfile
    } catch (updateError) {
      if (updateError instanceof ApiRequestError && updateError.status === 401) {
        handleUnauthorized()
      }
      throw updateError
    }
  }

  const handleOnboardingComplete = async () => {
    const access = getProfileAccess()
    try {
      const completedProfile = await completeOnboarding(access)
      setLoadedProfile({ profile: completedProfile, userId: access.userId })
      navigate('home')
      return completedProfile
    } catch (completionError) {
      if (completionError instanceof ApiRequestError && completionError.status === 401) {
        handleUnauthorized()
      }
      throw completionError
    }
  }

  const isPublicInfoPage = isInfoPage(currentPage)
  const isProfilePending = !hasUsableProfile && !profileError && Boolean(sessionUserId)
  const isProfileUnavailable = !hasUsableProfile && Boolean(profileError)
  const renderedPage = currentPage === 'onboarding' ? 'home' : currentPage

  if (auth.isLoading) {
    return (
      <AppShell>
        <Panel className="p-5">
          <p className="leading-7 text-[var(--text-h)]">Checking authentication...</p>
        </Panel>
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
          <Panel className="p-5">
            <p className="leading-7 text-[var(--text-h)]">Loading your profile...</p>
          </Panel>
        </AppShell>
      ) : auth.session && !isPublicInfoPage && isProfileUnavailable ? (
        <AppShell>
          <Panel className="p-5">
            <h2 className="m-0 text-xl font-semibold text-[var(--text-h)]">Profile unavailable</h2>
            <p role="alert" className="feedback-error mt-3">
              {profileError}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setProfileFailure(null)
                  setProfileLoadAttempt((attempt) => attempt + 1)
                }}
              >
                Try again
              </Button>
              <Button
                variant="secondary"
                onClick={() => void auth.signOut()}
              >
                Sign out
              </Button>
            </div>
          </Panel>
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
            {renderedPage === 'settings' && profile && (
              <SettingsPage
                profile={profile}
                userEmail={auth.session.user.email}
                onUpdate={handleProfileUpdate}
              />
            )}
            {isInfoPage(renderedPage) && <InfoPage page={renderedPage} />}
          </div>
          <AppFooter onNavigate={navigate} />
          {renderedPage !== 'chat' && (
            <FloatingChatWidget
              accessToken={auth.session.access_token}
              onUnauthorized={auth.handleUnauthorized}
            />
          )}
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
