import './App.css'

import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { AppShell } from './components/AppShell'
import { AuthForm } from './components/AuthForm'
import { QueryPanel } from './components/QueryPanel'

function AppContent() {
  const auth = useAuth()

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
    <AppShell>
      {auth.session ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text)]">
            <span>{auth.session.user.email}</span>
            <button
              type="button"
              onClick={auth.signOut}
              className="rounded-md border border-[var(--border)] px-4 py-2 font-semibold text-[var(--text-h)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Sign out
            </button>
          </div>
          <QueryPanel
            accessToken={auth.session.access_token}
            onUnauthorized={auth.handleUnauthorized}
          />
        </>
      ) : (
        <AuthForm
          error={auth.error}
          isLoading={auth.isSubmitting}
          message={auth.message}
          onGoogleSignIn={auth.signInWithGoogle}
          onSignIn={auth.signIn}
          onSignUp={auth.signUp}
        />
      )}
    </AppShell>
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
