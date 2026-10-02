import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../lib/useMediaQuery'

const TopologyScene = lazy(() => import('./TopologyScene'))

function StaticForm() {
  return <svg className="dash-static-form" viewBox="0 0 240 240" fill="none" aria-hidden="true"><g stroke="currentColor" opacity=".6"><path d="m120 23 83 49v96l-83 49-83-49V72z M37 72l83 48 83-48M120 120v97M120 23v97M37 168l83-48 83 48" /><path d="m120 48 62 36v72l-62 36-62-36V84z M58 84l62 36 62-36M58 156l62-36 62 36" /></g></svg>
}

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <StaticForm /> : this.props.children }
}

export function TopologyStudy() {
  const [stage, setStage] = useState('Wireframe')
  const [load, setLoad] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [inView, setInView] = useState(true)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const compact = useMediaQuery('(max-width: 767px)')
  const region = useRef(null)
  const pointer = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const task = window.setTimeout(() => setLoad(true), 180)
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(region.current)
    return () => { window.clearTimeout(task); observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  const animate = visible && inView && !reduced
  return <div className="dash-study" ref={region} data-motion={animate ? 'subtle' : 'paused'}>
    <div className="dash-study-label"><span>TOPOLOGY STUDY / 002</span><span>ILLUSTRATIVE</span></div>
    <div className="dash-canvas" aria-hidden="true" onPointerEnter={() => setHovered(true)} onPointerLeave={() => { setHovered(false); pointer.current = { x: 0, y: 0 } }} onPointerMove={(event) => {
      if (reduced) return
      const bounds = event.currentTarget.getBoundingClientRect()
      pointer.current = { x: (event.clientX - bounds.left) / bounds.width - 0.5, y: (event.clientY - bounds.top) / bounds.height - 0.5 }
    }}>
      {load ? <SceneBoundary><Suspense fallback={<StaticForm />}><TopologyScene compact={compact} stage={stage} animate={animate} pointer={pointer} hovered={hovered} /></Suspense></SceneBoundary> : <StaticForm />}
    </div>
    <div className="dash-study-controls" role="group" aria-label="Illustrative topology display">
      {['Vertices', 'Wireframe', 'Surface'].map((value) => <button type="button" key={value} aria-pressed={stage === value} onClick={() => setStage(value)}>{value}</button>)}
    </div>
    <p className="dash-study-note">Procedural form study · not a reconstruction result</p>
  </div>
}
