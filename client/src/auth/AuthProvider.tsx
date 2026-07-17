import { type ReactNode, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { createProfile } from '../api/profile'
import { supabase } from '../lib/supabase'
import { AuthContext } from './AuthContext'

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
          await supabase.auth.signOut()
          if (isMounted) setSession(null)
          return
        }

        if (isMounted) setSession(currentSession)
      } catch (authError) {
        if (isMounted) {
          setError(authError instanceof Error ? authError.message : 'Authentication failed.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadSession()

    if (window.sessionStorage.getItem('arcel-password-recovery') === 'true') {
      setIsPasswordRecovery(true)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.sessionStorage.setItem('arcel-password-recovery', 'true')
        setIsPasswordRecovery(true)
        resetFeedback()
      }

      setSession(currentSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const resetFeedback = () => {
    setError('')
    setMessage('')
  }

  const submit = async (action: () => Promise<void>, fallback: string) => {
    setIsSubmitting(true)
    resetFeedback()
    try {
      await action()
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : fallback)
    } finally {
      setIsSubmitting(false)
    }
  }

  const signIn = (email: string, password: string) => submit(
    async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
    },
    'Could not sign in.',
  )

  const signUp = (email: string, password: string) => submit(
    async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })

      if (error) throw error
      if (data.session) {
        await createProfile(data.session.access_token)
      } else {
        setMessage(
          'If this email is eligible, a confirmation link will arrive shortly. If you already have an account, sign in.',
        )
      }
    },
    'Could not create your account.',
  )

  const signInWithGoogle = async () => {
    setIsSubmitting(true)
    resetFeedback()

    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (googleError) throw googleError
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not start Google sign-in.')
      setIsSubmitting(false)
    }
  }

  const requestPasswordReset = (email: string) => submit(
    async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      setMessage('If this email has an account, a password reset link will arrive shortly.')
    },
    'Could not send reset instructions.',
  )

  const updatePassword = (password: string) => submit(
    async () => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      window.sessionStorage.removeItem('arcel-password-recovery')
      setIsPasswordRecovery(false)
      setMessage('Password updated. Please sign in with your new password.')
      await supabase.auth.signOut()
      setSession(null)
    },
    'Could not update your password.',
  )

  const signOut = async () => {
    await supabase.auth.signOut()
    window.sessionStorage.removeItem('arcel-password-recovery')
    setIsPasswordRecovery(false)
    setSession(null)
  }

  const handleUnauthorized = () => {
    void supabase.auth.signOut()
    window.sessionStorage.removeItem('arcel-password-recovery')
    setIsPasswordRecovery(false)
    setSession(null)
    setError('Your session expired. Please sign in again.')
  }

  return (
    <AuthContext.Provider
      value={{
        clearFeedback: resetFeedback,
        error,
        handleUnauthorized,
        isPasswordRecovery,
        isLoading,
        isSubmitting,
        message,
        requestPasswordReset,
        session,
        signIn,
        signInWithGoogle,
        signOut,
        signUp,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
