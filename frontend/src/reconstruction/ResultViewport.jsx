import { lazy, Suspense, useState } from 'react'

const ResultMeshScene = lazy(() => import('./ResultMeshScene.jsx'))

function Fallback() {
  return <div className="result-static-state" role="status">Preparing real Stage-3 geometry…</div>
}

export function ResultViewport({ mesh, objectName, onInput }) {
  const [mode, setMode] = useState('solid')
  const [fitVersion, setFitVersion] = useState(0)
  const modes = [
    ['solid', 'Solid'],
    ['wireframe', 'Wireframe'],
    ['vertices', 'Vertices'],
  ]

  return <div className="result-view-wrap">
    <div className="result-view-tools" aria-label="Mesh display controls">
      <div className="result-mode-group" role="group" aria-label="Mesh display mode">
        {modes.map(([value, label]) => <button
          key={value}
          type="button"
          className={mode === value ? 'is-active' : ''}
          aria-pressed={mode === value}
          onClick={() => setMode(value)}
        >{label}</button>)}
        <button type="button" onClick={onInput}>Input</button>
      </div>
      <button type="button" className="result-fit" onClick={() => setFitVersion((value) => value + 1)} aria-label="Reset and fit mesh view">Reset / Fit</button>
    </div>
    <div className="result-stage-canvas" aria-label={`${objectName || 'Reconstructed object'} real Stage-3 mesh`}>
      <Suspense fallback={<Fallback />}>
        <ResultMeshScene mesh={mesh} mode={mode} fitVersion={fitVersion} />
      </Suspense>
    </div>
    <div className="result-view-caption"><span>REAL MODEL OUTPUT / STAGE 03</span><span>ORBIT TO INSPECT MESH</span></div>
  </div>
}
