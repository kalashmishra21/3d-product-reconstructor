import { useState } from 'react'
import { useWorkspace, WorkspaceAvatar } from '../dashboard/WorkspaceLayout'
import { useProfile } from '../profile/ProfileProvider.jsx'

export default function Profile() {
  const { user, profile, pending, onLogout } = useWorkspace()
  const { loading, error, saveDisplayName } = useProfile()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const providers = [...new Set((user?.identities ?? []).map(item => item.provider).filter(value => typeof value === 'string'))]
  if (!providers.length && typeof user?.app_metadata?.provider === 'string') providers.push(user.app_metadata.provider)
  const provider = providers.map(value => value === 'google' ? 'Google' : value === 'email' ? 'Email / password' : value).join(', ') || 'Not available'
  const date = user?.created_at ? new Date(user.created_at) : null
  const created = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date) : 'Not available'

  function beginEdit() { setDraft(profile.name); setMessage(''); setEditing(true) }
  function cancelEdit() { setEditing(false); setDraft(profile.name); setMessage('') }
  async function save(event) {
    event.preventDefault()
    if (draft.trim().length > 80) { setMessage('Use no more than 80 characters.'); return }
    setSaving(true)
    setMessage('')
    try {
      await saveDisplayName(draft)
      setEditing(false)
      setMessage('Display name saved.')
    } catch { setMessage('Could not save your display name. Try again.') }
    finally { setSaving(false) }
  }

  return <section className="workspace-page" aria-labelledby="profile-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">YOUR WORKSPACE IDENTITY</p><h1 id="profile-title">Your profile<span className="text-olive">.</span></h1><p>Private profile details alongside your authenticated account.</p></div></div>
    <div className="profile-layout">
      <section className="profile-identity"><WorkspaceAvatar key={profile.avatar} profile={profile} /><h2>{profile.label}</h2><p>Connected to Reconstruct</p><button type="button" className="button secondary" disabled={pending} onClick={onLogout}>{pending ? 'Signing out…' : 'Sign out'}</button></section>
      <section aria-label="Account details">
        {loading && <p role="status" className="profile-message">Loading your private profile…</p>}
        {error && <p role="alert" className="profile-message">{error}</p>}
        <dl className="profile-details">{[['Display name',profile.name || 'Not provided'],['Email',profile.email || 'Not available'],['Sign-in provider',provider],['Account created',created]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className="profile-edit-section"><div className="profile-edit-heading"><div><p className="dash-kicker">EDIT PROFILE</p><h2>Make this workspace yours.</h2></div>{!editing && <button type="button" className="profile-edit-button" onClick={beginEdit}>Edit display name</button>}</div>
          {editing && <form onSubmit={save} className="profile-edit-form"><label htmlFor="profile-display-name">Display name</label><input id="profile-display-name" type="text" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} autoComplete="nickname" /><div><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button type="button" disabled={saving} onClick={cancelEdit}>Cancel</button></div></form>}
          <p className="profile-message" role={message.startsWith('Could not') ? 'alert' : 'status'} aria-live="polite">{message}</p>
        </div>
        <div className="profile-statistics"><div><span>Saved reconstructions</span><strong>—</strong></div><div><span>Recent activity</span><strong>—</strong></div></div>
      </section>
    </div>
  </section>
}
