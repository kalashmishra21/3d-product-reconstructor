import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../lib/useMediaQuery'

const InputScene = lazy(() => import('./InputScene'))

function StaticStage({ previewUrl }) {
  return <div className="recon-static-stage" aria-hidden="true">
    {previewUrl ? <img src={previewUrl} alt="" /> : <svg viewBox="0 0 320 320" fill="none"><circle cx="160" cy="160" r="113" stroke="currentColor" opacity=".25" /><circle cx="160" cy="160" r="78" stroke="currentColor" opacity=".35" /><path d="m160 48 98 56v112l-98 56-98-56V104z M62 104l98 56 98-56M160 160v112M160 48v112M62 216l98-56 98 56" stroke="currentColor" /><circle cx="160" cy="48" r="3" fill="currentColor" /><circle cx="62" cy="104" r="3" fill="currentColor" /><circle cx="258" cy="104" r="3" fill="currentColor" /><circle cx="160" cy="160" r="3" fill="currentColor" /></svg>}
  </div>
}

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function InputViewport({ previewUrl, width, height, scanning }) {
  const [load, setLoad] = useState(false)
  const [inView, setInView] = useState(true)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const compact = useMediaQuery('(max-width: 767px)')
  const region = useRef(null)
  const pointer = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const task = window.setTimeout(() => setLoad(true), 150)
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    if (!('IntersectionObserver' in window)) return () => { window.clearTimeout(task); document.removeEventListener('visibilitychange', onVisibility) }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(region.current)
    return () => { window.clearTimeout(task); observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  const motion = visible && inView && !reduced
  const fallback = <StaticStage previewUrl={previewUrl} />
  return <div className="recon-viewport" ref={region} data-motion={motion ? 'subtle' : 'paused'}>
    <div className="recon-viewport-hud" aria-hidden="true"><span>XY / INPUT SPACE</span><span>{previewUrl ? `${width} × ${height}` : 'NO INPUT'}</span></div>
    <div className="recon-scene" aria-hidden="true" onPointerMove={(event) => {
      if (reduced) return
      const bounds = event.currentTarget.getBoundingClientRect()
      pointer.current = { x: (event.clientX - bounds.left) / bounds.width - 0.5, y: (event.clientY - bounds.top) / bounds.height - 0.5 }
    }} onPointerLeave={() => { pointer.current = { x: 0, y: 0 } }}>
      {load ? <SceneBoundary fallback={fallback}><Suspense fallback={fallback}><InputScene previewUrl={previewUrl} width={width} height={height} scanning={scanning} compact={compact} motion={motion} pointer={pointer} /></Suspense></SceneBoundary> : fallback}
    </div>
    <div className="recon-axis" aria-hidden="true"><span>Y</span><span>X</span></div>
    <div className="recon-viewport-bottom" aria-hidden="true"><span>+ RECONSTRUCTION STUDIO</span><span>{previewUrl ? 'DRAG TO INSPECT INPUT PLANE' : 'A SPATIAL GUIDE FOR YOUR IMAGE'}</span></div>
  </div>
}
