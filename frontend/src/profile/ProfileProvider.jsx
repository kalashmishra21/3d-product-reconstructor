import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ensureProfile, saveProfile } from '../lib/profile.js'

const ProfileContext = createContext(null)

export function ProfileProvider({ user, children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshProfile = useCallback(async () => {
    const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || ''
    const value = await ensureProfile(user.id, name)
    setProfile(value)
    setError('')
    return value
  }, [user.id, user.user_metadata])

  const saveDisplayName = useCallback(async (name) => {
    const updated = await saveProfile(user.id, { display_name: name })
    setProfile(updated)
    setError('')
    return updated
  }, [user.id])

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

  const value = useMemo(() => ({ profile, loading, error, setProfile, refreshProfile, saveDisplayName }),
    [profile, loading, error, refreshProfile, saveDisplayName])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('Profile provider is missing')
  return value
}
