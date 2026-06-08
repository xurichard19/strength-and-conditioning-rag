import { type ReactNode, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

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

    if (window.sessionStorage.getItem('shingo-password-recovery') === 'true') {
      setIsPasswordRecovery(true)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.sessionStorage.setItem('shingo-password-recovery', 'true')
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

  const signIn = async (email: string, password: string) => {
    setIsSubmitting(true)
    resetFeedback()

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const signUp = async (email: string, password: string) => {
    setIsSubmitting(true)
    resetFeedback()

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })

      if (signUpError) throw signUpError

      if (!data.session) {
        setMessage(
          'If this email is eligible, a confirmation link will arrive shortly. If you already have an account, sign in.',
        )
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not create your account.')
    } finally {
      setIsSubmitting(false)
    }
  }

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

  const requestPasswordReset = async (email: string) => {
    setIsSubmitting(true)
    resetFeedback()

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })

      if (resetError) throw resetError

      setMessage('If this email has an account, a password reset link will arrive shortly.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not send reset instructions.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updatePassword = async (password: string) => {
    setIsSubmitting(true)
    resetFeedback()

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) throw updateError

      window.sessionStorage.removeItem('shingo-password-recovery')
      setIsPasswordRecovery(false)
      setMessage('Password updated. Please sign in with your new password.')
      await supabase.auth.signOut()
      setSession(null)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not update your password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.sessionStorage.removeItem('shingo-password-recovery')
    setIsPasswordRecovery(false)
    setSession(null)
  }

  const handleUnauthorized = () => {
    void supabase.auth.signOut()
    window.sessionStorage.removeItem('shingo-password-recovery')
    setIsPasswordRecovery(false)
    setSession(null)
    setError('Your session expired. Please sign in again.')
  }

  return (
    <AuthContext.Provider
      value={{
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
