import { useWorkspace, WorkspaceAvatar } from '../dashboard/WorkspaceLayout'

export default function Profile() {
  const { user, profile, pending, onLogout } = useWorkspace()
  const providers = [...new Set((user?.identities ?? []).map(item => item.provider).filter(value => typeof value === 'string'))]
  if (!providers.length && typeof user?.app_metadata?.provider === 'string') providers.push(user.app_metadata.provider)
  const provider = providers.map(value => value === 'google' ? 'Google' : value === 'email' ? 'Email / password' : value).join(', ') || 'Not available'
  const date = user?.created_at ? new Date(user.created_at) : null
  const created = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date) : 'Not available'
  return <section className="workspace-page" aria-labelledby="profile-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">YOUR WORKSPACE IDENTITY</p><h1 id="profile-title">Your profile<span className="text-olive">.</span></h1><p>Account details from your authenticated Supabase session.</p></div></div>
    <div className="profile-layout"><section className="profile-identity"><WorkspaceAvatar key={profile.avatar} profile={profile} /><h2>{profile.label}</h2><p>Connected to Reconstruct</p><button type="button" className="button secondary" disabled={pending} onClick={onLogout}>{pending ? 'Signing out…' : 'Sign out'}</button></section><section aria-label="Account details"><dl className="profile-details">{[['Display name',profile.name || 'Not provided'],['Email',profile.email || 'Not available'],['Sign-in provider',provider],['Account created',created]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="profile-statistics"><div><span>Saved reconstructions</span><strong>—</strong></div><div><span>Recorded exports</span><strong>—</strong></div></div><p className="model-context">Counts will be available when reconstruction history is connected. Profile editing is not available yet.</p></section></div>
  </section>
}
