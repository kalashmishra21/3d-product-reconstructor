const text = (value) => typeof value === 'string' ? value.trim() : ''

// Metadata is presentation only; authorization stays in the existing auth guard.
export function dashboardProfile(user, savedProfile = null, signedAvatarUrl = '') {
  const metadata = user?.user_metadata ?? {}
  const email = text(user?.email)
  const name = text(savedProfile?.display_name) || text(metadata.display_name) || text(metadata.full_name) || text(metadata.name)
    || email.split('@')[0].replace(/[._-]+/g, ' ')
  const label = name || 'Your account'
  let avatar = ''
  try {
    const url = new URL(text(signedAvatarUrl) || text(metadata.avatar_url) || text(metadata.picture))
    if (url.protocol === 'https:') avatar = url.href
  } catch { /* Initials provide the fallback. */ }
  return { name, label, email, avatar, initials: label.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase() }
}
