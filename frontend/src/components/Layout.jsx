import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Arrow, Mark } from './Icons'
import { ThemeToggle } from '../theme/ThemeToggle.jsx'
import { routeRobotsContent } from '../seo/siteMetadata.js'

export function Header({ health, landing = false }) {
  return <header className={`site-header${landing ? ' site-header--landing' : ''}`}>
    <Link to="/" className="brand" aria-label="Reconstruct home"><Mark /><span>reconstruct<span className="brand-period">.</span></span></Link>
    <nav aria-label="Main navigation"><Link to="/#process">The process</Link><Link to="/#status">Project status</Link><Link to="/login">Sign in</Link></nav>
    <div className={`header-end${landing ? ' header-end--landing' : ''}`}>
      {landing && <span className="landing-liquid-surface" data-landing-liquid-surface data-liquid-state="pending" data-liquid-backend="css" aria-hidden="true" />}
      <div className="header-end-content" data-liquid-ignore={landing ? '' : undefined}><ThemeToggle /><Link className="header-explore" to="/dashboard">Enter studio <Arrow diagonal /></Link></div>
    </div>
  </header>
}

export function Footer() {
  return <footer className="site-footer"><Link to="/" className="footer-brand"><Mark />Reconstruct</Link><p>3D Object Reconstruction from Images</p><a className="owner-credit" href="https://github.com/kalashmishra21" target="_blank" rel="noopener noreferrer">Project by Kalash Mishra</a></footer>
}

export function RouteEffects() {
  const { pathname, hash } = useLocation()
  const previousPath = useRef(pathname)
  useEffect(() => {
    document.querySelector('meta[name="robots"]')?.setAttribute('content', routeRobotsContent(pathname))
    const titles = {
      '/': 'Reconstruct — From image to form',
      '/login': 'Sign in — Reconstruct',
      '/signup': 'Create account — Reconstruct',
      '/forgot-password': 'Reset password — Reconstruct',
      '/reset-password': 'New password — Reconstruct',
      '/auth/callback': 'Completing sign-in — Reconstruct',
      '/dashboard': 'Workspace — Reconstruct',
      '/reconstruct': 'New reconstruction — Reconstruct',
      '/history': 'History — Reconstruct',
      '/model': 'Model baseline — Reconstruct',
      '/profile': 'Your profile — Reconstruct',
    }
    document.title = titles[pathname] ?? (/^\/(?:reconstructions|result)\//.test(pathname) ? 'Result detail — Reconstruct' : 'Reconstruct — Page not found')
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else if (previousPath.current !== pathname) {
      window.scrollTo(0, 0)
      document.getElementById('main-content')?.focus({ preventScroll: true })
    }
    previousPath.current = pathname
  }, [pathname, hash])
  return null
}
