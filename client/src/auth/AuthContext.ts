import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthContextValue = {
  error: string
  isPasswordRecovery: boolean
  isLoading: boolean
  isSubmitting: boolean
  message: string
  session: Session | null
  clearFeedback: () => void
  handleUnauthorized: () => void
  requestPasswordReset: (email: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
