import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Arrow, Mark } from '../components/Icons'
import { BackendStatus } from '../components/BackendStatus'
import { DashboardIcon as Icon } from './DashboardIcon'
import { TopologyStudy } from './TopologyStudy'
import { dashboardProfile } from './profile.js'
import './dashboard.css'

const navigation = [
  { label: 'Overview', icon: 'overview', hash: '#overview' },
  { label: 'New Reconstruction', icon: 'plus', to: '/reconstruct' },
  { label: 'History', icon: 'history', hash: '#recent' },
  { label: 'Model', icon: 'model', hash: '#model' },
  { label: 'Profile', icon: 'profile', hash: '#profile' },
]
const metrics = [['Chamfer Distance', '0.037181'], ['F1 @ tau', '0.000640'], ['F1 @ 2tau', '0.001722']]

function Avatar({ profile }) {
  const [failed, setFailed] = useState(false)
  return <span className="dash-avatar" aria-hidden="true">
    {profile.avatar && !failed ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : profile.initials}
  </span>
}

function SidebarContent({ profile, health, pending, onLogout, onNavigate }) {
  const { hash } = useLocation()
  return <>
    <Link className="dash-brand" to="/" aria-label="Reconstruct home"><Mark /><span className="dash-nav-label">reconstruct<span className="text-olive">.</span></span></Link>
    <p className="dash-sidebar-caption dash-nav-label">IMAGE / STRUCTURE / FORM</p>
    <nav className="dash-navigation" aria-label="Workspace navigation">
      {navigation.map((item) => {
        const active = item.hash === (hash || '#overview')
        return <Link key={item.label} to={item.to ?? '/dashboard' + item.hash} title={item.label} aria-label={item.label} aria-current={active ? 'location' : undefined} onClick={onNavigate}>
          <Icon name={item.icon} /><span className="dash-nav-label">{item.label}</span>{active && <span className="dash-active-dot" />}
        </Link>
      })}
    </nav>
    <div className="dash-sidebar-bottom">
      <div className="dash-sidebar-health dash-nav-label"><BackendStatus health={health} /><span>Inference integration pending</span></div>
      <Link className="dash-sidebar-user" to="/dashboard#profile" onClick={onNavigate} aria-label="Your profile"><Avatar key={profile.avatar} profile={profile} /><span className="dash-nav-label"><strong>{profile.label}</strong><span>Your workspace</span></span></Link>
      <button className="dash-signout" type="button" disabled={pending} onClick={onLogout} aria-label="Sign out"><Icon name="logout" /><span className="dash-nav-label">{pending ? 'Signing out…' : 'Sign out'}</span></button>
    </div>
  </>
}

