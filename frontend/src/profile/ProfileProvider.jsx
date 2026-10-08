import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ensureProfile, saveProfile } from '../lib/profile.js'
import { signedImageUrl } from '../lib/storage.js'
import { replaceAvatar as replacePrivateAvatar, removeAvatar as removePrivateAvatar } from './avatar.js'

const ProfileContext = createContext(null)

export function ProfileProvider({ user, children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  const refreshProfile = useCallback(async () => {
    const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || ''
    const value = await ensureProfile(user.id, name)
    setProfile(value)
    if (value?.avatar_path) setAvatarUrl(await signedImageUrl('avatars', value.avatar_path).catch(() => ''))
    else setAvatarUrl('')
    setError('')
    return value
  }, [user.id, user.user_metadata])

  const saveDisplayName = useCallback(async (name) => {
    const updated = await saveProfile(user.id, { display_name: name })
    setProfile(updated)
    setError('')
    return updated
  }, [user.id])

  const replaceAvatar = useCallback(async (file) => {
    const result = await replacePrivateAvatar(user.id, file, profile?.avatar_path)
    setProfile(result.profile)
    setAvatarUrl(result.avatarUrl)
    return result
  }, [user.id, profile?.avatar_path])

  const removeAvatar = useCallback(async () => {
    const updated = await removePrivateAvatar(user.id, profile?.avatar_path)
    setProfile(updated)
    setAvatarUrl('')
    return updated
  }, [user.id, profile?.avatar_path])

  useEffect(() => {
    let active = true
    setLoading(true)
    const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || ''
    ensureProfile(user.id, name).then(async (value) => {
      if (active) { setProfile(value); setError('') }
      const url = value?.avatar_path ? await signedImageUrl('avatars', value.avatar_path).catch(() => '') : ''
      if (active) setAvatarUrl(url)
    }).catch(() => {
      if (active) setError('Profile details are temporarily unavailable.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!profile?.avatar_path) return undefined
    let active = true
    const timer = window.setInterval(() => {
      signedImageUrl('avatars', profile.avatar_path).then((url) => {
        if (active) setAvatarUrl(url)
      }).catch(() => {})
    }, 90_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [profile?.avatar_path])

  const value = useMemo(() => ({ profile, avatarUrl, loading, error, setProfile, refreshProfile, saveDisplayName, replaceAvatar, removeAvatar }),
    [profile, avatarUrl, loading, error, refreshProfile, saveDisplayName, replaceAvatar, removeAvatar])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('Profile provider is missing')
  return value
}
