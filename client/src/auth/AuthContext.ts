import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthContextValue = {
  error: string
  isLoading: boolean
  isSubmitting: boolean
  message: string
  session: Session | null
  handleUnauthorized: () => void
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
