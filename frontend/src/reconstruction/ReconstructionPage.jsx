import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { DashboardIcon as Icon } from '../dashboard/DashboardIcon'
import { preflightErrorMessage, preflightImage } from '../lib/preflight'
import { inferImage, inferenceErrorMessage } from '../lib/inference'
import { formatBytes, inspectImageFile } from './image'
import { InputViewport } from './InputViewport'
import { ResultViewport } from './ResultViewport'
import { ExportPanel } from './ExportPanel'
import { deriveObjectName, formatMilliseconds, validateMeshResponse } from './mesh'
import { diagnoseMesh } from './meshDiagnostics'
import './reconstruction.css'

const steps = ['IMAGE', 'PREFLIGHT', 'MESH', 'EXPORT']

export function ReconstructionPage() {
  const input = useRef(null)
  const request = useRef(null)
  const selectionVersion = useRef(0)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [selection, setSelection] = useState(null)
  const [objectName, setObjectName] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [phase, setPhase] = useState('empty')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(null)
  const [mesh, setMesh] = useState(null)
  const [inferencePhase, setInferencePhase] = useState('idle')
  const [inferenceError, setInferenceError] = useState('')
  const [resultView, setResultView] = useState('mesh')
  const exportAvailable = useMemo(() => Boolean(mesh) && !validateMeshResponse(mesh), [mesh])
  const diagnostic = useMemo(() => mesh ? diagnoseMesh(mesh.vertices) : null, [mesh])

  useEffect(() => {
    if (!selection?.file) { setPreviewUrl(''); return }
    const url = URL.createObjectURL(selection.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selection?.file])

  useEffect(() => () => request.current?.abort(), [])

  function reset() {
    selectionVersion.current += 1
    request.current?.abort()
    request.current = null
    if (input.current) input.current.value = ''
    setSelection(null)
    setObjectName('')
    setVerified(null)
    setMesh(null)
    setInferencePhase('idle')
    setInferenceError('')
    setResultView('mesh')
    setError('')
    setPhase('empty')
  }

  async function selectFile(file) {
    if (!file) return
    const version = ++selectionVersion.current
    request.current?.abort()
    setSelection(null)
    setObjectName(deriveObjectName(file.name))
    setVerified(null)
    setMesh(null)
    setInferencePhase('idle')
    setInferenceError('')
    setResultView('mesh')
    setError('')
    setPhase('checking')
    try {
      const inspected = await inspectImageFile(file)
      if (version !== selectionVersion.current) return
      setSelection(inspected)
      setPhase('selected')
    } catch (failure) {
      if (version !== selectionVersion.current) return
      setError(failure.message)
      setPhase('error')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 1) {
      setError('Select one image at a time.')
      setPhase('error')
      return
    }
    selectFile(files[0])
  }

  async function runPreflight() {
    if (!selection || phase === 'submitting') return
    const version = selectionVersion.current
    const controller = new AbortController()
    request.current = controller
    setError('')
    setVerified(null)
    setMesh(null)
    setInferencePhase('idle')
    setInferenceError('')
    setResultView('mesh')
    setPhase('submitting')
    try {
      const result = await preflightImage(selection.file, { signal: controller.signal })
      if (version !== selectionVersion.current || controller.signal.aborted) return
      setVerified(result)
      setPhase('ready')
    } catch (failure) {
      if (version !== selectionVersion.current || controller.signal.aborted) return
      setError(preflightErrorMessage(failure))
      setPhase('error')
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  async function runInference() {
    if (!selection || !verified || inferencePhase === 'running') return
    const version = selectionVersion.current
    const controller = new AbortController()
    request.current = controller
    setInferenceError('')
    setMesh(null)
    setInferencePhase('running')
    try {
      const result = await inferImage(selection.file, { signal: controller.signal })
      if (version !== selectionVersion.current || controller.signal.aborted) return
      setMesh(result)
      setResultView('mesh')
      setInferencePhase('complete')
    } catch (failure) {
      if (version !== selectionVersion.current || controller.signal.aborted) return
      setInferenceError(inferenceErrorMessage(failure))
      setInferencePhase('error')
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  return <div className="recon-page">
    <div className="recon-main">
      <div className="recon-heading">
        <div><p className="recon-eyebrow"><span />RECONSTRUCTION STUDIO</p><h1>Give an image <em>dimension.</em></h1><p className="recon-intro">Prepare a view. Inspect the model geometry. Export an asset.</p></div>
        <Link className="workspace-link" to="/model">Model baseline <Arrow diagonal /></Link>
      </div>

      <div className="recon-workspace">
        <section className="recon-control-panel" aria-labelledby="recon-upload-title">
          <div className="recon-panel-heading"><span className="recon-panel-number">01</span><div><p className="recon-eyebrow">SOURCE IMAGE</p><h2 id="recon-upload-title">Select your view.</h2></div></div>
          <p className="recon-panel-intro">A single clear RGB product image gives the model its starting point. This stage checks the input only.</p>
          <p className="recon-domain-note">Best results come from object categories and views similar to the model's ShapeNet training data.</p>

          <div className={'recon-drop' + (dragging ? ' is-dragging' : '') + (selection ? ' has-image' : '')}
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}
            onDrop={handleDrop}>
            <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a product image" onChange={(event) => selectFile(event.target.files?.[0])} tabIndex={-1} />
            <div className="recon-drop-symbol" aria-hidden="true"><Icon name="image" /><span>+</span></div>
            <p className="recon-drop-title">{selection ? 'Image in workspace' : 'Place your image here.'}</p>
            <p className="recon-drop-copy">{selection ? 'Replace the image or continue to preflight.' : 'Drag one image into the studio, or browse your device.'}</p>
            <button type="button" className="recon-browse" onClick={() => input.current?.click()}>{selection ? 'Replace image' : 'Choose image'} <Arrow diagonal /></button>
            <span className="recon-drop-limit">JPEG / PNG / WEBP <span>·</span> MAX 10 MB</span>
          </div>

          {phase === 'checking' && <p className="recon-inline-state" role="status">Decoding image and checking dimensions…</p>}
          {error && <p className="recon-inline-error" role="alert">{error}</p>}
          {selection && <div className="recon-selection" aria-label="Selected image metadata">
            <div className="recon-selection-head"><span>LOCAL IMAGE</span><button type="button" onClick={reset}>Clear image</button></div>
            <label className="recon-object-field">OBJECT NAME<input type="text" value={objectName} onChange={(event) => setObjectName(event.target.value)} placeholder="Name this object" maxLength={80} /></label>
            <span className="recon-source-label">SOURCE FILE</span>
            <strong title={selection.file.name}>{selection.file.name}</strong>
            <dl><div><dt>Format</dt><dd>{selection.format}</dd></div><div><dt>Size</dt><dd>{formatBytes(selection.file.size)}</dd></div><div><dt>Resolution</dt><dd>{selection.width} × {selection.height}</dd></div></dl>
          </div>}

          <button className="recon-submit" type="button" onClick={runPreflight} disabled={!selection || phase === 'submitting' || inferencePhase === 'running'}>
            <span>{phase === 'submitting' ? 'VERIFYING INPUT…' : phase === 'ready' ? 'VERIFY AGAIN' : 'RUN PREFLIGHT'}</span><Arrow diagonal />
          </button>
          <p className="recon-submit-note">Preflight checks the image only. The model runs when you choose Reconstruct Mesh.</p>

          {verified && <div className="recon-ready" role="status" aria-live="polite">
            <p><span className="recon-ready-dot" />INPUT VERIFIED</p>
            <strong>{objectName || 'Ready for reconstruction.'}</strong>
            <span>{verified.width} × {verified.height} <i /> {verified.format} <i /> {formatBytes(verified.size_bytes)}</span>
            <small>Preflight passed. Run the trained model to produce a final Stage-3 mesh.</small>
          </div>}

          {verified && <button className="recon-infer" type="button" onClick={runInference} disabled={inferencePhase === 'running'}>
            <span>{inferencePhase === 'running' ? 'MODEL INFERENCE IN PROGRESS...' : mesh ? 'RECONSTRUCT AGAIN' : 'RECONSTRUCT MESH'}</span><Arrow diagonal />
          </button>}
          {inferencePhase === 'running' && <p className="recon-infer-note" role="status">Running the trained Pixel2Mesh model. The input preview remains visible; this is not a live mesh preview.</p>}
          {inferenceError && <p className="recon-inline-error" role="alert">{inferenceError}</p>}
          {mesh && <div className="recon-mesh-result" role="status" aria-live="polite">
            <p className="recon-eyebrow">MESH GENERATED / REAL MODEL OUTPUT</p>
            <strong>{objectName || 'Untitled object'} <span>— Stage 03 generated</span></strong>
            <dl><div><dt>Model</dt><dd>{mesh.model}</dd></div><div><dt>Vertices</dt><dd>{mesh.vertices_count.toLocaleString()}</dd></div><div><dt>Faces</dt><dd>{mesh.faces_count.toLocaleString()}</dd></div><div><dt>Inference</dt><dd>{mesh.latency_ms.toLocaleString()} ms</dd></div></dl>
            <div className="recon-timing"><span>Model load <b>{mesh.model_init_ms > 0 ? formatMilliseconds(mesh.model_init_ms) : 'READY / REUSED'}</b></span><span>Total request <b>{formatMilliseconds(mesh.total_ms)}</b></span></div>
            <small>Real model coordinates. Display fitting does not change exported geometry.</small>
          </div>}
          {mesh && <ExportPanel mesh={mesh} objectName={objectName} sourceFilename={selection?.file.name} />}
        </section>

        <section className={'recon-view-panel' + (mesh && resultView === 'mesh' ? ' is-result' : '')} aria-labelledby="recon-view-title">
          <div className="recon-view-header"><div><p className="recon-eyebrow">{mesh && resultView === 'mesh' ? 'REAL MODEL OUTPUT / 003' : 'SPATIAL INPUT STAGE / 001'}</p><h2 id="recon-view-title">{mesh && resultView === 'mesh' ? 'Real Stage-3 mesh' : 'Input inspection'}</h2></div><div className="recon-view-header-end">{mesh && resultView === 'input' && <button type="button" className="result-header-toggle" onClick={() => setResultView('mesh')}>View mesh</button>}<span className="recon-live-label">{inferencePhase === 'running' ? 'MODEL INFERENCE' : mesh && resultView === 'mesh' ? 'MESH GENERATED' : phase === 'ready' ? 'PREFLIGHT READY' : selection ? 'IMAGE LOADED' : 'AWAITING IMAGE'}</span></div></div>
          {mesh && resultView === 'mesh' && diagnostic?.degenerate && <div className="recon-volume-note" role="status"><strong>Low-volume reconstruction</strong><p>The current model produced limited geometric depth for this image.</p><span>Inspection and raw OBJ / GLB export remain available.</span></div>}
          {mesh && resultView === 'mesh' ? <ResultViewport mesh={mesh} objectName={objectName} onInput={() => setResultView('input')} /> : <InputViewport previewUrl={previewUrl} width={selection?.width} height={selection?.height} scanning={phase === 'submitting' || inferencePhase === 'running'} />}
          <div className="recon-view-foot"><span>{mesh && resultView === 'mesh' ? 'ACTUAL STAGE-3 GEOMETRY' : selection ? 'ACTUAL INPUT IMAGE / 2D PLANE' : 'PROCEDURAL SPATIAL GUIDE'}</span><span>{mesh && resultView === 'mesh' ? `${mesh.vertices_count.toLocaleString()} VERTICES / ${mesh.faces_count.toLocaleString()} FACES` : selection ? 'INPUT PREVIEW ONLY' : 'ILLUSTRATIVE — NOT MODEL OUTPUT'}</span></div>
        </section>
      </div>

      <nav className="recon-pipeline" aria-label="Reconstruction pipeline">
        <p className="recon-eyebrow">PROCESS / FOUR STAGES</p>
        <ol>{steps.map((step, index) => {
          const complete = index === 0 ? Boolean(selection) : index === 1 ? Boolean(verified) : index === 2 ? Boolean(mesh) : exportAvailable
          const current = index === 0 ? !selection : index === 1 ? Boolean(selection) && !verified : index === 2 && Boolean(verified) && !mesh
          return <li key={step} className={complete ? 'is-complete' : current ? 'is-current' : 'is-future'}><span>0{index + 1}</span><strong>{step}</strong><small>{index === 3 && complete ? 'AVAILABLE' : complete ? 'COMPLETE' : current ? 'CURRENT' : 'FUTURE'}</small></li>
        })}</ol>
      </nav>
    </div>
  </div>
}
