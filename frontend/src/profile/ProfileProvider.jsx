import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ensureProfile } from '../lib/profile.js'

const ProfileContext = createContext(null)

export function ProfileProvider({ user, children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || ''
    ensureProfile(user.id, name).then((value) => {
      if (active) { setProfile(value); setError('') }
    }).catch(() => {
      if (active) setError('Profile details are temporarily unavailable.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user])

  const value = useMemo(() => ({ profile, loading, error, setProfile }), [profile, loading, error])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('Profile provider is missing')
  return value
}
