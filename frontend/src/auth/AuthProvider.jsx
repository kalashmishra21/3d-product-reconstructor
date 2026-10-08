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
    let checkVersion = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'INITIAL_SESSION') return
      authVersion += 1
      setUser(session?.user ?? null)
    })
    const initialVersion = authVersion
    const initialCheck = ++checkVersion
    getCurrentUser()
      .then((currentUser) => { if (active && authVersion === initialVersion && checkVersion === initialCheck) setUser(currentUser) })
      .catch(() => { if (active && authVersion === initialVersion && checkVersion === initialCheck) setUser(null) })
      .finally(() => { if (active) setReady(true) })
    const verifyOnReturn = () => {
      if (document.visibilityState === 'hidden') return
      const observedAuthVersion = authVersion
      const observedCheck = ++checkVersion
      getCurrentUser()
        .then((currentUser) => {
          if (active && authVersion === observedAuthVersion && checkVersion === observedCheck) setUser(currentUser)
        })
        .catch(() => { /* A temporary verification outage must not sign out a known user. */ })
    }
    window.addEventListener('focus', verifyOnReturn)
    document.addEventListener('visibilitychange', verifyOnReturn)
    return () => {
      active = false
      window.removeEventListener('focus', verifyOnReturn)
      document.removeEventListener('visibilitychange', verifyOnReturn)
      subscription.unsubscribe()
    }
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
