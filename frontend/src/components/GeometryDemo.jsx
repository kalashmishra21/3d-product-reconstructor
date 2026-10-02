import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { demoStages } from '../lib/demo'
import { useMediaQuery } from '../lib/useMediaQuery'
import { ChairDrawing } from './ChairDrawing'
import { Rotate } from './Icons'

const GeometryScene = lazy(() => import('../three/GeometryScene'))

function StaticFallback({ message }) {
  return <div className="static-scene"><ChairDrawing wire /><p>{message}</p></div>
}

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <StaticFallback message="3D is unavailable here. Explore the stages below with this static illustration." /> : this.props.children
  }
}

export function GeometryDemo() {
  const [stage, setStage] = useState(4)
  const [rotation, setRotation] = useState(0)
  const [sceneReady, setSceneReady] = useState(false)
  const viewport = useRef(null)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const finePointer = useMediaQuery('(pointer: fine)')
  const current = demoStages[stage]

  useEffect(() => {
    if (sceneReady || stage === 0) return
    let idleTask
    let scheduled = false
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || scheduled) return
      scheduled = true
      observer.disconnect()
      if ('requestIdleCallback' in window) {
        idleTask = window.requestIdleCallback(() => setSceneReady(true), { timeout: 1500 })
      } else {
        idleTask = window.setTimeout(() => setSceneReady(true), 50)
      }
    })
    observer.observe(viewport.current)
    return () => {
      observer.disconnect()
      if (idleTask !== undefined) {
        if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleTask)
        else window.clearTimeout(idleTask)
      }
    }
  }, [sceneReady, stage])

  return <section className="geometry-demo" id="geometry" aria-labelledby="geometry-heading">
    <div className="viewer-topline"><span><span className="tiny-cross" aria-hidden="true">+</span> FORM STUDY / 001</span><span className="viewer-live">INTERACTIVE 3D</span></div>
    <h2 id="geometry-heading" className="sr-only">Explore an illustrative chair mesh</h2>
    <div className="viewport" ref={viewport} role="group" aria-label="Illustrative chair. Select a stage or use the rotation buttons below. This is not model inference.">
      <div className="viewport-ruler" aria-hidden="true"><span>Y</span><span>01</span><span>02</span><span>03</span><span>04</span></div>
      {stage === 0 ? <div className="image-stage"><div className="image-paper"><ChairDrawing /><span>RGB / REFERENCE ILLUSTRATION</span></div></div> :
        <SceneBoundary><Suspense fallback={<StaticFallback message="Preparing the geometry…" />}>{sceneReady ? <GeometryScene stage={stage} rotation={rotation} reducedMotion={reducedMotion} finePointer={finePointer} /> : <StaticFallback message="Preparing the geometry…" />}</Suspense></SceneBoundary>}
      <div className="viewport-caption"><span>0{stage + 1} / {current.label.toUpperCase()}</span><span>{stage === 0 ? 'A flat reference' : finePointer ? 'Drag to inspect' : 'Use arrows to rotate'}</span></div>
      <div className="axis-mark" aria-hidden="true"><span>Y</span><span>X</span><span>Z</span></div>
    </div>
    <div className="viewer-controls">
      <div className="stage-selector" role="group" aria-label="Visualization stages">
        {demoStages.map((item, index) => <button key={item.label} type="button" className={index === stage ? 'selected' : ''} aria-pressed={index === stage} onClick={() => setStage(index)}><span className="stage-number">0{index + 1}</span>{item.label}</button>)}
      </div>
      <div className="rotation-controls" role="group" aria-label="Rotate the illustrative object"><button type="button" aria-label="Rotate object left" disabled={stage === 0} onClick={() => setRotation((angle) => angle - Math.PI / 6)}><Rotate reverse /></button><button type="button" aria-label="Rotate object right" disabled={stage === 0} onClick={() => setRotation((angle) => angle + Math.PI / 6)}><Rotate /></button></div>
    </div>
    <div className="stage-explanation" aria-live="polite"><strong>{current.name}</strong><p>{current.description}</p></div>
    <p className="demo-disclaimer"><span aria-hidden="true">↳</span> Illustrative geometry. Not a Pixel2Mesh prediction or an uploaded result.</p>
  </section>
}
