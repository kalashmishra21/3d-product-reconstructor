import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Arrow, Mark } from './Icons'
import { BackendStatus } from './BackendStatus'

export function Header({ health }) {
  return <header className="site-header">
    <Link to="/" className="brand" aria-label="Reconstruct home"><Mark /><span>reconstruct<span className="brand-period">.</span></span></Link>
    <nav aria-label="Main navigation"><Link to="/#process">The process</Link><Link to="/#status">Project status</Link><Link to="/login">Sign in</Link></nav>
    <div className="header-end"><BackendStatus health={health} /><Link className="header-explore" to="/#geometry">Explore 3D <Arrow diagonal /></Link></div>
  </header>
}

export function Footer() {
  return <footer className="site-footer"><Link to="/" className="footer-brand"><Mark />Reconstruct</Link><p>3D Object Reconstruction from Images</p><span>A study in pixels, points &amp; perspective.</span></footer>
}

export function RouteEffects() {
  const { pathname, hash } = useLocation()
  const previousPath = useRef(pathname)
  useEffect(() => {
    const titles = {
      '/': 'Reconstruct — From image to form',
      '/login': 'Sign in — Reconstruct',
      '/signup': 'Create account — Reconstruct',
      '/forgot-password': 'Reset password — Reconstruct',
      '/reset-password': 'New password — Reconstruct',
      '/auth/callback': 'Completing sign-in — Reconstruct',
      '/dashboard': 'Workspace — Reconstruct',
    }
    document.title = titles[pathname] ?? 'Reconstruct — Coming next'
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else if (previousPath.current !== pathname) {
      window.scrollTo(0, 0)
      document.getElementById('main-content')?.focus({ preventScroll: true })
    }
    previousPath.current = pathname
  }, [pathname, hash])
  return null
}
