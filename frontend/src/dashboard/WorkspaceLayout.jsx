import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Mark } from '../components/Icons'
import { DashboardIcon as Icon } from './DashboardIcon'
import { dashboardProfile } from './profile'
import { useProfile } from '../profile/ProfileProvider.jsx'
import { GlobalJobStatus } from './GlobalJobStatus.jsx'
import Profile from '../pages/Profile.jsx'
import './dashboard.css'

const WorkspaceContext = createContext(null)
export const useWorkspace = () => useContext(WorkspaceContext)
const navigation = [
  ['/dashboard', 'Overview', 'overview'], ['/reconstruct', 'New Reconstruction', 'plus'],
  ['/history', 'History', 'history'], ['/model', 'Model', 'model'],
]
const contexts = { '/dashboard': 'Overview', '/reconstruct': 'New reconstruction', '/history': 'History', '/model': 'Model baseline' }

export function WorkspaceAvatar({ profile }) {
  const [failed, setFailed] = useState(false)
  return <span className="dash-avatar" aria-hidden="true">{profile.avatar && !failed
    ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : profile.initials}</span>
}
const SIDEBAR_KEY = 'reconstruct.sidebar.collapsed'

function Navigation({ onNavigate, collapsed, onCollapse }) {
  return <>
    <div className="dash-brand-row"><Link className="dash-brand" to="/dashboard" aria-label="Reconstruct overview" title="Reconstruct overview"><Mark /><span className="dash-brand-name dash-nav-label">reconstruct<span className="text-olive">.</span></span></Link>
      {onCollapse && <button className="dash-sidebar-collapse" type="button" onClick={onCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name="chevron" /></button>}
    </div>
    <p className="dash-sidebar-caption dash-nav-label">SINGLE IMAGE / THREE DIMENSIONS</p>
    <nav className="dash-navigation" aria-label="Workspace navigation">{navigation.map(([to, label, icon]) =>
      <NavLink key={to} to={to} end title={label} aria-label={label} onClick={onNavigate}><Icon name={icon} /><span className="dash-nav-label">{label}</span></NavLink>)}</nav>
  </>
}
export function WorkspaceLayout({ user, health, pending, error, onLogout, children }) {
  const { pathname } = useLocation()
  const { profile: savedProfile, avatarUrl } = useProfile()
  const profile = dashboardProfile(user, savedProfile, avatarUrl)
  const drawer = useRef(null)
  const trigger = useRef(null)
  const account = useRef(null)
  const profileDialog = useRef(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem(SIDEBAR_KEY) === 'true' } catch { return false }
  })
  const toggleSidebar = () => setSidebarCollapsed((previous) => {
    const next = !previous
    try { window.localStorage.setItem(SIDEBAR_KEY, String(next)) } catch { /* Preference is optional. */ }
    return next
  })
  const closeDrawer = () => drawer.current?.close()
  const closeProfile = () => profileDialog.current?.close()
  const openProfile = () => { account.current?.removeAttribute('open'); profileDialog.current?.showModal() }
  useEffect(() => { closeDrawer(); account.current?.removeAttribute('open') }, [pathname])
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const close = () => { if (media.matches) closeDrawer() }
    const outside = (event) => { if (!account.current?.contains(event.target)) account.current?.removeAttribute('open') }
    media.addEventListener('change', close)
    document.addEventListener('pointerdown', outside)
    return () => { media.removeEventListener('change', close); document.removeEventListener('pointerdown', outside) }
  }, [])
  const shared = { user, profile, health, pending, onLogout }
  return <WorkspaceContext.Provider value={shared}><div className={'dash-layout' + (sidebarCollapsed ? ' is-sidebar-collapsed' : '')}>
    <aside className="dash-sidebar"><Navigation collapsed={sidebarCollapsed} onCollapse={toggleSidebar} />
      <div className="dash-sidebar-bottom">
        <button type="button" className="dash-sidebar-user" onClick={openProfile} aria-label={`Open profile for ${profile.label}`} title={`Open profile for ${profile.label}`}><WorkspaceAvatar key={profile.avatar} profile={profile} /><span className="dash-nav-label"><strong>{profile.label}</strong><span>{profile.email}</span></span></button>
        <button type="button" className="dash-signout" onClick={onLogout} disabled={pending} aria-label="Sign out" title="Sign out"><Icon name="logout" /><span className="dash-nav-label">{pending ? 'Signing out…' : 'Sign out'}</span></button>
      </div>
    </aside>
    <dialog ref={drawer} id="workspace-drawer" className="dash-drawer" aria-label="Workspace navigation" onClose={() => trigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) closeDrawer() }}>
      <button className="dash-drawer-close" aria-label="Close navigation" onClick={closeDrawer}><Icon name="close" /></button><Navigation {...shared} onNavigate={closeDrawer} />
    </dialog>
    <main id="main-content" className="dash-main" tabIndex={-1}>
      <header className="dash-header">
        <div className="dash-header-copy"><p className="dash-kicker">WORKSPACE <span aria-hidden="true">/</span> {contexts[pathname] || 'Result detail'}</p>
          {pathname === '/dashboard' && <><h1 id="dashboard-title">Welcome back{profile.name ? <>, <span>{profile.name}</span></> : ''}.</h1><p>One image. A new perspective to inspect.</p></>}
        </div>
        <div className="dash-header-controls"><GlobalJobStatus />
          <details ref={account} className="dash-profile-menu" onKeyDown={(event) => { if (event.key === 'Escape') { account.current.removeAttribute('open'); account.current.querySelector('summary').focus() } }}>
            <summary aria-label="Account options"><WorkspaceAvatar key={profile.avatar} profile={profile} /><Icon name="chevron" /></summary>
            <div className="dash-profile-popover"><strong>{profile.label}</strong><p>{profile.email}</p><button type="button" onClick={openProfile}>Your profile</button><button type="button" disabled={pending} onClick={onLogout}>{pending ? 'Signing out…' : 'Sign out'}</button></div>
          </details>
          <button ref={trigger} className="dash-mobile-menu" aria-label="Open navigation" aria-haspopup="dialog" aria-controls="workspace-drawer" onClick={() => drawer.current.showModal()}><Icon name="menu" /></button>
        </div>
      </header>
      {error && <p className="dash-error" role="alert">{error}</p>}
      {children}
      <footer className="dash-footer"><span>RECONSTRUCT / IMAGE TO FORM</span><Link to="/model">Pixel2Mesh · integration checkpoint</Link></footer>
    </main>
    <dialog ref={profileDialog} className="profile-dialog" aria-labelledby="profile-title" onClose={() => account.current?.querySelector('summary')?.focus()} onClick={(event) => { if (event.target === event.currentTarget) closeProfile() }}>
      <button type="button" className="profile-dialog-close" aria-label="Close profile" onClick={closeProfile}><Icon name="close" /></button>
      <Profile key={user.id} user={user} profile={profile} />
    </dialog>
  </div></WorkspaceContext.Provider>
}
