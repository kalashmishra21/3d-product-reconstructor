import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace, WorkspaceAvatar } from '../dashboard/WorkspaceLayout'
import { useProfile } from '../profile/ProfileProvider.jsx'
import { useReconstructionJob } from '../jobs/ReconstructionJobProvider.jsx'
import { getProfileStats, listRecentReconstructions } from '../lib/reconstructions.js'

export default function Profile() {
  const { user, profile, pending, onLogout } = useWorkspace()
  const { profile: savedProfile, loading, error, saveDisplayName, replaceAvatar, removeAvatar } = useProfile()
  const { state: job } = useReconstructionJob()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarInput = useRef(null)
  const [activity, setActivity] = useState({ loading: true, error: '', stats: null, recent: [] })
  const completedJob = ['completed', 'low_volume', 'failed'].includes(job.phase) ? `${job.id}:${job.phase}` : ''
  useEffect(() => {
    let active = true
    setActivity((current) => ({ ...current, loading: true, error: '' }))
    Promise.all([getProfileStats(user.id), listRecentReconstructions(user.id, 3)])
      .then(([stats, recent]) => { if (active) setActivity({ loading: false, error: '', stats, recent }) })
      .catch(() => { if (active) setActivity({ loading: false, error: 'Could not load your reconstruction activity.', stats: null, recent: [] }) })
    return () => { active = false }
  }, [user.id, completedJob])
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

  async function chooseAvatar(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarBusy(true)
    setMessage('')
    try {
      const result = await replaceAvatar(file)
      setMessage(result.cleanupWarning ? 'Photo saved. The previous photo could not be cleaned up.' : 'Profile photo saved.')
    } catch (cause) { setMessage(cause?.message || 'Could not save profile photo.') }
    finally { setAvatarBusy(false) }
  }
  async function clearAvatar() {
    setAvatarBusy(true)
    setMessage('')
    try { await removeAvatar(); setMessage('Profile photo removed.') }
    catch { setMessage('Could not remove profile photo. Try again.') }
    finally { setAvatarBusy(false) }
  }

  return <section className="workspace-page" aria-labelledby="profile-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">YOUR WORKSPACE IDENTITY</p><h1 id="profile-title">Your profile<span className="text-olive">.</span></h1><p>Private profile details alongside your authenticated account.</p></div></div>
    <div className="profile-layout">
      <section className="profile-identity"><WorkspaceAvatar key={profile.avatar} profile={profile} /><h2>{profile.label}</h2><p>Connected to Reconstruct</p><div className="profile-avatar-actions"><input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profile photo file" onChange={chooseAvatar} hidden /><button type="button" disabled={avatarBusy} onClick={() => avatarInput.current?.click()}>{avatarBusy ? 'Saving photo…' : savedProfile?.avatar_path ? 'Change photo' : 'Add photo'}</button>{savedProfile?.avatar_path && <button type="button" disabled={avatarBusy} onClick={clearAvatar}>Remove photo</button>}</div><p className="profile-avatar-note">JPEG, PNG or WebP · up to 3 MB</p><button type="button" className="button secondary" disabled={pending} onClick={onLogout}>{pending ? 'Signing out…' : 'Sign out'}</button></section>
      <section aria-label="Account details">
        {loading && <p role="status" className="profile-message">Loading your private profile…</p>}
        {error && <p role="alert" className="profile-message">{error}</p>}
        <dl className="profile-details">{[['Display name',profile.name || 'Not provided'],['Email',profile.email || 'Not available'],['Sign-in provider',provider],['Account created',created]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className="profile-edit-section"><div className="profile-edit-heading"><div><p className="dash-kicker">EDIT PROFILE</p><h2>Make this workspace yours.</h2></div>{!editing && <button type="button" className="profile-edit-button" onClick={beginEdit}>Edit display name</button>}</div>
          {editing && <form onSubmit={save} className="profile-edit-form"><label htmlFor="profile-display-name">Display name</label><input id="profile-display-name" type="text" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} autoComplete="nickname" /><div><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button type="button" disabled={saving} onClick={cancelEdit}>Cancel</button></div></form>}
          <p className="profile-message" role={message.startsWith('Could not') ? 'alert' : 'status'} aria-live="polite">{message}</p>
        </div>
        <section className="profile-activity" aria-labelledby="profile-activity-title"><p className="dash-kicker">YOUR ACTIVITY</p><h2 id="profile-activity-title">Reconstruction record</h2>
          {activity.loading && <p role="status" className="profile-message">Loading activity…</p>}
          {activity.error && <p role="alert" className="profile-message">{activity.error}</p>}
          {!activity.loading && !activity.error && <><div className="profile-statistics">{[['Total reconstructions',activity.stats.total],['Completed',activity.stats.completed],['Low volume',activity.stats.lowVolume],['Failed',activity.stats.failed]].map(([label,count]) => <div key={label}><span>{label}</span><strong>{count.toLocaleString()}</strong></div>)}</div>
            <div className="profile-recent"><div className="profile-recent-heading"><h3>Recent activity</h3><Link to="/history">View history</Link></div>{activity.recent.length ? <ul>{activity.recent.map((row) => <li key={row.id}><Link to={`/reconstructions/${row.id}`}><span>{row.object_name || row.source_filename || 'Untitled reconstruction'}</span><small>{row.status?.replaceAll('_', ' ') || 'Processing'}</small></Link></li>)}</ul> : <p>No saved reconstructions yet.</p>}</div>
          </>}
        </section>
      </section>
    </div>
  </section>
}
