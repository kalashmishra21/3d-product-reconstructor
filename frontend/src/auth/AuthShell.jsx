import { Component, lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow, Mark } from '../components/Icons'
import { useMediaQuery } from '../lib/useMediaQuery'
import '../styles/auth.css'

const AuthScene = lazy(() => import('./AuthScene'))

const stories = {
  login: { index: '01', label: 'RETURN TO YOUR SPACE', title: 'Perspective begins with a single view.', detail: 'Step inside the space where pixels become points, and points become form.' },
  signup: { index: '02', label: 'MAKE SPACE FOR FORM', title: 'See beyond the image.', detail: 'Create your space for exploring single-image 3D reconstruction.' },
  forgot: { index: '03', label: 'FIND YOUR WAY BACK', title: 'Every form has a way through.', detail: 'A secure reset link will bring you back to your workspace.' },
  reset: { index: '04', label: 'A NEW START', title: 'Pick up where you left off.', detail: 'Set a new password, then return to your workspace.' },
  callback: { index: '05', label: 'CONNECTING THE POINTS', title: 'A moment between states.', detail: 'Your sign-in is being completed securely.' },
}

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

function AuthBackdrop() {
  const [load, setLoad] = useState(false)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const compact = useMediaQuery('(max-width: 767px)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    let task
    if ('requestIdleCallback' in window) task = window.requestIdleCallback(() => setLoad(true), { timeout: 1200 })
    else task = window.setTimeout(() => setLoad(true), 50)
    return () => {
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(task)
      else window.clearTimeout(task)
    }
  }, [])

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return <div className="auth-scene-layer" aria-hidden="true">
    {load && <SceneBoundary><Suspense fallback={null}><AuthScene compact={compact} reducedMotion={reducedMotion} visible={visible} /></Suspense></SceneBoundary>}
  </div>
}

export function AuthShell({ mode, wide = false, children }) {
  const story = stories[mode] ?? stories.login
  return <div className="auth-page">
    <AuthBackdrop />
    <div className="auth-grid-overlay" aria-hidden="true" />
    <div className="auth-content site-wrap">
      <header className="auth-header">
        <Link to="/" className="brand" aria-label="Reconstruct home"><Mark /><span>reconstruct<span className="brand-period">.</span></span></Link>
        <Link className="auth-home-link" to="/">Back to the experience <Arrow diagonal /></Link>
      </header>
      <main id="main-content" tabIndex={-1} className={`auth-main${wide ? ' is-wide' : ''}`}>
        {!wide && <div className="auth-story">
          <p className="eyebrow"><span className="eyebrow-square" />{story.index} / {story.label}</p>
          <h1>{story.title}</h1>
          <p className="auth-story-detail">{story.detail}</p>
          <div className="auth-story-sequence" aria-hidden="true"><span>01 / IMAGE</span><span>02 / VERTICES</span><span>03 / MESH</span></div>
        </div>}
        <div className="auth-panel-wrap">{children}</div>
      </main>
      <footer className="auth-footer"><span>3D OBJECT RECONSTRUCTION FROM IMAGES</span><span>IMAGE / STRUCTURE / FORM</span></footer>
    </div>
  </div>
}
