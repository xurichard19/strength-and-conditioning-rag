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

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  const handleUnauthorized = () => {
    void supabase.auth.signOut()
    setSession(null)
    setError('Your session expired. Please sign in again.')
  }

  return (
    <AuthContext.Provider
      value={{
        error,
        handleUnauthorized,
        isLoading,
        isSubmitting,
        message,
        session,
        signIn,
        signInWithGoogle,
        signOut,
        signUp,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
