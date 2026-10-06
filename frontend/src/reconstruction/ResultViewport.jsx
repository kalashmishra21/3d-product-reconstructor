import { Component, lazy, Suspense, useState } from 'react'
const ResultMeshScene = lazy(() => import('./ResultMeshScene.jsx'))

class ViewerBoundary extends Component {
  state = { failed: false }
  componentDidUpdate(previous) { if (previous.mesh !== this.props.mesh && this.state.failed) this.setState({ failed: false }) }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p className="result-static-state" role="status">The 3D view could not open. Your geometry and exports are still available.</p> : this.props.children }
}
export function ResultViewport({ mesh, objectName }) {
  const [mode, setMode] = useState('solid')
  const [view, setView] = useState('iso')
  const [fitVersion, setFitVersion] = useState(0)
  const [resetVersion, setResetVersion] = useState(0)
  const modes = [['solid','Solid'], ['wireframe','Wireframe'], ['vertices','Vertices']]
  return <div className="result-view-wrap">
    <div className="result-view-tools" aria-label="Mesh display controls">
      <div className="result-mode-group" role="group" aria-label="Mesh display mode">{modes.map(([value,label]) => <button key={value} type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div>
      <div className="result-camera-group" role="group" aria-label="Camera controls"><button type="button" className="result-fit" onClick={() => setFitVersion(v => v+1)} aria-label="Fit mesh in current view">Fit</button><button type="button" className="result-reset" onClick={() => { setView('iso'); setResetVersion(v => v+1) }} aria-label="Reset to isometric view">Reset</button></div>
    </div>
    <div className="result-view-presets" role="group" aria-label="Camera view presets">{[['iso','ISO'],['front','Front'],['side','Side'],['top','Top']].map(([value,label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setResetVersion(v => v+1) }}>{label}</button>)}<span>{mode.toUpperCase()} / STAGE 03</span></div>
    <div className="result-stage-canvas" role="group" aria-label={`${objectName || 'Reconstructed object'} real Stage-3 mesh. Drag to rotate, scroll or pinch to zoom. Camera presets and Fit are available above.`}>
      <ViewerBoundary mesh={mesh}><Suspense fallback={<p className="result-static-state" role="status">Preparing real Stage-3 geometry…</p>}><ResultMeshScene mesh={mesh} mode={mode} view={view} fitVersion={fitVersion} resetVersion={resetVersion} /></Suspense></ViewerBoundary>
    </div>
    <div className="result-view-caption"><span aria-live="polite">{mode.toUpperCase()} · {view.toUpperCase()} VIEW</span><span>DRAG TO ORBIT · SCROLL TO ZOOM</span></div>
  </div>
}
