import { useRef, useState } from 'react'
import { useProfile } from '../profile/ProfileProvider.jsx'

export default function Profile({ user, profile }) {
  const { profile: saved, loading, error, saveDisplayName, replaceAvatar, removeAvatar } = useProfile()
  const input = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [message, setMessage] = useState('')
  const providers = [...new Set((user?.identities ?? []).map((identity) => identity.provider).filter(Boolean))]
  if (!providers.length && user?.app_metadata?.provider) providers.push(user.app_metadata.provider)
  const provider = providers.map((value) => value === 'google' ? 'Google' : value === 'email' ? 'Email / password' : value).join(', ') || 'Not available'

  function beginEdit() { setDraft(profile.name); setMessage(''); setEditing(true) }
  function cancelEdit() { setEditing(false); setDraft(profile.name); setMessage('') }
  async function save(event) {
    event.preventDefault()
    if (draft.trim().length > 80) { setMessage('Use no more than 80 characters.'); return }
    setSaving(true); setMessage('')
    try { await saveDisplayName(draft); setEditing(false); setMessage('Display name saved.') }
    catch { setMessage('Could not save your display name. Try again.') }
    finally { setSaving(false) }
  }
  async function chooseAvatar(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarBusy(true); setMessage('')
    try {
      const result = await replaceAvatar(file)
      setMessage(result.cleanupWarning ? 'Photo saved. The previous photo could not be cleaned up.' : 'Profile photo saved.')
    } catch (cause) { setMessage(cause?.message || 'Could not save profile photo.') }
    finally { setAvatarBusy(false) }
  }
  async function clearAvatar() {
    setAvatarBusy(true); setMessage('')
    try { await removeAvatar(); setMessage('Profile photo removed.') }
    catch { setMessage('Could not remove profile photo. Try again.') }
    finally { setAvatarBusy(false) }
  }

  return <section className="profile-overlay-content" aria-labelledby="profile-title">
    <p className="dash-kicker">YOUR ACCOUNT</p><h2 id="profile-title">Your profile</h2>
    <div className="profile-identity-row">
      <label className="profile-avatar-trigger" title="Change photo">
        <span className="dash-avatar" aria-hidden="true">{profile.avatar ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" /> : profile.initials}</span>
        <span className="profile-avatar-hover">{avatarBusy ? 'Saving…' : 'Change photo'}</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Change profile photo" disabled={avatarBusy} onChange={chooseAvatar} />
      </label>
      <div className="profile-identity-copy"><strong>{profile.label}</strong></div>
    </div>
    {saved?.avatar_path && <button className="profile-remove-photo" type="button" disabled={avatarBusy} onClick={clearAvatar}>Remove photo</button>}
    <p className="profile-photo-note">JPEG, PNG or WebP · up to 3 MB</p>
    <dl className="profile-details"><div><dt>Email</dt><dd>{profile.email || 'Not available'}</dd></div><div><dt>Account type</dt><dd>{provider}</dd></div></dl>
    {loading && <p className="profile-message" role="status">Loading profile…</p>}
    {error && <p className="profile-message" role="alert">{error}</p>}
    {!editing ? <button className="profile-edit-button" type="button" onClick={beginEdit}>Edit profile</button> :
      <form className="profile-edit-form" onSubmit={save}><label htmlFor="profile-display-name">Display name</label><input id="profile-display-name" autoComplete="nickname" type="text" maxLength={80} value={draft} onChange={(event) => setDraft(event.target.value)} /><div><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button type="button" disabled={saving} onClick={cancelEdit}>Cancel</button></div></form>}
    <p className="profile-message" role={message.startsWith('Could not') ? 'alert' : 'status'} aria-live="polite">{message}</p>
  </section>
}
