import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authConfigured, getCurrentUser, supabase } from '../lib/auth'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(!authConfigured)
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let authVersion = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'INITIAL_SESSION') return
      authVersion += 1
      setUser(session?.user ?? null)
    })
    const initialVersion = authVersion
    getCurrentUser()
      .then((currentUser) => { if (active && authVersion === initialVersion) setUser(currentUser) })
      .catch(() => { if (active && authVersion === initialVersion) setUser(null) })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const refreshUser = useCallback(async () => {
    const currentUser = await getCurrentUser()
    setUser(currentUser)
    return currentUser
  }, [])
  const value = useMemo(() => ({ configured: authConfigured, ready, user, refreshUser }), [ready, user, refreshUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is required')
  return auth
}