function ProfileMenu({ profile, pending, onLogout }) {
  const disclosure = useRef(null)
  useEffect(() => {
    const close = (event) => { if (!disclosure.current?.contains(event.target)) disclosure.current?.removeAttribute('open') }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return <details className="dash-profile-menu" ref={disclosure} onKeyDown={(event) => {
    if (event.key === 'Escape') { disclosure.current.removeAttribute('open'); disclosure.current.querySelector('summary').focus() }
  }}>
    <summary aria-label="Account options"><Avatar key={profile.avatar} profile={profile} /><Icon name="chevron" /></summary>
    <div className="dash-profile-popover">
      <strong>{profile.label}</strong>{profile.email && <p>{profile.email}</p>}
      <Link to="/dashboard#profile" onClick={() => disclosure.current.removeAttribute('open')}><Icon name="profile" />Profile</Link>
      <button type="button" disabled={pending} onClick={onLogout}><Icon name="logout" />{pending ? 'Signing out…' : 'Sign out'}</button>
    </div>
  </details>
}

export function Dashboard({ user, health, pending, error, onLogout }) {
  const profile = dashboardProfile(user)
  const drawer = useRef(null)
  const menuButton = useRef(null)
  const closeDrawer = () => drawer.current?.close()
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (media.matches) drawer.current?.close() }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])
  const sidebarProps = { profile, health, pending, onLogout }
  return <div className="dash-layout">
    <aside className="dash-sidebar"><SidebarContent {...sidebarProps} /></aside>
    <dialog id="dashboard-navigation-drawer" ref={drawer} className="dash-drawer" aria-label="Workspace navigation" onClose={() => menuButton.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) closeDrawer() }}>
      <button className="dash-drawer-close" type="button" aria-label="Close navigation" onClick={closeDrawer}><Icon name="close" /></button>
      <SidebarContent {...sidebarProps} onNavigate={closeDrawer} />
    </dialog>
    <main id="main-content" className="dash-main" tabIndex={-1}>
      <header className="dash-header" id="overview">
        <div className="dash-header-copy">
          <p className="dash-kicker">WORKSPACE / OVERVIEW</p>
          <h1 id="dashboard-title">Welcome back{profile.name ? <>, <span>{profile.name}</span></> : ''}.</h1>
          <p>A place to give your images another dimension.</p>
        </div>
        <div className="dash-header-controls">
          <div className="dash-header-health"><BackendStatus health={health} /></div>
          <ProfileMenu profile={profile} pending={pending} onLogout={onLogout} />
          <button ref={menuButton} className="dash-mobile-menu" type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-controls="dashboard-navigation-drawer" onClick={() => drawer.current.showModal()}><Icon name="menu" /></button>
        </div>
      </header>
      {error && <p className="dash-error" role="alert">{error}</p>}

      <section className="dash-command" aria-labelledby="command-title">
        <div className="dash-command-copy">
          <p className="dash-kicker"><span className="dash-small-square" />FROM A SINGLE VIEW</p>
          <h2 id="command-title">Make room for<br /><em>another dimension.</em></h2>
          <p>Your next object starts with an image. Explore the path from pixels to a mesh you can turn, inspect, and understand.</p>
          <Link className="button primary" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link>
          <span className="dash-coming-note">Image preflight is ready. Mesh generation comes next.</span>
          <div className="dash-process" aria-label="Planned reconstruction pipeline"><span><Icon name="image" />Image</span><Arrow /><span><Icon name="model" />Mesh</span><Arrow /><span>3D result</span></div>
        </div>
        <TopologyStudy />
      </section>

      <nav className="dash-quick-actions" aria-label="Quick actions">
        <Link to="/reconstruct"><Icon name="plus" /><span>New Reconstruction</span><Arrow diagonal /></Link>
        <Link to="/dashboard#recent"><Icon name="history" /><span>View History</span><Arrow diagonal /></Link>
        <Link to="/dashboard#model"><Icon name="model" /><span>Model Information</span><Arrow diagonal /></Link>
      </nav>

      <div className="dash-lower-grid">
        <section className="dash-recent" id="recent" aria-labelledby="recent-title">
          <div className="dash-section-heading"><div><p className="dash-kicker">YOUR COLLECTION</p><h2 id="recent-title">Recent reconstructions</h2></div><Icon name="history" /></div>
          <div className="dash-empty">
            <div className="dash-empty-drawing" aria-hidden="true"><Icon name="model" /></div>
            <h3>No reconstructions yet.</h3>
            <p>Your completed meshes will appear here.<br />Reconstruction and history integration are coming next.</p>
            <Link className="dash-text-link" to="/reconstruct">Start reconstruction <Arrow diagonal /></Link>
          </div>
        </section>
        <section className="dash-model" id="model" aria-labelledby="model-title">
          <div className="dash-section-heading"><div><p className="dash-kicker">THE RECONSTRUCTION MODEL</p><h2 id="model-title">Pixel2Mesh</h2></div><span className="dash-model-badge">TRAINED</span></div>
          <dl className="dash-model-specs"><div><dt>Final stage</dt><dd>Stage 3</dd></div><div><dt>Vertices</dt><dd>2466</dd></div><div><dt>Faces</dt><dd>4928</dd></div></dl>
          <p className="dash-metrics-heading">TEST-SET EVALUATION METRICS</p>
          <dl className="dash-metrics">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className="dash-metric-note">Raw evaluation metrics, not accuracy percentages.</p>
          <div className="dash-categories"><Icon name="model" /><span>13 trained object categories</span></div>
        </section>
      </div>

      <section className="dash-system" aria-label="System status">
        <span className="dash-kicker">SYSTEM STATUS</span>
        <dl><div><dt>Frontend</dt><dd>Ready</dd></div><div><dt>Backend API</dt><dd><BackendStatus health={health} /><button type="button" onClick={health.retry} disabled={health.state === 'loading'} aria-label="Recheck backend connection">Retry</button></dd></div><div><dt>Authentication</dt><dd>Supabase</dd></div><div><dt>Inference</dt><dd className="dash-pending">Integration pending</dd></div></dl>
      </section>

      <section className="dash-account" id="profile" aria-labelledby="profile-title">
        <div className="dash-account-identity"><Avatar key={profile.avatar} profile={profile} /><div><h2 id="profile-title">{profile.label}</h2><p>{profile.email || 'Email not available'}</p></div></div>
        <span>Connected through Supabase · profile editing coming later</span>
      </section>
      <footer className="dash-footer"><span>RECONSTRUCT / IMAGE TO FORM</span><Link to="/">Back to the experience <Arrow diagonal /></Link></footer>
    </main>
  </div>
}
